import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db";
import { bookingNotice, futureAvailabilitySlots, matchingSlot, meetingStateSchema, minimumAvailabilitySlots, slotLength, type MeetingState } from "@/lib/meeting-contract";

type MeetingRow = RowDataPacket & { id: string; revision: string; state: unknown; lease_token?: string };
const parseState = (row: MeetingRow) => meetingStateSchema.parse(typeof row.state === "string" ? JSON.parse(row.state) : row.state);
export function participantToken(id: string, userId: string) {
  const secret = process.env.WEBSITE_BOT_TOKEN;
  if (!secret) throw new Error("Meeting signing is not configured");
  return createHmac("sha256", secret).update(`xenon-meeting-v1:${id}:${userId}`).digest("hex");
}
export function validParticipantToken(id: string, userId: string, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token) || !process.env.WEBSITE_BOT_TOKEN) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(participantToken(id, userId)));
}
export async function getMeeting(id: string) {
  const [rows] = await getDbPool().execute<MeetingRow[]>("SELECT id, revision, state FROM discord_meetings WHERE id = ?", [id]);
  return rows[0] ? { revision: rows[0].revision, state: parseState(rows[0]), serverNow: Date.now() } : null;
}
export async function ensureMeeting(reference: string, guildId: string, managerIds: string[], includeHistorical = false) {
  const pool = getDbPool();
  const prefix = reference.split("-")[1];
  const table = prefix === "APP" ? "applications" : prefix === "CON" ? "contact_submissions" : "interest_submissions";
  const column = prefix === "INT" ? "reference_code" : "public_reference";
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT discord_username FROM ${table} WHERE ${column} = ?${includeHistorical ? "" : " AND created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)"}`, [reference],
  );
  const discord = rows[0]?.discord_username;
  if (!discord || !String(discord).trim()) return false;
  const start = Math.ceil((Date.now() + 2 * 60 * 60 * 1000) / slotLength) * slotLength;
  const state = meetingStateSchema.parse({ id: randomBytes(12).toString("hex"), reference, guildId, applicantDiscord: String(discord).trim(), applicantId: null,
    windowStart: start, windowEnd: start + 14 * 24 * 60 * 60 * 1000, status: "pending",
    participants: Array.from(new Set(managerIds)).map((userId) => ({ userId, kind: "manager", slots: [], responded: false, timezone: "UTC" })),
    attempts: 0, automaticRetries: 0, retryPaused: false, manualRetryRequested: false,
    failureReason: null, channelId: null, scheduledAt: null, attendeeIds: [], announcementId: null, completed: false });
  await pool.execute("INSERT IGNORE INTO discord_meetings (id, public_reference, guild_id, revision, state) VALUES (?, ?, ?, ?, ?)",
    [state.id, reference, guildId, randomUUID(), JSON.stringify(meetingStateSchema.parse(state))]);
  return true;
}
export async function claimMeetings(guildId: string) {
  const pool = getDbPool();
  const [rows] = await pool.execute<MeetingRow[]>(`SELECT id, revision, state FROM discord_meetings
    WHERE guild_id = ? AND finished_at IS NULL AND next_attempt_at <= NOW()
      AND (COALESCE(JSON_UNQUOTE(JSON_EXTRACT(state, '$.retryPaused')), 'false') <> 'true'
        OR JSON_UNQUOTE(JSON_EXTRACT(state, '$.manualRetryRequested')) = 'true')
      AND (leased_until IS NULL OR leased_until <= NOW()) ORDER BY next_attempt_at, id LIMIT 5`, [guildId]);
  const jobs = [];
  for (const row of rows) {
    const leaseToken = randomUUID();
    const [result] = await pool.execute<ResultSetHeader>(`UPDATE discord_meetings SET lease_token = ?, leased_until = DATE_ADD(NOW(), INTERVAL 2 MINUTE)
      WHERE id = ? AND revision = ? AND finished_at IS NULL AND (leased_until IS NULL OR leased_until <= NOW())
        AND (COALESCE(JSON_UNQUOTE(JSON_EXTRACT(state, '$.retryPaused')), 'false') <> 'true'
          OR JSON_UNQUOTE(JSON_EXTRACT(state, '$.manualRetryRequested')) = 'true')`, [leaseToken, row.id, row.revision]);
    if (result.affectedRows) {
      const state = parseState(row);
      if (!["accepted", "rejected", "closed"].includes(state.workflowStatus) && state.status !== "scheduled") {
        const { applyStandingAvailability } = await import("@/lib/meeting-portal");
        await applyStandingAvailability(state);
      }
      jobs.push({ state, revision: row.revision, leaseToken });
    }
  }
  return jobs;
}
export async function listHistoricalMeetingCandidates(after: string | null) {
  const [rows] = await getDbPool().execute<RowDataPacket[]>(`SELECT pending.reference, pending.submission_type, pending.subject, pending.status, pending.interests
    FROM (
      SELECT public_reference AS reference, 'application' AS submission_type, discord_username, NULL AS subject, NULL AS status, NULL AS interests FROM applications
      UNION ALL
      SELECT reference_code AS reference, 'interest' AS submission_type, discord_username, NULL AS subject, status, interests FROM interest_submissions
      UNION ALL
      SELECT public_reference AS reference, 'contact' AS submission_type, discord_username, subject, NULL AS status, NULL AS interests FROM contact_submissions
    ) AS pending
    LEFT JOIN discord_meetings AS meeting ON meeting.public_reference = pending.reference
    WHERE meeting.public_reference IS NULL AND pending.discord_username IS NOT NULL AND TRIM(pending.discord_username) <> ''
      AND (? IS NULL OR pending.reference > ?)
    ORDER BY pending.reference LIMIT 50`, [after, after]);
  return rows.map((row) => ({ reference: String(row.reference), type: String(row.submission_type),
    subject: row.subject == null ? null : String(row.subject), status: row.status == null ? null : String(row.status),
    ...(row.interests != null ? { interests: typeof row.interests === "string" ? JSON.parse(row.interests) : row.interests } : {}) }));
}
export async function listPausedMeetings(guildId: string) {
  const [rows] = await getDbPool().execute<MeetingRow[]>(`SELECT id, revision, state FROM discord_meetings
    WHERE guild_id = ? AND finished_at IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(state, '$.retryPaused')) = 'true'
    ORDER BY updated_at DESC, id LIMIT 50`, [guildId]);
  return rows.map((row) => {
    const state = parseState(row);
    return { id: state.id, reference: state.reference,
      attempts: state.attempts, automaticRetries: state.automaticRetries, failureReason: state.failureReason,
      queued: state.manualRetryRequested, expired: state.windowEnd <= Date.now() };
  });
}
export async function requestManualMeetingRetry(id: string, guildId: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await getMeeting(id);
    if (!current || current.state.guildId !== guildId) return "missing";
    const { state } = current;
    if (!state.retryPaused || state.completed || state.windowEnd <= Date.now()) return "closed";
    if (state.manualRetryRequested) return "queued";
    state.manualRetryRequested = true;
    const [result] = await getDbPool().execute<ResultSetHeader>(`UPDATE discord_meetings SET state = ?, revision = ?, next_attempt_at = NOW()
      WHERE id = ? AND guild_id = ? AND revision = ?`, [JSON.stringify(state), randomUUID(), id, guildId, current.revision]);
    if (result.affectedRows) return "queued";
  }
  return "conflict";
}
type JobIdentity = { id: string; guildId: string; revision: string; leaseToken: string };
type JobSave = { state: MeetingState; revision: string; leaseToken: string; release: boolean };
async function writeMeetingJob(pool: Pool | PoolConnection, input: JobSave) {
  const revision = randomUUID();
  const [result] = await pool.execute<ResultSetHeader>(`UPDATE discord_meetings SET state = ?, revision = ?,
    finished_at = IF(?, NOW(), NULL), next_attempt_at = DATE_ADD(NOW(), INTERVAL 2 MINUTE),
    leased_until = IF(?, NULL, DATE_ADD(NOW(), INTERVAL 2 MINUTE)), lease_token = IF(?, NULL, lease_token)
    WHERE id = ? AND revision = ? AND lease_token = ? AND leased_until > NOW() AND guild_id = ? AND public_reference = ?
      ${input.state.status === "scheduled" ? "" : "AND CONVERT(JSON_UNQUOTE(JSON_EXTRACT(state, '$.status')) USING utf8mb4) COLLATE utf8mb4_unicode_ci <> 'scheduled'"}`,
  [JSON.stringify(input.state), revision, input.state.completed, input.release, input.release, input.state.id, input.revision, input.leaseToken, input.state.guildId, input.state.reference]);
  return result.affectedRows ? revision : null;
}
async function withBookingLock<T>(operation: (connection: PoolConnection) => Promise<T>) {
  const connection = await getDbPool().getConnection();
  let locked = false, reusable = true;
  try {
    // One short database-scoped lock protects choices across workers and meetings.
    reusable = false;
    const [rows] = await connection.execute<RowDataPacket[]>("SELECT GET_LOCK(CONCAT('xenon-meetings:', MD5(DATABASE())), 10) AS acquired");
    reusable = true;
    locked = Number(rows[0]?.acquired) === 1;
    if (!locked) throw new Error("Meeting booking lock is unavailable");
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try { await connection.rollback(); } catch { reusable = false; }
    throw error;
  } finally {
    if (locked && reusable) {
      try {
        const [rows] = await connection.execute<RowDataPacket[]>("SELECT RELEASE_LOCK(CONCAT('xenon-meetings:', MD5(DATABASE()))) AS released");
        reusable = Number(rows[0]?.released) === 1;
      } catch { reusable = false; }
    }
    if (reusable) connection.release(); else connection.destroy();
  }
}
async function lockedMeeting(connection: PoolConnection, input: JobIdentity) {
  const [rows] = await connection.execute<MeetingRow[]>(`SELECT id, revision, state FROM discord_meetings
    WHERE id = ? AND guild_id = ? AND revision = ? AND lease_token = ? AND leased_until > NOW() FOR UPDATE`,
  [input.id, input.guildId, input.revision, input.leaseToken]);
  return rows[0] ? { state: parseState(rows[0]), revision: rows[0].revision } : null;
}
async function busyMeetings(connection: PoolConnection, state: MeetingState) {
  const [rows] = await connection.execute<MeetingRow[]>(`SELECT state FROM discord_meetings WHERE id <> ?
    AND CAST(JSON_UNQUOTE(JSON_EXTRACT(state, '$.scheduledAt')) AS UNSIGNED) > ?
    AND CAST(JSON_UNQUOTE(JSON_EXTRACT(state, '$.scheduledAt')) AS UNSIGNED) < ?`,
  [state.id, state.windowStart - slotLength, state.windowEnd]);
  return rows.map(parseState).filter((other) => other.status === "scheduled" && other.scheduledAt !== null)
    .map((other) => ({ scheduledAt: other.scheduledAt!, attendeeIds: other.attendeeIds }));
}
export async function bookMeetingJob(input: JobIdentity) {
  return withBookingLock(async (connection) => {
    const current = await lockedMeeting(connection, input);
    if (!current) return null;
    const state = current.state;
    if (["accepted", "rejected", "closed"].includes(state.workflowStatus) || state.windowEnd <= Date.now()) return null;
    if (state.status === "scheduled") return current;
    if (!state.applicantId || !state.participants.every((person) => person.responded)) return null;
    const match = matchingSlot(state, Date.now(), await busyMeetings(connection, state));
    if (match) {
      state.status = "scheduled"; state.workflowStatus = "meeting"; state.scheduledAt = match.at; state.attendeeIds = match.attendeeIds;
    } else state.status = "no_match";
    const revision = await writeMeetingJob(connection, { ...input, state, release: false });
    return revision ? { state, revision } : null;
  });
}
export async function saveMeetingJob(input: JobSave) {
  if (input.state.status !== "scheduled") return writeMeetingJob(getDbPool(), input);
  return withBookingLock(async (connection) => {
    const current = await lockedMeeting(connection, { ...input, id: input.state.id, guildId: input.state.guildId });
    if (!current) return null;
    if (current.state.status === "scheduled") {
      if (current.state.scheduledAt !== input.state.scheduledAt || JSON.stringify(current.state.attendeeIds) !== JSON.stringify(input.state.attendeeIds)) return null;
    } else {
      // Older bot versions cannot bypass the same conflict check through save.
      if (["accepted", "rejected", "closed"].includes(current.state.workflowStatus)) return null;
      const match = matchingSlot(current.state, Date.now(), await busyMeetings(connection, current.state));
      if (!match || match.at !== input.state.scheduledAt || JSON.stringify(match.attendeeIds) !== JSON.stringify(input.state.attendeeIds)) return null;
    }
    return writeMeetingJob(connection, input);
  });
}
export async function saveAvailability(id: string, userId: string, slots: number[], timezone: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await getMeeting(id);
    if (!current) return "missing";
    const { state } = current;
    const person = state.participants.find((row) => row.userId === userId);
    if (!person) return "missing";
    const now = Date.now();
    if (["accepted", "rejected", "closed"].includes(state.workflowStatus) || state.status === "scheduled" || state.windowEnd <= now) return "closed";
    const future = slots.filter((slot) => slot >= now + bookingNotice);
    if (future.some((slot) => slot < state.windowStart || slot >= state.windowEnd || slot % slotLength !== 0)) return "invalid";
    const selected = futureAvailabilitySlots(future, state.windowStart, state.windowEnd, now);
    // An explicit empty response means unavailable; expired selections must not become that response.
    if (slots.length > 0 && selected.length < minimumAvailabilitySlots) return "too_few";
    person.slots = selected; person.responded = true; person.timezone = timezone;
    person.source = "meeting"; person.respondedAt = Date.now();
    state.lastAction = { actorId: userId, kind: "availability_submitted", at: Date.now() };
    state.status = "collecting"; state.completed = false;
    const [result] = await getDbPool().execute<ResultSetHeader>(`UPDATE discord_meetings SET state = ?, revision = ?, finished_at = NULL, next_attempt_at = NOW()
      WHERE id = ? AND revision = ?`, [JSON.stringify(state), randomUUID(), id, current.revision]);
    if (result.affectedRows) return { status: "saved" as const, slots: selected, serverNow: Date.now() };
  }
  return "conflict";
}
