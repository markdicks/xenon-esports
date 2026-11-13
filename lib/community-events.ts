import { randomBytes, randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { getDbPool } from "@/lib/db";
import { choiceSchema, defaultEvents, eventIds, eventSettingsSchema, preShowSchema, registrationStatusSchema, valorantEventId, type EventId, type EventSettings, type PollChoice, type PreShowInput, type PublicEvent } from "@/lib/community-contract";
import { communityError, communityHash } from "@/lib/community-security";

const decode = (value: unknown) => typeof value === "string" ? JSON.parse(value) : value;
function settings(value: unknown) {
  const parsed = decode(value);
  for (const key of ["pollOpen", "registrationOpen"]) if (parsed[key] === 0 || parsed[key] === 1) parsed[key] = Boolean(parsed[key]);
  return eventSettingsSchema.parse(parsed);
}
async function results(eventId: EventId) {
  const [rows] = await getDbPool().execute<RowDataPacket[]>("SELECT choice, COUNT(*) AS votes FROM community_poll_votes WHERE event_id = ? GROUP BY choice", [eventId]);
  const votes = { "skirmish-2v2": 0, "standard-5v5": 0 };
  for (const row of rows) {
    const count = Number(row.votes);
    if (!Object.hasOwn(votes, row.choice) || !Number.isSafeInteger(count) || count < 0) throw new Error("Invalid recorded poll counts");
    votes[row.choice as PollChoice] = count;
  }
  return { votes, total: votes["skirmish-2v2"] + votes["standard-5v5"] };
}
export async function publicCommunityEvent(id: EventId, includeResults = true): Promise<PublicEvent> {
  try {
    const [rows] = await getDbPool().execute<RowDataPacket[]>("SELECT settings FROM community_events WHERE id = ?", [id]);
    if (!rows[0]) throw new Error("Event not configured");
    return { id, game: defaultEvents[id].game, available: true, settings: settings(rows[0].settings), results: includeResults && id === valorantEventId ? await results(id) : null };
  } catch {
    return { id, game: defaultEvents[id].game, available: false, settings: structuredClone(defaultEvents[id].settings), results: null };
  }
}
export const publicCommunityEvents = () => Promise.all(eventIds.map((id) => publicCommunityEvent(id, false)));
async function transaction<T>(id: EventId, operation: (connection: PoolConnection, event: { settings: EventSettings; revision: string }) => Promise<T>) {
  const connection = await getDbPool().getConnection();
  try {
    await connection.beginTransaction();
    // All voting/configuration/selection changes share this short per-event lock.
    const [rows] = await connection.execute<RowDataPacket[]>("SELECT revision, settings FROM community_events WHERE id = ? FOR UPDATE", [id]);
    if (!rows[0]) communityError("Community event services are temporarily unavailable.", 503);
    const result = await operation(connection, { settings: settings(rows[0].settings), revision: rows[0].revision });
    await connection.commit(); return result;
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}
async function rateLimit(connection: PoolConnection, action: string, networkHash: string, maximum: number) {
  const hour = Math.floor(Date.now() / 3600000), bucket = communityHash(`rate:${action}:${hour}:${networkHash}`);
  await connection.execute("INSERT INTO community_rate_limits (bucket, hits, expires_at) VALUES (?, 1, DATE_ADD(NOW(), INTERVAL 2 HOUR)) ON DUPLICATE KEY UPDATE hits = hits + 1", [bucket]);
  const [rows] = await connection.execute<RowDataPacket[]>("SELECT hits FROM community_rate_limits WHERE bucket = ?", [bucket]);
  if (Number(rows[0]?.hits) > maximum) communityError("Too many submissions from this network. Please try again later.", 429);
}
export async function recordedVote(voterHash: string) {
  const [rows] = await getDbPool().execute<RowDataPacket[]>("SELECT choice FROM community_poll_votes WHERE event_id = ? AND voter_hash = ?", [valorantEventId, voterHash]);
  return (rows[0]?.choice || null) as PollChoice | null;
}
export async function castCommunityVote(choice: PollChoice, voterHash: string, networkHash: string) {
  if (!choiceSchema.safeParse(choice).success) communityError("Choose one of the approved event formats.", 400);
  return transaction(valorantEventId, async (connection, event) => {
    const [existing] = await connection.execute<RowDataPacket[]>("SELECT choice FROM community_poll_votes WHERE event_id = ? AND voter_hash = ?", [valorantEventId, voterHash]);
    if (existing[0]) return { choice: existing[0].choice as PollChoice, alreadyRecorded: true };
    if (!event.settings.pollOpen || ["closed", "complete"].includes(event.settings.status)) communityError("Voting is currently closed.");
    await rateLimit(connection, "valorant-vote", networkHash, 3);
    await connection.execute("INSERT INTO community_poll_votes (event_id, choice, voter_hash) VALUES (?, ?, ?)", [valorantEventId, choice, voterHash]);
    return { choice, alreadyRecorded: false };
  });
}
export async function registerPreShow(input: PreShowInput, voterHash: string, networkHash: string) {
  input = preShowSchema.parse(input);
  const clean = { discordUsername: input.discordUsername, riotId: input.riotId, rank: input.rank, region: input.region, availability: input.availability, message: input.message, agreement: input.agreement };
  const normal = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/^<@!?(\d{17,20})>$/, "$1").replace(/^@/, "");
  const identityHash = communityHash(`registration:${normal(input.discordUsername)}:${normal(input.riotId)}`), payloadHash = communityHash(`payload:${JSON.stringify(clean)}`);
  return transaction(valorantEventId, async (connection, event) => {
    const [existing] = await connection.execute<RowDataPacket[]>("SELECT reference_code, voter_hash, payload_hash FROM community_registrations WHERE event_id = ? AND (request_id = ? OR identity_hash = ? OR voter_hash = ?) LIMIT 1", [valorantEventId, input.requestId, identityHash, voterHash]);
    if (existing[0]) {
      if (existing[0].voter_hash === voterHash && existing[0].payload_hash === payloadHash) return { reference: String(existing[0].reference_code) };
      communityError("An interest registration already exists with these details. Contact the organisers on Discord if it needs changing.");
    }
    if (!event.settings.registrationOpen || ["closed", "complete"].includes(event.settings.status)) communityError("Pre-show interest registration is currently closed.");
    await rateLimit(connection, "valorant-registration", networkHash, 8);
    for (let attempt = 0; attempt < 3; attempt++) {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", reference = `XEN-EVT-${Array.from(randomBytes(6), (byte) => alphabet[byte % alphabet.length]).join("")}`;
      try {
        await connection.execute(`INSERT INTO community_registrations (reference_code, event_id, revision, request_id, voter_hash, identity_hash, payload_hash,
          discord_username, riot_id, player_rank, region, availability, message, agreement, status, notified_user_ids)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'pending', JSON_ARRAY())`,
        [reference, valorantEventId, randomUUID(), input.requestId, voterHash, identityHash, payloadHash, input.discordUsername, input.riotId, input.rank, input.region, input.availability, input.message]);
        return { reference };
      } catch (error) { if ((error as { code?: string }).code !== "ER_DUP_ENTRY" || attempt === 2) throw error; }
    }
    throw new Error("Reference allocation failed");
  });
}
async function audit(connection: PoolConnection, eventId: EventId, actorId: string, action: string, detail: unknown, reference: string | null = null) {
  await connection.execute("INSERT INTO community_event_history (event_id, reference_code, actor_id, action, detail) VALUES (?, ?, ?, ?, ?)", [eventId, reference, actorId, action, JSON.stringify(detail)]);
}
export async function adminCommunityEvents() {
  const [rows] = await getDbPool().execute<RowDataPacket[]>("SELECT id, revision, settings FROM community_events ORDER BY id");
  return { events: rows.filter((row) => eventIds.includes(row.id)).map((row) => ({ id: row.id, game: defaultEvents[row.id as EventId].game, revision: row.revision, settings: settings(row.settings) })) };
}
export async function configureCommunityEvent(id: EventId, revision: string, value: EventSettings, actorId: string) {
  value = eventSettingsSchema.parse(value);
  if (id !== valorantEventId && (value.pollOpen || value.registrationOpen)) communityError("Voting and pre-show registration are available only for the Valorant event.", 400);
  if (["closed", "complete"].includes(value.status) && (value.pollOpen || value.registrationOpen)) communityError("Close voting and registration before closing this event.", 400);
  return transaction(id, async (connection, current) => {
    if (revision !== current.revision) communityError("Event settings changed. Reload before saving.");
    const next = randomUUID();
    await connection.execute("UPDATE community_events SET revision = ?, settings = ?, updated_by = ? WHERE id = ?", [next, JSON.stringify(value), actorId, id]);
    await audit(connection, id, actorId, "event_settings_changed", { before: current.settings, after: value });
    return { success: true, revision: next };
  });
}
export async function listPreShowRegistrations(status: string | null, before: number | null) {
  const [rows] = await getDbPool().execute<RowDataPacket[]>(`SELECT id, reference_code, revision, discord_username, status, created_at, notification_attempts, notification_sent_at
    FROM community_registrations WHERE event_id = ? AND (? IS NULL OR status = ?) AND (? IS NULL OR id < ?) ORDER BY id DESC LIMIT 26`, [valorantEventId, status, status, before, before]);
  const [counts] = await getDbPool().execute<RowDataPacket[]>("SELECT COUNT(*) AS accepted FROM community_registrations WHERE event_id = ? AND status = 'accepted'", [valorantEventId]);
  const page = rows.slice(0, 25);
  return { registrations: page.map((row) => ({ id: Number(row.id), reference: row.reference_code, revision: row.revision, discordUsername: row.discord_username, status: row.status,
    createdAt: new Date(row.created_at).toISOString(), notificationAttempts: row.notification_attempts, notified: Boolean(row.notification_sent_at) })),
    accepted: Number(counts[0].accepted), next: rows.length > 25 ? Number(page[24].id) : null };
}
export async function preShowDetail(reference: string) {
  const [rows] = await getDbPool().execute<RowDataPacket[]>(`SELECT reference_code, revision, discord_username, riot_id, player_rank, region, availability, message, status, created_at, notification_attempts, notification_sent_at
    FROM community_registrations WHERE event_id = ? AND reference_code = ?`, [valorantEventId, reference]);
  if (!rows[0]) communityError("Registration not found.", 404);
  const [history] = await getDbPool().execute<RowDataPacket[]>("SELECT actor_id, action, detail, created_at FROM community_event_history WHERE event_id = ? AND reference_code = ? ORDER BY id DESC LIMIT 25", [valorantEventId, reference]);
  return { registration: rows[0], history: history.map((row) => ({ actorId: row.actor_id, action: row.action, detail: decode(row.detail), at: new Date(row.created_at).toISOString() })) };
}
export async function selectPreShow(reference: string, revision: string, status: string, actorId: string) {
  if (!registrationStatusSchema.safeParse(status).success) communityError("Choose a valid registration status.", 400);
  return transaction(valorantEventId, async (connection) => {
    const [rows] = await connection.execute<RowDataPacket[]>("SELECT revision, status FROM community_registrations WHERE event_id = ? AND reference_code = ? FOR UPDATE", [valorantEventId, reference]);
    if (!rows[0]) communityError("Registration not found.", 404);
    if (rows[0].revision !== revision) communityError("This registration changed. Reload before selecting a status.");
    if (rows[0].status === status) return { success: true, revision };
    if (status === "accepted") {
      const [counts] = await connection.execute<RowDataPacket[]>("SELECT COUNT(*) AS accepted FROM community_registrations WHERE event_id = ? AND status = 'accepted'", [valorantEventId]);
      if (Number(counts[0].accepted) >= 6) communityError("Six players have already been accepted. Waitlist this player or free a place first.");
    }
    const next = randomUUID();
    await connection.execute("UPDATE community_registrations SET status = ?, revision = ? WHERE event_id = ? AND reference_code = ?", [status, next, valorantEventId, reference]);
    await audit(connection, valorantEventId, actorId, "registration_status_changed", { before: rows[0].status, after: status }, reference);
    return { success: true, revision: next };
  });
}
export async function claimCommunityNotifications() {
  const pool = getDbPool(), jobs = [];
  const [rows] = await pool.execute<RowDataPacket[]>(`SELECT reference_code FROM community_registrations WHERE notification_sent_at IS NULL AND notification_attempts < 16
    AND next_attempt_at <= NOW() AND (leased_until IS NULL OR leased_until <= NOW()) ORDER BY id LIMIT 5`);
  for (const row of rows) {
    const lease = randomUUID();
    const [claimed] = await pool.execute<ResultSetHeader>(`UPDATE community_registrations SET lease_token = ?, leased_until = DATE_ADD(NOW(), INTERVAL 2 MINUTE), notification_attempts = notification_attempts + 1
      WHERE reference_code = ? AND notification_sent_at IS NULL AND notification_attempts < 16 AND next_attempt_at <= NOW() AND (leased_until IS NULL OR leased_until <= NOW())`, [lease, row.reference_code]);
    if (!claimed.affectedRows) continue;
    const [saved] = await pool.execute<RowDataPacket[]>("SELECT reference_code, discord_username, status, created_at, notified_user_ids FROM community_registrations WHERE reference_code = ? AND lease_token = ?", [row.reference_code, lease]);
    if (saved[0]) jobs.push({ reference: saved[0].reference_code, discordUsername: saved[0].discord_username, event: "Xenon Valorant - 1v1 Pre-Show", status: saved[0].status,
      createdAt: new Date(saved[0].created_at).toISOString(), deliveredUserIds: decode(saved[0].notified_user_ids), leaseToken: lease });
  }
  return { registrations: jobs };
}
export async function acknowledgeCommunityNotification(input: { reference: string; leaseToken: string; deliveredUserIds: string[]; complete: boolean; release: boolean }) {
  const [result] = await getDbPool().execute<ResultSetHeader>(`UPDATE community_registrations SET notified_user_ids = ?, notification_sent_at = IF(?, NOW(), NULL),
    next_attempt_at = DATE_ADD(NOW(), INTERVAL 2 MINUTE), leased_until = IF(?, NULL, leased_until), lease_token = IF(?, NULL, lease_token)
    WHERE reference_code = ? AND lease_token = ? AND leased_until > NOW()`, [JSON.stringify(Array.from(new Set(input.deliveredUserIds))), input.complete, input.release, input.release, input.reference, input.leaseToken]);
  if (!result.affectedRows) communityError("Notification lease changed.");
  return { success: true };
}
export async function retryCommunityNotification(reference: string, actorId: string) {
  return transaction(valorantEventId, async (connection) => {
    const [result] = await connection.execute<ResultSetHeader>(`UPDATE community_registrations SET notification_attempts = 15, next_attempt_at = NOW()
      WHERE reference_code = ? AND event_id = ? AND notification_sent_at IS NULL AND (leased_until IS NULL OR leased_until <= NOW())`, [reference, valorantEventId]);
    if (!result.affectedRows) communityError("This notification is already delivered, in progress or missing.");
    await audit(connection, valorantEventId, actorId, "notification_retry", {}, reference); return { success: true };
  });
}
