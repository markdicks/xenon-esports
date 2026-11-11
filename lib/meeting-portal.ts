import { randomUUID } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { z } from "zod";
import { getDbPool } from "@/lib/db";
import { getMeeting } from "@/lib/meetings";
import { meetingFollowUp, meetingStateSchema, slotLength, type MeetingState } from "@/lib/meeting-contract";

export const routeKeys = ["application", "interest", "contact-partnerships", "contact-business", "contact-media", "contact-general-enquiry"] as const;
export type RouteKey = typeof routeKeys[number];
export const profileSchema = z.object({ enabled: z.boolean().default(true), timezone: z.string().max(100).refine((zone) => {
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; }
}), weeklySlots: z.array(z.number().int().min(0).max(335)).max(336).refine((slots) => new Set(slots).size === slots.length) }).strict();
export type AvailabilityProfile = z.infer<typeof profileSchema>;
export function expandWeeklyAvailability(profile: Pick<AvailabilityProfile, "timezone" | "weeklySlots">, start: number, end: number) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: profile.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], selected = new Set(profile.weeklySlots), slots = [];
  const indexAt = (at: number) => {
    const parts = formatter.formatToParts(at), part = (type: string) => parts.find((row) => row.type === type)!.value;
    return weekdays.indexOf(part("weekday")) * 48 + Number(part("hour")) * 2 + Math.floor(Number(part("minute")) / 30);
  };
  for (let at = start; at < end; at += slotLength) {
    if (selected.has(indexAt(at)) && selected.has(indexAt(at + slotLength - 1))) slots.push(at);
  }
  return slots;
}
export async function getStaffProfile(guildId: string, userId: string) {
  const [rows] = await getDbPool().execute<RowDataPacket[]>("SELECT timezone, weekly_slots FROM discord_staff_availability WHERE guild_id = ? AND user_id = ?", [guildId, userId]);
  return rows[0] ? profileSchema.parse({ timezone: rows[0].timezone, weeklySlots: typeof rows[0].weekly_slots === "string" ? JSON.parse(rows[0].weekly_slots) : rows[0].weekly_slots }) : null;
}
export async function saveStaffProfile(guildId: string, userId: string, profile: AvailabilityProfile) {
  const connection = await getDbPool().getConnection();
  try {
    await connection.beginTransaction();
    if (!profile.enabled) await connection.execute("DELETE FROM discord_staff_availability WHERE guild_id = ? AND user_id = ?", [guildId, userId]);
    else await connection.execute(`INSERT INTO discord_staff_availability (guild_id, user_id, timezone, weekly_slots) VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE timezone = VALUES(timezone), weekly_slots = VALUES(weekly_slots)`, [guildId, userId, profile.timezone, JSON.stringify(profile.weeklySlots)]);
    // Invalidate in-flight snapshots before they can book against old standing times.
    await connection.execute(`UPDATE discord_meetings SET revision = UUID(), finished_at = NULL, next_attempt_at = NOW()
      WHERE guild_id = ? AND JSON_SEARCH(state, 'one', ?, NULL, '$.participants[*].userId') IS NOT NULL
      AND JSON_UNQUOTE(JSON_EXTRACT(state, '$.status')) <> 'scheduled'
      AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(state, '$.workflowStatus')), 'new') NOT IN ('accepted','rejected','closed')`, [guildId, userId]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}
export async function applyStandingAvailability(state: MeetingState) {
  const people = state.participants.filter((row) => row.kind === "manager" && (!row.responded || row.source === "standing"));
  if (!people.length) return;
  let profiles: RowDataPacket[];
  try { [profiles] = await getDbPool().execute<RowDataPacket[]>(`SELECT user_id, timezone, weekly_slots FROM discord_staff_availability
    WHERE guild_id = ? AND user_id IN (${people.map(() => "?").join(",")})`, [state.guildId, ...people.map((person) => person.userId)]); }
  catch (error) { if ((error as { code?: string }).code === "ER_NO_SUCH_TABLE") return; throw error; }
  for (const person of people) {
    const saved = profiles.find((row) => row.user_id === person.userId);
    const profile = saved ? profileSchema.parse({ timezone: saved.timezone, weeklySlots: typeof saved.weekly_slots === "string" ? JSON.parse(saved.weekly_slots) : saved.weekly_slots }) : null;
    if (profile) { person.slots = expandWeeklyAvailability(profile, state.windowStart, state.windowEnd); person.responded = true; person.source = "standing"; person.timezone = profile.timezone; }
    else if (person.source === "standing") { person.slots = []; person.responded = false; person.source = "meeting"; }
  }
}
const sources = `SELECT public_reference AS reference, 'application' AS type, discord_username, NULL AS subject, created_at FROM applications
  UNION ALL SELECT reference_code, 'interest', discord_username, NULL, created_at FROM interest_submissions
  UNION ALL SELECT public_reference, 'contact', discord_username, subject, created_at FROM contact_submissions`;
export function submissionRoute(type: string, subject: string | null): RouteKey {
  if (type !== "contact") return type as RouteKey;
  const key = String(subject || "").toLowerCase().trim();
  return key === "partnerships" ? "contact-partnerships" : key === "business" ? "contact-business" : key === "media" ? "contact-media" : "contact-general-enquiry";
}
export async function portalSource(reference: string) {
  const [rows] = await getDbPool().execute<RowDataPacket[]>(`SELECT * FROM (${sources}) AS source WHERE reference = ?`, [reference]);
  return rows[0] || null;
}
export async function portalList(guildId: string, allowed: string[], before: string | null, status: string | null, search: string) {
  if (!allowed.length) return { items: [], next: null };
  const [rows] = await getDbPool().execute<RowDataPacket[]>(`SELECT meeting.id, meeting.revision, meeting.state, source.* FROM discord_meetings AS meeting
    JOIN (${sources}) AS source ON source.reference = meeting.public_reference
    WHERE meeting.guild_id = ? AND (? IS NULL OR (meeting.created_at, meeting.id) < (SELECT created_at, id FROM discord_meetings WHERE id = ? AND guild_id = ?)) AND (? = '' OR source.reference LIKE ? OR source.discord_username LIKE ?)
    AND (? IS NULL OR COALESCE(JSON_UNQUOTE(JSON_EXTRACT(meeting.state, '$.workflowStatus')), 'new') = ?)
    AND (CASE WHEN source.type <> 'contact' THEN source.type WHEN LOWER(TRIM(source.subject)) = 'partnerships' THEN 'contact-partnerships'
      WHEN LOWER(TRIM(source.subject)) = 'business' THEN 'contact-business' WHEN LOWER(TRIM(source.subject)) = 'media' THEN 'contact-media' ELSE 'contact-general-enquiry' END)
      IN (${allowed.map(() => "?").join(",")}) ORDER BY meeting.created_at DESC, meeting.id DESC LIMIT 26`,
  [guildId, before, before, guildId, search, `%${search}%`, `%${search}%`, status, status, ...allowed]);
  const page = rows.slice(0, 25);
  return { items: page.map((row) => {
    const state = meetingStateSchema.parse(typeof row.state === "string" ? JSON.parse(row.state) : row.state);
    return { id: row.id, reference: state.reference, type: row.type, discordUsername: row.discord_username,
      workflowStatus: state.workflowStatus, status: state.status, retryPaused: state.retryPaused,
      createdAt: new Date(row.created_at).toISOString(), ...meetingFollowUp(state, new Date(row.created_at).getTime()) };
  }), next: rows.length > 25 ? page[24].id as string : null };
}
export async function portalDetail(id: string, guildId: string, allowed: string[], historyBefore: number | null = null) {
  const current = await getMeeting(id);
  if (!current || current.state.guildId !== guildId) return null;
  const source = await portalSource(current.state.reference);
  if (!source || !allowed.includes(submissionRoute(source.type, source.subject))) return null;
  const [history] = await getDbPool().execute<RowDataPacket[]>(`SELECT id, actor_id, event_type, created_at,
    JSON_OBJECT('status', JSON_EXTRACT(detail, '$.status'), 'workflowStatus', JSON_EXTRACT(detail, '$.workflowStatus'),
      'attempts', JSON_EXTRACT(detail, '$.attempts'), 'retryPaused', JSON_EXTRACT(detail, '$.retryPaused')) AS detail FROM discord_meeting_history
    WHERE meeting_id = ? AND (? IS NULL OR id < ?) ORDER BY id DESC LIMIT 26`, [id, historyBefore, historyBefore]);
  const prefix = current.state.reference.split("-")[1], table = prefix === "APP" ? "applications" : prefix === "INT" ? "interest_submissions" : "contact_submissions";
  const [answers] = await getDbPool().execute<RowDataPacket[]>(`SELECT * FROM ${table} WHERE ${prefix === "INT" ? "reference_code" : "public_reference"} = ?`, [current.state.reference]);
  return { ...current, source: { type: source.type, createdAt: new Date(source.created_at).toISOString() }, answers: answers[0] || {},
    health: meetingFollowUp(current.state, new Date(source.created_at).getTime()),
    history: history.slice(0, 25).map((event) => ({ id: String(event.id), actorId: event.actor_id, kind: event.event_type,
      at: new Date(event.created_at).toISOString(), detail: (() => {
        const detail = typeof event.detail === "string" ? JSON.parse(event.detail) : event.detail;
        return { status: detail.status, workflowStatus: detail.workflowStatus, attempts: detail.attempts, retryPaused: detail.retryPaused };
      })() })),
    historyNext: history.length > 25 ? Number(history[24].id) : null };
}
export async function portalMutate(id: string, guildId: string, allowed: string[], actorId: string, revision: string, action: string, value?: string) {
  const current = await portalDetail(id, guildId, allowed);
  if (!current) return "missing";
  if (current.revision !== revision) return "conflict";
  const state = current.state;
  if (action === "status") {
    if (["accepted", "rejected", "closed"].includes(state.workflowStatus) && !["accepted", "rejected", "closed"].includes(value || "")) return "closed";
    if (state.status === "scheduled" && !["accepted", "closed", "rejected"].includes(value || "")) return "scheduled";
    state.workflowStatus = value as MeetingState["workflowStatus"];
    if (["accepted", "closed", "rejected"].includes(state.workflowStatus)) { state.completed = true; state.manualRetryRequested = false; }
  } else if (action === "resend" || action === "reopen") {
    if (state.status === "scheduled") return "scheduled";
    if (["accepted", "closed", "rejected"].includes(state.workflowStatus) && action !== "reopen") return "closed";
    if (action === "reopen" || state.windowEnd <= Date.now()) {
      state.windowStart = Math.ceil((Date.now() + 7200000) / slotLength) * slotLength; state.windowEnd = state.windowStart + 14 * 86400000;
      for (const person of state.participants) { person.slots = []; person.responded = false; person.source = "meeting"; delete person.invitation; person.resendGeneration++; }
    }
    const applicant = state.participants.find((person) => person.kind === "applicant");
    if (applicant) { applicant.resendRequested = true; applicant.resendGeneration++; applicant.responded = false; }
    state.workflowStatus = "reviewing"; state.status = "pending"; state.completed = false; state.manualRetryRequested = true;
  }
  state.lastAction = { actorId, kind: action === "status" ? `status:${value}` : action, at: Date.now() };
  const [result] = await getDbPool().execute<ResultSetHeader>(`UPDATE discord_meetings SET state = ?, revision = ?, finished_at = IF(?, NOW(), NULL), next_attempt_at = NOW()
    WHERE id = ? AND guild_id = ? AND revision = ?`, [JSON.stringify(state), randomUUID(), state.completed, id, guildId, revision]);
  return result.affectedRows ? "saved" : "conflict";
}
