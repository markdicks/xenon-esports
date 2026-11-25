import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db";
import { meetingStateSchema, type MeetingState } from "@/lib/meeting-contract";
import { outcomeSchema, type MeetingOutcome } from "@/lib/meeting-outcome-contract";

const parsed = (value: unknown) => typeof value === "string" ? JSON.parse(value) : value;
function fail(message: string, status = 409): never { throw Object.assign(new Error(message), { status }); }
function project(row: RowDataPacket) {
  const state = meetingStateSchema.parse(parsed(row.state));
  const outcome = outcomeSchema.parse(parsed(row.outcome_state) || {});
  return { revision: row.revision as string, meeting: {
    id: state.id, guildId: state.guildId, reference: state.reference, roundNumber: state.roundNumber,
    parentMeetingId: state.parentMeetingId, applicantId: state.applicantId, applicantDiscord: state.applicantDiscord,
    channelId: state.channelId, status: state.status, scheduledAt: state.scheduledAt, workflowStatus: state.workflowStatus,
    internal: Boolean(state.internal), topic: state.internal?.topic, departments: state.departments, lifecycle: state.lifecycle, deletion: state.deletion,
    attendeeIds: state.attendeeIds,
    participants: state.participants.map((person) => ({ userId: person.userId, kind: person.kind,
      deliveryFailure: person.deliveryFailure, resendGeneration: person.resendGeneration, reminderFailedAt: person.reminderFailedAt })),
  }, outcome: { status: outcome.status, recipientId: outcome.recipientId, followupId: outcome.followupId, deliveryFailure: outcome.deliveryFailure,
    proposals: outcome.proposals.map((proposal) => ({ version: proposal.version, summary: proposal.summary,
      roleNames: proposal.roleNames, authorId: proposal.authorId, at: proposal.at, response: proposal.response })) } };
}
const selection = `SELECT meeting.state, meeting.revision, outcome.state AS outcome_state FROM discord_meetings AS meeting
  LEFT JOIN discord_meeting_outcomes AS outcome ON outcome.meeting_id = meeting.id`;
export async function listMeetingLifecycle(guildId: string, after: string | null, participantId?: string) {
  // Include historical VCs, including internal meetings and completed outcomes.
  // Old channels are reconciled on startup; no age cutoff can strand an archive.
  const [rows] = await getDbPool().execute<RowDataPacket[]>(`${selection}
    WHERE meeting.guild_id = ? AND (? IS NULL OR meeting.id > ?)
    ${participantId ? "AND JSON_SEARCH(meeting.state, 'one', ?, NULL, '$.participants[*].userId') IS NOT NULL" : ""}
    ORDER BY meeting.id LIMIT 25`, [guildId, after, after, ...(participantId ? [participantId] : [])]);
  return { meetings: rows.map(project), next: rows.length === 25 ? project(rows.at(-1)!).meeting.id : null };
}
export async function readMeetingLifecycle(guildId: string, channelId: string) {
  const [rows] = await getDbPool().execute<RowDataPacket[]>(`${selection} WHERE meeting.guild_id = ?
    AND JSON_UNQUOTE(JSON_EXTRACT(meeting.state, '$.channelId')) = ? LIMIT 1`, [guildId, channelId]);
  if (!rows[0]) fail("This channel has no managed Xenon meeting.", 404);
  return project(rows[0]);
}
export async function dueMeetingAttendance(guildId: string) {
  const time = Date.now();
  const [rows] = await getDbPool().execute<RowDataPacket[]>(`${selection} WHERE meeting.guild_id = ?
    AND JSON_UNQUOTE(JSON_EXTRACT(meeting.state, '$.status')) = 'scheduled'
    AND CAST(JSON_UNQUOTE(JSON_EXTRACT(meeting.state, '$.scheduledAt')) AS UNSIGNED) > ?
    AND CAST(JSON_UNQUOTE(JSON_EXTRACT(meeting.state, '$.scheduledAt')) AS UNSIGNED) <= ?
    AND JSON_EXTRACT(meeting.state, '$.deletion') IS NULL
    AND (COALESCE(JSON_EXTRACT(meeting.state, '$.lifecycle.attendance.scheduledAt'), 0) <> JSON_EXTRACT(meeting.state, '$.scheduledAt')
      OR (JSON_EXTRACT(meeting.state, '$.lifecycle.attendance.checkedAt') IS NULL
        AND COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(meeting.state, '$.lifecycle.attendance.leaseUntil')) AS UNSIGNED), 0) <= ?))
    AND JSON_EXTRACT(meeting.state, '$.lifecycle.finishedAt') IS NULL AND JSON_EXTRACT(meeting.state, '$.lifecycle.cancellation.confirmedAt') IS NULL
    AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(meeting.state, '$.workflowStatus')), 'new') NOT IN ('closed', 'accepted', 'rejected')
    AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(outcome.state, '$.status')), 'watching') = 'watching'
    ORDER BY meeting.id LIMIT 100`, [guildId, time - 30 * 60000, time - 2 * 60000, time]);
  return { meetings: rows.map(project).filter(({ meeting, outcome }) => attendanceActive(meeting, outcome.status, time)
    && (meeting.lifecycle?.attendance?.scheduledAt !== meeting.scheduledAt || (!meeting.lifecycle.attendance.checkedAt && meeting.lifecycle.attendance.leaseUntil <= time))).slice(0, 25) };
}
function attendanceActive(state: { status: string; channelId: string | null; scheduledAt: number | null; workflowStatus: string; lifecycle?: MeetingState["lifecycle"]; deletion?: MeetingState["deletion"] }, outcomeStatus: string, time: number) {
  return state.status === "scheduled" && Boolean(state.channelId && state.scheduledAt) && time >= state.scheduledAt! + 2 * 60000
    && time < state.scheduledAt! + 30 * 60000 && !state.deletion && !["closed", "accepted", "rejected"].includes(state.workflowStatus)
    && !state.lifecycle?.finishedAt && !state.lifecycle?.cancellation?.confirmedAt && outcomeStatus === "watching";
}
type Change = { id: string; guildId: string; actorId?: string };
async function change(input: Change, kind: string, operation: (state: MeetingState, outcome: MeetingOutcome, revision: string) => void) {
  const connection = await getDbPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<RowDataPacket[]>("SELECT state, revision FROM discord_meetings WHERE id = ? AND guild_id = ? FOR UPDATE", [input.id, input.guildId]);
    if (!rows[0]) fail("Meeting not found.", 404);
    const state = meetingStateSchema.parse(parsed(rows[0].state));
    const [outcomes] = await connection.execute<RowDataPacket[]>("SELECT state FROM discord_meeting_outcomes WHERE meeting_id = ? FOR UPDATE", [input.id]);
    const outcome = outcomeSchema.parse(parsed(outcomes[0]?.state) || {}), before = JSON.stringify(state);
    operation(state, outcome, rows[0].revision);
    meetingStateSchema.parse(state);
    if (JSON.stringify(state) !== before) {
      if (input.actorId) state.lastAction = { actorId: input.actorId, kind, at: Date.now() };
      // Changing the revision invalidates any leased scheduling snapshot. Existing
      // history triggers preserve both staff confirmations in the same database.
      await connection.execute("UPDATE discord_meetings SET state = ?, revision = ? WHERE id = ? AND guild_id = ?",
        [JSON.stringify(state), randomUUID(), input.id, input.guildId]);
    }
    await connection.commit(); return { success: true, lifecycle: state.lifecycle };
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}
function cancellable(state: MeetingState, outcome: MeetingOutcome) {
  if (!state.channelId || state.status !== "scheduled") fail("Use /cancelmeeting in the current meeting voice channel's chat.");
  if (state.lifecycle?.finishedAt || state.lifecycle?.cancellation?.confirmedAt || state.workflowStatus === "closed"
    || ["accepted", "onboarded", "followup", "closed"].includes(outcome.status)) fail("This meeting has already finished or been cancelled.");
  if ((outcome.grant.leaseUntil || 0) > Date.now()) fail("Onboarding is being applied. Wait for that action to finish.");
}
export async function requestMeetingCancellation(input: Change & { actorId: string; revision: string; reason: string }) {
  return change(input, "cancellation_requested", (state, outcome, revision) => {
    cancellable(state, outcome);
    if (revision !== input.revision) fail("The meeting changed. Run /cancelmeeting again.");
    const pending = state.lifecycle?.cancellation;
    if (pending && pending.expiresAt > Date.now()) fail("A cancellation is already awaiting confirmation in the meeting chat.");
    state.lifecycle ??= { records: {} };
    state.lifecycle.cancellation = { token: randomUUID(), requestedBy: input.actorId, reason: input.reason,
      requestedAt: Date.now(), expiresAt: Date.now() + 10 * 60000 };
  });
}
export async function confirmMeetingCancellation(input: Change & { actorId: string; token: string; staff: boolean }) {
  return change(input, "meeting_cancelled", (state, outcome) => {
    const pending = state.lifecycle?.cancellation;
    if (!pending || pending.token !== input.token) fail("This cancellation request is no longer current.");
    if (pending.requestedBy === input.actorId) fail("Someone else must confirm the cancellation.", 403);
    const people = state.participants.map((person) => person.userId);
    if (people.length === 2 ? !people.includes(input.actorId) : !input.staff) fail("Another eligible staff member must confirm (the other participant for a two-person meeting).", 403);
    if (pending.confirmedAt) return;
    cancellable(state, outcome);
    if (pending.expiresAt <= Date.now()) fail("This cancellation request expired. Run /cancelmeeting again.");
    pending.confirmedBy = input.actorId; pending.confirmedAt = Date.now();
    state.workflowStatus = "closed"; state.completed = true; state.manualRetryRequested = false;
  });
}
export async function finishInternalMeeting(input: Change & { actorId: string; revision: string }) {
  return change(input, "internal_meeting_completed", (state, outcome, revision) => {
    if (!state.internal) fail("Use the existing meeting review controls to complete an applicant meeting.");
    if (revision !== input.revision) fail("The meeting changed. Try again.");
    cancellable(state, outcome);
    if (Date.now() < state.scheduledAt!) fail("This meeting has not started yet.");
    if (outcome.proposals.length) fail("This meeting has a proposal. Finish through the proposal response flow instead.");
    state.lifecycle ??= { records: {} }; state.lifecycle.finishedAt = Date.now();
    state.workflowStatus = "closed"; state.completed = true; state.manualRetryRequested = false;
  });
}
export async function saveLifecycleRecord(input: Change & { key: string; channelId: string; messageId: string }) {
  return change(input, "meeting_chat_recorded", (state) => {
    state.lifecycle ??= { records: {} };
    state.lifecycle.records[input.key] = { channelId: input.channelId, messageId: input.messageId };
  });
}
export async function claimMeetingAttendance(input: Change & { scheduledAt: number }) {
  return change(input, "attendance_check_started", (state, outcome) => {
    const time = Date.now(), current = state.lifecycle?.attendance;
    if (state.scheduledAt !== input.scheduledAt || !attendanceActive(state, outcome.status, time)) fail("This attendance check is no longer due.");
    if (current?.scheduledAt === input.scheduledAt && (current.checkedAt || current.leaseUntil > time)) fail("Attendance is already being checked.");
    state.lifecycle ??= { records: {} };
    state.lifecycle.attendance = { scheduledAt: input.scheduledAt, leaseToken: randomUUID(), leaseUntil: time + 60000 };
  });
}
export async function completeMeetingAttendance(input: Change & { scheduledAt: number; leaseToken: string; receipt?: { channelId: string; messageId: string } }) {
  return change(input, "attendance_checked", (state) => {
    const current = state.lifecycle?.attendance;
    if (!current || current.scheduledAt !== input.scheduledAt || current.leaseToken !== input.leaseToken || current.leaseUntil <= Date.now() || state.scheduledAt !== input.scheduledAt) fail("This attendance check changed.");
    current.checkedAt = Date.now();
    if (input.receipt) state.lifecycle!.records[`attendance-${input.scheduledAt}`] = input.receipt;
  });
}
