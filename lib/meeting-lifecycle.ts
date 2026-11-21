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
    channelId: state.channelId, scheduledAt: state.scheduledAt, workflowStatus: state.workflowStatus,
    internal: Boolean(state.internal), topic: state.internal?.topic, departments: state.departments, lifecycle: state.lifecycle,
    attendeeIds: state.attendeeIds,
    participants: state.participants.map((person) => ({ userId: person.userId, kind: person.kind,
      deliveryFailure: person.deliveryFailure, resendGeneration: person.resendGeneration, reminderFailedAt: person.reminderFailedAt })),
  }, outcome: { status: outcome.status, followupId: outcome.followupId, deliveryFailure: outcome.deliveryFailure,
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
