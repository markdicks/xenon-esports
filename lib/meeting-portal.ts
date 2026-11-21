import { randomUUID } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { z } from "zod";
import { getDbPool } from "@/lib/db";
import { getMeeting } from "@/lib/meetings";
import { meetingFollowUp, meetingStateSchema, slotLength, type MeetingState } from "@/lib/meeting-contract";
import { outcomeSchema } from "@/lib/meeting-outcome-contract";
import { interestRoutes, selectedInterestRoutes } from "@/data/interest-routing";
import { expandProfileAvailability, profileSchema, projectAvailabilityWeek, readAvailabilityProfile, slotsForWeek, writeAvailabilityProfile, type AvailabilityProfile } from "@/lib/availability-contract";
export { profileSchema } from "@/lib/availability-contract";
export type { AvailabilityProfile } from "@/lib/availability-contract";

export const routeKeys = ["application", "interest", "contact-partnerships", "contact-business", "contact-media", "contact-general-enquiry", ...interestRoutes.map(([key]) => key)] as const;
export type RouteKey = typeof routeKeys[number];
// Expressions are fixed SQL, never user input. Older tables and connection
// literals can have different defaults on Hostinger; normalize comparisons here.
const sqlText = (expression: string) => `CONVERT(${expression} USING utf8mb4) COLLATE utf8mb4_unicode_ci`;
export function portalFailure(error: unknown, action: string) {
  const databaseCode = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const failures: Record<string, [string, string]> = {
    ER_NO_SUCH_TABLE: ["PORTAL_TABLE_MISSING", action === "list"
      ? "A submission or meeting table is missing from the website database. Check migrations 001, 005 and 008 in the configured database."
      : "A required meeting table is missing from the website database. Check migrations 008 and 009 in the configured database."],
    ER_BAD_FIELD_ERROR: ["PORTAL_COLUMN_MISSING", "The website database schema does not match the meeting portal. Check the website log for the missing column."],
    ER_PARSE_ERROR: ["PORTAL_QUERY_FAILED", "The meeting portal database query failed. Check the website log; rerunning migration 009 may not resolve this."],
    ER_OPERAND_COLUMNS: ["PORTAL_QUERY_FAILED", "The meeting portal database query failed. Check the website log; rerunning migration 009 may not resolve this."],
    ER_CANT_AGGREGATE_2COLLATIONS: ["PORTAL_COLLATION_MISMATCH", "The portal query contains incompatible text collations. Check the website database log."],
    ER_CANT_AGGREGATE_3COLLATIONS: ["PORTAL_COLLATION_MISMATCH", "The portal query contains incompatible text collations. Check the website database log."],
    ER_CANT_AGGREGATE_NCOLLATIONS: ["PORTAL_COLLATION_MISMATCH", "The portal query contains incompatible text collations. Check the website database log."],
  };
  let failure = Object.hasOwn(failures, databaseCode) ? failures[databaseCode] : undefined;
  if (["ER_ACCESS_DENIED_ERROR", "ER_DBACCESS_DENIED_ERROR", "ER_TABLEACCESS_DENIED_ERROR", "ER_COLUMNACCESS_DENIED_ERROR", "ER_SPECIFIC_ACCESS_DENIED_ERROR", "ER_TRG_NO_DEFINER"].includes(databaseCode)) {
    failure = ["PORTAL_DATABASE_PERMISSIONS", "The website database user cannot access the meeting data or its triggers. Check database permissions in Hostinger."];
  }
  if (["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "ER_CON_COUNT_ERROR", "ER_TOO_MANY_USER_CONNECTIONS"].includes(databaseCode)) {
    failure = ["PORTAL_DATABASE_CONNECTION", "The website could not connect to its database. Check the Hostinger database connection log."];
  }
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    failure = ["PORTAL_INVALID_DATA", "A saved meeting contains invalid data. Check the website log before changing or deleting any records."];
  }
  const [code, message] = failure || ["PORTAL_UNAVAILABLE", "The meeting portal request failed. Check the website log for the failing action and diagnostic code."];
  // Log identifiers only, never SQL, bound submission answers or raw driver errors.
  const field = databaseCode === "ER_BAD_FIELD_ERROR" && error && typeof error === "object" && "sqlMessage" in error
    ? String(error.sqlMessage).match(/^Unknown column '([a-zA-Z0-9_.$]{1,80})'/)?.[1] : undefined;
  return { error: message, code, diagnostic: { action, code, databaseCode: failure && databaseCode ? databaseCode : undefined, field } };
}
export function expandWeeklyAvailability(profile: Pick<AvailabilityProfile, "timezone" | "weeklySlots">, start: number, end: number) {
  return expandProfileAvailability(profileSchema.parse(profile), start, end).slots;
}
export async function getStaffProfile(guildId: string, userId: string) {
  const [rows] = await getDbPool().execute<RowDataPacket[]>("SELECT timezone, weekly_slots FROM discord_staff_availability WHERE guild_id = ? AND user_id = ?", [guildId, userId]);
  return rows[0] ? readAvailabilityProfile(rows[0] as { timezone: unknown; weekly_slots: unknown }) : null;
}
export async function saveStaffProfile(guildId: string, userId: string, input: z.input<typeof profileSchema>) {
  const profile = profileSchema.parse(input), revision = randomUUID();
  const connection = await getDbPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<RowDataPacket[]>("SELECT timezone, weekly_slots FROM discord_staff_availability WHERE guild_id = ? AND user_id = ? FOR UPDATE", [guildId, userId]);
    const current = rows[0] ? readAvailabilityProfile(rows[0] as { timezone: unknown; weekly_slots: unknown }) : null;
    if ((current?.revision ?? null) !== profile.revision) throw Object.assign(new Error("Availability changed. Reload the saved schedule before saving again."), { code: "AVAILABILITY_CONFLICT" });
    if (!profile.enabled) await connection.execute("DELETE FROM discord_staff_availability WHERE guild_id = ? AND user_id = ?", [guildId, userId]);
    else await connection.execute(`INSERT INTO discord_staff_availability (guild_id, user_id, timezone, weekly_slots) VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE timezone = VALUES(timezone), weekly_slots = VALUES(weekly_slots)`, [guildId, userId, profile.timezone, writeAvailabilityProfile(profile, revision)]);
    // Invalidate in-flight snapshots before they can book against old standing times.
    await connection.execute(`UPDATE discord_meetings SET revision = UUID(), finished_at = NULL, next_attempt_at = NOW()
      WHERE guild_id = ? AND JSON_SEARCH(state, 'one', ?, NULL, '$.participants[*].userId') IS NOT NULL
      AND ${sqlText("JSON_UNQUOTE(JSON_EXTRACT(state, '$.status'))")} <> 'scheduled'
      AND ${sqlText("COALESCE(JSON_UNQUOTE(JSON_EXTRACT(state, '$.workflowStatus')), 'new')")} NOT IN ('accepted','rejected','closed')`, [guildId, userId]);
    await connection.commit();
    return profile.enabled ? { ...profile, revision } : null;
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}
export async function availabilityOverview(guildId: string, userIds: string[], weekStart: string) {
  if (!userIds.length) return [];
  const [rows] = await getDbPool().execute<RowDataPacket[]>(`SELECT user_id, timezone, weekly_slots, updated_at FROM discord_staff_availability
    WHERE guild_id = ? AND user_id IN (${userIds.map(() => "?").join(",")})`, [guildId, ...userIds]);
  return userIds.map((userId) => {
    const row = rows.find((value) => value.user_id === userId);
    if (!row) return { userId, timezone: null, mode: null, slots: null, gridSlots: [], unknownSlots: Array.from({ length: 336 }, (_, index) => index), updatedAt: null };
    const profile = readAvailabilityProfile(row as { timezone: unknown; weekly_slots: unknown });
    return { userId, timezone: profile.timezone, mode: profile.mode, slots: slotsForWeek(profile, weekStart),
      ...projectAvailabilityWeek(profile, weekStart), updatedAt: new Date(row.updated_at).toISOString() };
  });
}
export async function applyStandingAvailability(state: MeetingState) {
  const people = state.participants.filter((row) => (row.kind === "manager" || state.internal) && !row.availabilityWaivedAt && (!row.responded || row.source === "standing"));
  if (!people.length) return;
  let profiles: RowDataPacket[];
  try { [profiles] = await getDbPool().execute<RowDataPacket[]>(`SELECT user_id, timezone, weekly_slots FROM discord_staff_availability
    WHERE guild_id = ? AND user_id IN (${people.map(() => "?").join(",")})`, [state.guildId, ...people.map((person) => person.userId)]); }
  catch (error) { if ((error as { code?: string }).code === "ER_NO_SUCH_TABLE") return; throw error; }
  for (const person of people) {
    const saved = profiles.find((row) => row.user_id === person.userId);
    const profile = saved ? readAvailabilityProfile(saved as { timezone: unknown; weekly_slots: unknown }) : null;
    if (profile) { const expanded = expandProfileAvailability(profile, state.windowStart, state.windowEnd); person.slots = expanded.slots; person.responded = expanded.complete || expanded.slots.length > 0; person.source = "standing"; person.timezone = profile.timezone; }
    else if (person.source === "standing") { person.slots = []; person.responded = false; person.source = "meeting"; }
  }
}
const sources = `SELECT ${sqlText("public_reference")} AS reference, ${sqlText("'application'")} AS type,
    ${sqlText("discord_username")} AS discord_username, ${sqlText("NULL")} AS subject, created_at, ${sqlText("NULL")} AS interests FROM applications
  UNION ALL SELECT ${sqlText("reference_code")}, ${sqlText("'interest'")}, ${sqlText("discord_username")}, ${sqlText("NULL")}, created_at, ${sqlText("interests")} FROM interest_submissions
  UNION ALL SELECT ${sqlText("public_reference")}, ${sqlText("'contact'")}, ${sqlText("discord_username")}, ${sqlText("subject")}, created_at, ${sqlText("NULL")} FROM contact_submissions`;
export function submissionRoute(type: string, subject: string | null): RouteKey {
  if (type !== "contact") return type as RouteKey;
  const key = String(subject || "").toLowerCase().trim();
  return key === "partnerships" ? "contact-partnerships" : key === "business" ? "contact-business" : key === "media" ? "contact-media" : "contact-general-enquiry";
}
export async function portalSource(reference: string) {
  const [rows] = await getDbPool().execute<RowDataPacket[]>(`SELECT * FROM (${sources}) AS source WHERE reference = ?`, [reference]);
  return rows[0] || null;
}
type PortalAccess = { actorId: string; departments: string[]; viewAllInternal?: boolean; hideInternal?: boolean };
function departmentAccess(state: MeetingState, access?: PortalAccess) {
  return Boolean(access && state.departments.some((key) => access.departments.includes(key))
    && state.participants.some((person) => person.kind === "manager" && person.userId === access.actorId));
}
export async function portalList(guildId: string, allowed: string[], before: string | null, status: string | null, search: string, access?: PortalAccess) {
  if (!allowed.length && !access?.departments.length && (!access || access.hideInternal)) return { items: [], next: null };
  const departmentClause = access?.departments.length ? `OR (source.reference IS NOT NULL AND JSON_CONTAINS(JSON_EXTRACT(meeting.state, '$.participants'), JSON_OBJECT('kind', 'manager', 'userId', ?))
    AND (${access.departments.map(() => "JSON_CONTAINS(JSON_EXTRACT(meeting.state, '$.departments'), JSON_QUOTE(?))").join(" OR ")}))` : "";
  const areas = interestRoutes.filter(([key]) => allowed.includes(key)).map(([, label]) => label);
  const interestClause = areas.length ? `OR (source.type = 'interest' AND (${areas.map(() => "JSON_CONTAINS(source.interests, JSON_QUOTE(?))").join(" OR ")}))` : "";
  const internal = access && !access.hideInternal;
  const internalClause = internal ? `OR (meeting.public_reference LIKE 'XEN-MTG-%'
    AND (? = 1 OR JSON_CONTAINS(JSON_EXTRACT(meeting.state, '$.participants'), JSON_OBJECT('userId', ?))))` : "";
  const [rows] = await getDbPool().execute<RowDataPacket[]>(`SELECT meeting.id, meeting.revision, meeting.state,
    COALESCE(source.type, ${sqlText("'internal'")}) AS type,
    COALESCE(source.discord_username, ${sqlText("JSON_UNQUOTE(JSON_EXTRACT(meeting.state, '$.applicantDiscord'))")}) AS discord_username,
    COALESCE(source.created_at, meeting.created_at) AS created_at FROM discord_meetings AS meeting
    LEFT JOIN (${sources}) AS source ON source.reference = meeting.public_reference
    WHERE meeting.guild_id = ? AND (? IS NULL OR (meeting.created_at, meeting.id) < (SELECT created_at, id FROM discord_meetings WHERE id = ? AND guild_id = ?)) AND (LENGTH(?) = 0 OR meeting.public_reference LIKE ? OR COALESCE(source.discord_username, ${sqlText("JSON_UNQUOTE(JSON_EXTRACT(meeting.state, '$.applicantDiscord'))")}) LIKE ?)
    AND (? IS NULL OR ${sqlText("COALESCE(JSON_UNQUOTE(JSON_EXTRACT(meeting.state, '$.workflowStatus')), 'new')")} = ?)
    AND (${sqlText("(CASE WHEN source.type <> 'contact' THEN source.type WHEN LOWER(TRIM(source.subject)) = 'partnerships' THEN 'contact-partnerships' WHEN LOWER(TRIM(source.subject)) = 'business' THEN 'contact-business' WHEN LOWER(TRIM(source.subject)) = 'media' THEN 'contact-media' ELSE 'contact-general-enquiry' END)")}
      IN (${allowed.map(() => "?").join(",") || "NULL"}) ${interestClause} ${departmentClause} ${internalClause}) ORDER BY meeting.created_at DESC, meeting.id DESC LIMIT 26`,
  [guildId, before, before, guildId, search, `%${search}%`, `%${search}%`, status, status, ...allowed, ...areas,
    ...(access?.departments.length ? [access.actorId, ...access.departments] : []), ...(internal ? [Boolean(access.viewAllInternal), access.actorId] : [])]);
  const page = rows.slice(0, 25);
  const outcomes = new Map<string, { status: string; failed: boolean }>();
  if (page.length) {
    try {
      const [saved] = await getDbPool().execute<RowDataPacket[]>(`SELECT meeting_id, state FROM discord_meeting_outcomes WHERE meeting_id IN (${page.map(() => "?").join(",")})`, page.map((row) => row.id));
      for (const row of saved) { const value = outcomeSchema.parse(typeof row.state === "string" ? JSON.parse(row.state) : row.state); outcomes.set(row.meeting_id, { status: value.status, failed: Boolean(value.deliveryFailure) || value.deliveryPaused || value.grant.paused }); }
    } catch (error) { if ((error as { code?: string }).code !== "ER_NO_SUCH_TABLE") throw error; }
  }
  return { items: page.map((row) => {
    const state = meetingStateSchema.parse(typeof row.state === "string" ? JSON.parse(row.state) : row.state);
    return { id: row.id, reference: state.reference, type: row.type, discordUsername: row.discord_username,
      workflowStatus: state.workflowStatus, status: state.status, retryPaused: state.retryPaused,
      roundNumber: state.roundNumber, postMeetingStatus: outcomes.get(row.id)?.status, awaitingConfirmation: Boolean(state.nearTerm && !state.nearTerm.confirmed),
      createdAt: new Date(row.created_at).toISOString(), ...meetingFollowUp(state, new Date(row.created_at).getTime()),
      postMeetingDeliveryFailed: outcomes.get(row.id)?.failed || false };
  }), next: rows.length > 25 ? page[24].id as string : null };
}
export async function portalDetail(id: string, guildId: string, allowed: string[], historyBefore: number | null = null, access?: PortalAccess) {
  const current = await getMeeting(id);
  if (!current || current.state.guildId !== guildId) return null;
  const internal = current.state.internal;
  const source = internal ? { type: "internal", created_at: current.state.attentionSince ?? current.state.windowStart, subject: null, interests: null } : await portalSource(current.state.reference);
  if (!source || (internal ? !access || access.hideInternal || (!access.viewAllInternal && !current.state.participants.some((person) => person.userId === access.actorId))
    : !allowed.includes(submissionRoute(source.type, source.subject))
      && !(source.type === "interest" && selectedInterestRoutes(source.interests).some((key) => allowed.includes(key))) && !departmentAccess(current.state, access))) return null;
  const [history] = await getDbPool().execute<RowDataPacket[]>(`SELECT id, actor_id, event_type, created_at,
    JSON_OBJECT('status', JSON_EXTRACT(detail, '$.status'), 'workflowStatus', JSON_EXTRACT(detail, '$.workflowStatus'),
      'attempts', JSON_EXTRACT(detail, '$.attempts'), 'retryPaused', JSON_EXTRACT(detail, '$.retryPaused')) AS detail FROM discord_meeting_history
    WHERE meeting_id = ? AND (? IS NULL OR id < ?) ORDER BY id DESC LIMIT 26`, [id, historyBefore, historyBefore]);
  const prefix = current.state.reference.split("-")[1], table = prefix === "APP" ? "applications" : prefix === "INT" ? "interest_submissions" : "contact_submissions";
  const answers = internal ? [{ topic: internal.topic, ...(internal.recipientType === "discord" ? { recipient: "Discord member" } : { department: current.state.departments[0] }) }]
    : (await getDbPool().execute<RowDataPacket[]>(`SELECT * FROM ${table} WHERE ${prefix === "INT" ? "reference_code" : "public_reference"} = ?`, [current.state.reference]))[0];
  let outcome = null, outcomeEvents: unknown[] = [];
  if (!internal && access?.actorId !== current.state.applicantId) try {
    const [saved] = await getDbPool().execute<RowDataPacket[]>("SELECT state FROM discord_meeting_outcomes WHERE meeting_id = ?", [id]);
    outcome = saved[0] ? outcomeSchema.parse(typeof saved[0].state === "string" ? JSON.parse(saved[0].state) : saved[0].state) : null;
    const [events] = await getDbPool().execute<RowDataPacket[]>("SELECT actor_id, event_type, created_at FROM discord_meeting_outcome_events WHERE meeting_id = ? ORDER BY id DESC LIMIT 25", [id]);
    outcomeEvents = events.map((event) => ({ actorId: event.actor_id, kind: event.event_type, at: new Date(event.created_at).toISOString() }));
  } catch (error) { if ((error as { code?: string }).code !== "ER_NO_SUCH_TABLE") throw error; }
  return { ...current, outcome, outcomeEvents, source: { type: source.type, createdAt: new Date(source.created_at).toISOString() }, answers: answers[0] || {},
    health: meetingFollowUp(current.state, new Date(source.created_at).getTime()),
    history: history.slice(0, 25).map((event) => ({ id: String(event.id), actorId: event.actor_id, kind: event.event_type,
      at: new Date(event.created_at).toISOString(), detail: (() => {
        const detail = typeof event.detail === "string" ? JSON.parse(event.detail) : event.detail;
        return { status: detail.status, workflowStatus: detail.workflowStatus, attempts: detail.attempts, retryPaused: detail.retryPaused };
      })() })),
    historyNext: history.length > 25 ? Number(history[24].id) : null };
}
export async function portalMutate(id: string, guildId: string, allowed: string[], actorId: string, revision: string, action: string, value?: string, access?: PortalAccess) {
  const current = await portalDetail(id, guildId, allowed, null, access);
  if (!current) return "missing";
  if (current.revision !== revision) return "conflict";
  const state = current.state;
  if (state.lifecycle?.cancellation?.confirmedAt || state.lifecycle?.finishedAt) return "closed";
  if (action === "status") {
    if (["accepted", "rejected", "closed"].includes(state.workflowStatus) && !["accepted", "rejected", "closed"].includes(value || "")) return "closed";
    if (state.status === "scheduled" && !["accepted", "closed", "rejected"].includes(value || "")) return "scheduled";
    state.workflowStatus = value as MeetingState["workflowStatus"];
    if (["accepted", "closed", "rejected"].includes(state.workflowStatus)) { state.completed = true; state.manualRetryRequested = false; }
  } else if (action === "resend" || action === "reopen" || action === "reask") {
    if (state.status === "scheduled") return "scheduled";
    if (["accepted", "closed", "rejected"].includes(state.workflowStatus) && action !== "reopen") return "closed";
    const now = Date.now(), freshWindow = action === "reopen" || state.windowEnd <= now;
    if (freshWindow) {
      state.windowStart = Math.max(state.windowStart, Math.ceil((now + 7200000) / slotLength) * slotLength); state.windowEnd = state.windowStart + 14 * 86400000;
      for (const person of state.participants) { person.slots = []; person.responded = false; person.source = "meeting"; delete person.invitation; person.resendGeneration++; }
    }
    const applicant = state.participants.find((person) => person.kind === "applicant");
    const ask = action === "reask" ? state.participants.filter((person) => freshWindow || !person.responded || state.status === "no_match" || !person.slots.some((slot) => slot >= now + 7200000)) : [applicant].filter((person) => person != null);
    for (const person of ask) { person.resendRequested = true; person.resendGeneration++; person.responded = false; }
    for (const person of state.participants) if (freshWindow || ask.includes(person)) {
      delete person.availabilityRequestedAt; delete person.reminderSentAt; delete person.reminderFailedAt; delete person.availabilityWaivedAt;
      delete person.waiverDmAt; delete person.waiverStaffAt; delete person.noMatchNotice; delete person.outcome;
    }
    delete state.reuseAvailability;
    if (state.internal) state.nearTerm = null;
    state.attentionSince = now; delete state.attentionNotifiedAt;
    state.workflowStatus = "reviewing"; state.status = action === "reask" && applicant?.responded ? "collecting" : "pending";
    state.completed = false; state.manualRetryRequested = true;
  }
  state.lastAction = { actorId, kind: action === "status" ? `status:${value}` : action, at: Date.now() };
  const [result] = await getDbPool().execute<ResultSetHeader>(`UPDATE discord_meetings SET state = ?, revision = ?, finished_at = IF(?, NOW(), NULL), next_attempt_at = NOW()
    WHERE id = ? AND guild_id = ? AND revision = ?`, [JSON.stringify(state), randomUUID(), state.completed, id, guildId, revision]);
  return result.affectedRows ? "saved" : "conflict";
}
export async function portalAddManagers(id: string, guildId: string, allowed: string[], actorId: string, revision: string, managerIds: string[], access?: PortalAccess) {
  const current = await portalDetail(id, guildId, allowed, null, access);
  if (!current) return "missing";
  if (current.revision !== revision) return "conflict";
  const state = current.state;
  if (state.status === "scheduled" || state.windowEnd <= Date.now()) return "closed";
  if (["accepted", "rejected", "closed"].includes(state.workflowStatus)) return "closed";
  const ids = Array.from(new Set(managerIds)).filter((userId) => !state.participants.some((person) => person.userId === userId));
  if (!ids.length) return "saved";
  if (state.participants.length + ids.length + (state.applicantId ? 0 : 1) > 101) return "full";
  state.participants.push(...ids.map((userId) => ({ userId, kind: "manager" as const, slots: [], responded: false, timezone: "UTC", source: "meeting" as const,
    sendCount: 0, resendGeneration: 0, resendRequested: false })));
  if (state.applicantId) state.status = "collecting";
  state.completed = false;
  state.lastAction = { actorId, kind: "managers_added", at: Date.now() };
  const [result] = await getDbPool().execute<ResultSetHeader>(`UPDATE discord_meetings SET state = ?, revision = ?, finished_at = NULL, next_attempt_at = NOW()
    WHERE id = ? AND guild_id = ? AND revision = ?`, [JSON.stringify(state), randomUUID(), id, guildId, revision]);
  return result.affectedRows ? "saved" : "conflict";
}
export async function portalCorrectDiscord(id: string, guildId: string, allowed: string[], actorId: string, revision: string, discordUsername: string, access?: PortalAccess) {
  const current = await portalDetail(id, guildId, allowed, null, access);
  if (!current) return "missing";
  if (current.revision !== revision) return "conflict";
  const state = current.state, username = discordUsername.trim();
  if (state.internal) return "invalid";
  if (!username || username.length > 120) return "invalid";
  if (state.status === "scheduled") return "scheduled";
  if (["accepted", "rejected", "closed"].includes(state.workflowStatus)) return "closed";
  state.applicantDiscord = username; state.applicantId = null;
  state.participants = state.participants.filter((person) => person.kind === "manager");
  state.windowStart = Math.max(state.windowStart, Math.ceil((Date.now() + 7200000) / slotLength) * slotLength); state.windowEnd = state.windowStart + 14 * 86400000;
  for (const person of state.participants) {
    person.slots = []; person.responded = false; person.source = "meeting"; person.resendGeneration++;
    delete person.invitation; delete person.outcome; delete person.noMatchNotice; delete person.deliveryFailure;
    delete person.availabilityRequestedAt; delete person.reminderSentAt; delete person.reminderFailedAt; delete person.availabilityWaivedAt; delete person.waiverDmAt; delete person.waiverStaffAt;
  }
  state.status = "pending"; state.workflowStatus = "reviewing"; state.failureReason = null;
  state.completed = false; state.manualRetryRequested = true;
  delete state.reuseAvailability; delete state.attentionNotifiedAt; state.attentionSince = Date.now();
  state.lastAction = { actorId, kind: "discord_username_updated", at: Date.now() };
  const prefix = state.reference.split("-")[1], table = prefix === "APP" ? "applications" : prefix === "INT" ? "interest_submissions" : "contact_submissions";
  const column = prefix === "INT" ? "reference_code" : "public_reference";
  const connection = await getDbPool().getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute<ResultSetHeader>(`UPDATE discord_meetings SET state = ?, revision = ?, finished_at = NULL, next_attempt_at = NOW()
      WHERE id = ? AND guild_id = ? AND revision = ?`, [JSON.stringify(state), randomUUID(), id, guildId, revision]);
    if (!result.affectedRows) { await connection.rollback(); return "conflict"; }
    await connection.execute(`UPDATE ${table} SET discord_username = ? WHERE ${column} = ?`, [username, state.reference]);
    await connection.commit(); return "saved";
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}
