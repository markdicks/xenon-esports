import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db";
import { availabilityDayCount, bookingNotice, dueMeetingReminder, futureAvailabilitySlots, hour, matchingSlot, meetingRequestSchema, meetingStateSchema, minimumAvailabilityDays, minimumAvailabilitySlots, needsNearTermConfirmation, readyToMatch, slotLength, type MeetingState } from "@/lib/meeting-contract";
import type { z } from "zod";

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
export async function createInternalMeeting(request: z.input<typeof meetingRequestSchema>) {
  const input = meetingRequestSchema.parse(request);
  const id = createHash("sha256").update(JSON.stringify([input.guildId, input.actorId, input.requestId])).digest("hex").slice(0, 24);
  const reference = `XEN-MTG-${id.slice(0, 12).toUpperCase()}`, now = Date.now();
  const start = Math.ceil((now + bookingNotice) / slotLength) * slotLength;
  const state = meetingStateSchema.parse({ id, reference, guildId: input.guildId, applicantDiscord: input.requester, applicantId: input.actorId, departments: input.department ? [input.department] : [],
    internal: { topic: input.topic, recipientType: input.recipientType, deliveryCheckedAt: input.delivery.checkedAt }, submissionTopics: [input.topic], attentionSince: now,
    windowStart: start, windowEnd: start + 14 * 24 * hour, status: "pending",
    participants: [{ userId: input.actorId, kind: "applicant", slots: [], responded: false },
      ...Array.from(new Set(input.managerIds)).filter((userId) => userId !== input.actorId).map((userId) => ({ userId, kind: "manager", slots: [], responded: false }))],
    attempts: 0, failureReason: null, channelId: null, scheduledAt: null, attendeeIds: [], announcementId: null, completed: false,
    lastAction: { actorId: input.actorId, kind: "internal_meeting_requested", at: now } });
  const pool = getDbPool();
  const [result] = await pool.execute<ResultSetHeader>("INSERT IGNORE INTO discord_meetings (id, public_reference, guild_id, revision, state) VALUES (?, ?, ?, ?, ?)",
    [id, reference, input.guildId, randomUUID(), JSON.stringify(state)]);
  if (!result.affectedRows) {
    const saved = await getMeeting(id);
    if (!saved?.state.internal || saved.state.applicantId !== input.actorId || saved.state.guildId !== input.guildId) throw new Error("Internal meeting reference could not be reserved");
  }
  return { id, reference };
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
        const applicant = state.participants.find((person) => person.kind === "applicant");
        if (!state.internal && !state.parentMeetingId && !state.retryPaused && state.windowEnd > Date.now() && applicant?.responded && applicant.slots.length
          && availabilityDayCount(applicant.slots, applicant.timezone) < minimumAvailabilityDays) {
          applicant.responded = false; applicant.resendRequested = true; applicant.resendGeneration++;
        }
      }
      if (!state.internal && state.applicantId && !state.announcementId && !state.submissionTopics && !["accepted", "rejected", "closed"].includes(state.workflowStatus)) {
        const kind = state.reference.split("-")[1];
        const query = kind === "INT" ? "SELECT interests AS topic FROM interest_submissions WHERE reference_code = ?"
          : kind === "APP" ? "SELECT role AS topic FROM applications WHERE public_reference = ?" : "SELECT subject AS topic FROM contact_submissions WHERE public_reference = ?";
        const [topics] = await pool.execute<RowDataPacket[]>(query, [state.reference]);
        const raw = topics[0]?.topic;
        let values: unknown = raw == null ? [] : [raw];
        if (kind === "INT") { try { values = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { values = []; } }
        state.submissionTopics = Array.isArray(values) ? values.filter((value): value is string => typeof value === "string").slice(0, 15).map((value) => value.trim().slice(0, 160)).filter(Boolean) : [];
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
const unresolved = `CONVERT(JSON_UNQUOTE(JSON_EXTRACT(state, '$.status')) USING utf8mb4) COLLATE utf8mb4_unicode_ci <> 'scheduled'
  AND CONVERT(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(state, '$.workflowStatus')), 'new') USING utf8mb4) COLLATE utf8mb4_unicode_ci NOT IN ('accepted','rejected','closed')`;
export async function listMeetingAttention(guildId: string) {
  const [rows] = await getDbPool().execute<MeetingRow[]>(`SELECT id, revision, state FROM discord_meetings
    WHERE guild_id = ? AND created_at <= DATE_SUB(NOW(), INTERVAL 7 DAY) AND ${unresolved}
    AND JSON_EXTRACT(state, '$.attentionNotifiedAt') IS NULL
    AND COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(state, '$.attentionSince')) AS UNSIGNED), 0) <= ?
    ORDER BY created_at, id LIMIT 5`, [guildId, Date.now() - 7 * 24 * 60 * 60 * 1000]);
  return rows.map((row) => {
    const state = parseState(row);
    const reason = state.status === "expired" ? "The availability window expired without a booking."
      : state.retryPaused || state.failureReason ? "An availability invitation needs delivery review."
      : state.status === "no_match" || readyToMatch(state) ? "No shared meeting time has been booked."
      : "One or more availability responses are outstanding.";
    return { id: state.id, reference: state.reference, revision: row.revision, cycle: state.attentionSince ?? 0, reason };
  });
}
export async function acknowledgeMeetingAttention(id: string, guildId: string, revision: string) {
  const [result] = await getDbPool().execute<ResultSetHeader>(`UPDATE discord_meetings
    SET state = JSON_SET(state, '$.attentionNotifiedAt', ?), revision = ?
    WHERE id = ? AND guild_id = ? AND revision = ? AND ${unresolved} AND JSON_EXTRACT(state, '$.attentionNotifiedAt') IS NULL`,
  [Date.now(), randomUUID(), id, guildId, revision]);
  return Boolean(result.affectedRows);
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
    if (!readyToMatch(state)) return null;
    const busy = await busyMeetings(connection, state), now = Date.now(), match = matchingSlot(state, now, busy);
    if (match && needsNearTermConfirmation(state, match.at, now)) {
      if (state.nearTerm?.at !== match.at) state.nearTerm = { at: match.at, confirmed: false };
      state.status = "collecting";
    } else if (match) {
      state.status = "scheduled"; state.workflowStatus = "meeting"; state.scheduledAt = match.at; state.attendeeIds = match.attendeeIds;
      state.bookedAt = now; if (state.internal) state.nearTerm = null;
    } else {
      state.status = "no_match"; if (state.internal) state.nearTerm = null;
    }
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
      if (!match || needsNearTermConfirmation(current.state, match.at, Date.now()) || match.at !== input.state.scheduledAt || JSON.stringify(match.attendeeIds) !== JSON.stringify(input.state.attendeeIds)) return null;
    }
    return writeMeetingJob(connection, input);
  });
}
export async function decideNearTermMeeting(id: string, userId: string, at: number, confirm: boolean) {
  const current = await getMeeting(id);
  if (!current?.state.internal || current.state.applicantId !== userId) return "missing";
  const state = current.state;
  if (state.status === "scheduled" || ["accepted", "rejected", "closed"].includes(state.workflowStatus)
    || state.nearTerm?.at !== at || state.nearTerm.confirmed || at < Date.now() + bookingNotice
    || !state.participants.find((person) => person.userId === userId)?.slots.includes(at)) return "stale";
  if (confirm) state.nearTerm.confirmed = true;
  else { state.notBefore = Math.max(at + slotLength, Date.now() + 3 * hour + 1); state.nearTerm = null; }
  state.lastAction = { actorId: userId, kind: confirm ? "near_term_confirmed" : "near_term_skipped", at: Date.now() };
  const [result] = await getDbPool().execute<ResultSetHeader>(`UPDATE discord_meetings SET state = ?, revision = ?, finished_at = NULL, next_attempt_at = NOW()
    WHERE id = ? AND revision = ?`, [JSON.stringify(state), randomUUID(), id, current.revision]);
  return result.affectedRows ? "saved" : "stale";
}

export async function listMeetingReminders(guildId: string) {
  const now = Date.now();
  const at = "CAST(JSON_UNQUOTE(JSON_EXTRACT(state, '$.scheduledAt')) AS UNSIGNED)";
  const booked = "COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(state, '$.bookedAt')) AS UNSIGNED), UNIX_TIMESTAMP(updated_at) * 1000)";
  const [rows] = await getDbPool().execute<MeetingRow[]>(`SELECT id, revision, state, ${booked} AS booked_at FROM discord_meetings
    WHERE guild_id = ? AND ${at} > ? AND ${at} <= ?
    AND CONVERT(JSON_UNQUOTE(JSON_EXTRACT(state, '$.status')) USING utf8mb4) COLLATE utf8mb4_unicode_ci = 'scheduled'
    AND CONVERT(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(state, '$.workflowStatus')), 'new') USING utf8mb4) COLLATE utf8mb4_unicode_ci NOT IN ('closed','rejected','accepted')
    AND CHAR_LENGTH(JSON_UNQUOTE(JSON_EXTRACT(state, '$.announcementId'))) BETWEEN 17 AND 20
    AND (leased_until IS NULL OR leased_until <= NOW())
    AND ((${at} <= ? AND ${at} >= ${booked} + ? AND JSON_EXTRACT(state, '$.reminders.six') IS NULL)
      OR (${at} > ? AND ${at} >= ${booked} + ? AND JSON_EXTRACT(state, '$.reminders.day') IS NULL))
    ORDER BY ${at}, id LIMIT 5`, [guildId, now, now + 24 * hour, now + 6 * hour, 6 * hour, now + 6 * hour, 48 * hour]);
  const jobs = [];
  for (const row of rows) {
    const state = parseState(row), bookedAt = Number(row.booked_at), kind = dueMeetingReminder(state, bookedAt, now);
    if (!kind) continue;
    const leaseToken = randomUUID();
    const [claimed] = await getDbPool().execute<ResultSetHeader>(`UPDATE discord_meetings SET state = JSON_INSERT(state, '$.bookedAt', ?),
      lease_token = ?, leased_until = DATE_ADD(NOW(), INTERVAL 2 MINUTE)
      WHERE id = ? AND guild_id = ? AND revision = ? AND (leased_until IS NULL OR leased_until <= NOW())`, [bookedAt, leaseToken, state.id, guildId, row.revision]);
    if (claimed.affectedRows) jobs.push({ id: state.id, reference: state.reference, revision: row.revision, leaseToken,
      channelId: state.channelId, scheduledAt: state.scheduledAt, attendeeIds: state.attendeeIds, kind });
  }
  return jobs;
}
export async function acknowledgeMeetingReminder(id: string, guildId: string, revision: string, leaseToken: string, kind: "day" | "six") {
  const field = kind === "day" ? "$.reminders.day" : "$.reminders.six";
  const [result] = await getDbPool().execute<ResultSetHeader>(`UPDATE discord_meetings SET state = JSON_SET(
    JSON_INSERT(state, '$.reminders', JSON_OBJECT()), ?, ?), revision = ?, lease_token = NULL, leased_until = NULL
    WHERE id = ? AND guild_id = ? AND revision = ? AND lease_token = ? AND leased_until > NOW()`,
  [field, Date.now(), randomUUID(), id, guildId, revision, leaseToken]);
  return Boolean(result.affectedRows);
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
    if (selected.length && availabilityDayCount(selected, timezone) < minimumAvailabilityDays) return "too_few_days";
    person.slots = selected; person.responded = true; person.timezone = timezone;
    delete person.availabilityWaivedAt;
    person.source = "meeting"; person.respondedAt = Date.now();
    state.lastAction = { actorId: userId, kind: "availability_submitted", at: Date.now() };
    state.status = "collecting"; state.completed = false;
    const [result] = await getDbPool().execute<ResultSetHeader>(`UPDATE discord_meetings SET state = ?, revision = ?, finished_at = NULL, next_attempt_at = NOW()
      WHERE id = ? AND revision = ?`, [JSON.stringify(state), randomUUID(), id, current.revision]);
    if (result.affectedRows) return { status: "saved" as const, slots: selected, serverNow: Date.now() };
  }
  return "conflict";
}
