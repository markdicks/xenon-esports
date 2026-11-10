import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db";
import { meetingStateSchema, slotLength, type MeetingState } from "@/lib/meeting-contract";

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
export async function ensureMeeting(reference: string, guildId: string, managerIds: string[]) {
  const pool = getDbPool();
  const prefix = reference.split("-")[1];
  const table = prefix === "APP" ? "applications" : prefix === "CON" ? "contact_submissions" : "interest_submissions";
  const column = prefix === "INT" ? "reference_code" : "public_reference";
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT discord_username FROM ${table} WHERE ${column} = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)`, [reference],
  );
  const discord = rows[0]?.discord_username;
  if (!discord || !String(discord).trim()) return false;
  const start = Math.ceil((Date.now() + 2 * 60 * 60 * 1000) / slotLength) * slotLength;
  const state: MeetingState = { id: randomBytes(12).toString("hex"), reference, guildId, applicantDiscord: String(discord).trim(), applicantId: null,
    windowStart: start, windowEnd: start + 14 * 24 * 60 * 60 * 1000, status: "pending",
    participants: Array.from(new Set(managerIds)).map((userId) => ({ userId, kind: "manager", slots: [], responded: false, timezone: "UTC" })),
    attempts: 0, failureReason: null, channelId: null, scheduledAt: null, attendeeIds: [], announcementId: null, completed: false };
  await pool.execute("INSERT IGNORE INTO discord_meetings (id, public_reference, guild_id, revision, state) VALUES (?, ?, ?, ?, ?)",
    [state.id, reference, guildId, randomUUID(), JSON.stringify(meetingStateSchema.parse(state))]);
  return true;
}
export async function claimMeetings(guildId: string) {
  const pool = getDbPool();
  const [rows] = await pool.execute<MeetingRow[]>(`SELECT id, revision, state FROM discord_meetings
    WHERE guild_id = ? AND finished_at IS NULL AND next_attempt_at <= NOW()
      AND (leased_until IS NULL OR leased_until <= NOW()) ORDER BY next_attempt_at, id LIMIT 5`, [guildId]);
  const jobs = [];
  for (const row of rows) {
    const leaseToken = randomUUID();
    const [result] = await pool.execute<ResultSetHeader>(`UPDATE discord_meetings SET lease_token = ?, leased_until = DATE_ADD(NOW(), INTERVAL 2 MINUTE)
      WHERE id = ? AND revision = ? AND (leased_until IS NULL OR leased_until <= NOW())`, [leaseToken, row.id, row.revision]);
    if (result.affectedRows) jobs.push({ state: parseState(row), revision: row.revision, leaseToken });
  }
  return jobs;
}
export async function saveMeetingJob(input: { state: MeetingState; revision: string; leaseToken: string; release: boolean }) {
  const revision = randomUUID();
  const [result] = await getDbPool().execute<ResultSetHeader>(`UPDATE discord_meetings SET state = ?, revision = ?,
    finished_at = IF(?, NOW(), NULL), next_attempt_at = DATE_ADD(NOW(), INTERVAL 2 MINUTE),
    leased_until = IF(?, NULL, DATE_ADD(NOW(), INTERVAL 2 MINUTE)), lease_token = IF(?, NULL, lease_token)
    WHERE id = ? AND revision = ? AND lease_token = ? AND leased_until > NOW() AND guild_id = ? AND public_reference = ?`,
  [JSON.stringify(input.state), revision, input.state.completed, input.release, input.release, input.state.id, input.revision, input.leaseToken, input.state.guildId, input.state.reference]);
  return result.affectedRows ? revision : null;
}
export async function saveAvailability(id: string, userId: string, slots: number[], timezone: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await getMeeting(id);
    if (!current) return "missing";
    const { state } = current;
    const person = state.participants.find((row) => row.userId === userId);
    if (!person) return "missing";
    if (state.status === "scheduled" || state.windowEnd <= Date.now()) return "closed";
    if (slots.some((slot) => slot < Math.max(state.windowStart, Date.now() + 2 * 60 * 60 * 1000) || slot >= state.windowEnd || slot % slotLength !== 0)) return "invalid";
    person.slots = Array.from(new Set(slots)); person.responded = true; person.timezone = timezone;
    state.status = "collecting"; state.completed = false;
    const [result] = await getDbPool().execute<ResultSetHeader>(`UPDATE discord_meetings SET state = ?, revision = ?, finished_at = NULL, next_attempt_at = NOW()
      WHERE id = ? AND revision = ?`, [JSON.stringify(state), randomUUID(), id, current.revision]);
    if (result.affectedRows) return "saved";
  }
  return "conflict";
}
