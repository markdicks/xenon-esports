import { randomUUID } from "node:crypto";
import type { RowDataPacket, PoolConnection } from "mysql2/promise";
import { getDbPool } from "@/lib/db";
import { meetingStateSchema, type MeetingState } from "@/lib/meeting-contract";
import { outcomeSchema } from "@/lib/meeting-outcome-contract";
import { noteDeletionContext, deleteMeetingNotes } from "@/lib/meeting-notes";
const parsed = (value: unknown) => typeof value === "string" ? JSON.parse(value) : value;
function fail(message: string, status = 409): never { throw Object.assign(new Error(message), { status }); }
export async function readDeletionContext(id: string, guildId: string) {
  const [rows] = await getDbPool().execute<RowDataPacket[]>(`SELECT meeting.state, meeting.created_at, outcome.state AS outcome_state
    FROM discord_meetings AS meeting LEFT JOIN discord_meeting_outcomes AS outcome ON outcome.meeting_id = meeting.id WHERE meeting.id = ? AND meeting.guild_id = ?`, [id, guildId]);
  if (!rows[0]) fail("Meeting not found.", 404);
  const meeting = meetingStateSchema.parse(parsed(rows[0].state));
  if (!meeting.deletion) fail("This meeting has no deletion request.");
  const outcome = outcomeSchema.parse(parsed(rows[0].outcome_state) || {});
  const notes = await noteDeletionContext(id, guildId);
  return { meeting, createdAt: new Date(rows[0].created_at).getTime(), noteAuthors: notes.authors, receipts: [...notes.receipts, outcome.reviewMessage, ...outcome.proposals.map((proposal) => proposal.message)].filter(Boolean) };
}
async function mutate(id: string, guildId: string, actorId: string | null, kind: string, change: (state: MeetingState, revision: string, connection: PoolConnection) => void | Promise<void>) {
  const connection = await getDbPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<RowDataPacket[]>("SELECT state, revision FROM discord_meetings WHERE id = ? AND guild_id = ? FOR UPDATE", [id, guildId]);
    if (!rows[0]) fail("Meeting not found.", 404);
    const state = meetingStateSchema.parse(parsed(rows[0].state)); await change(state, rows[0].revision, connection);
    if (actorId) state.lastAction = { actorId, kind, at: Date.now() };
    await connection.execute("UPDATE discord_meetings SET state = ?, revision = ? WHERE id = ? AND guild_id = ?", [JSON.stringify(meetingStateSchema.parse(state)), randomUUID(), id, guildId]);
    await connection.commit(); return { success: true };
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}
export async function requestMeetingDeletion(input: { id: string; guildId: string; actorId: string; revision: string }) {
  return mutate(input.id, input.guildId, input.actorId, "meeting_deletion_requested", (state, revision) => {
    if (state.deletion) return;
    if (revision !== input.revision) fail("The meeting changed. Reload before deleting it.");
    state.deletion = { requestedBy: input.actorId, requestedAt: Date.now(), initialized: false, channelDeleted: false, scans: [] };
    state.workflowStatus = "closed"; state.completed = true; state.manualRetryRequested = false;
  });
}
export async function deletionProgress(input: { id: string; guildId: string; action: "init" | "channel-deleted" | "scan-progress" | "complete";
  channelIds?: string[]; channelId?: string; before?: string; done?: boolean }) {
  return mutate(input.id, input.guildId, null, "meeting_deletion_progress", async (state, _revision, connection) => {
    const deletion = state.deletion;
    if (!deletion) fail("No deletion is pending.");
    if (deletion.completedAt) return;
    if (input.action === "init" && !deletion.initialized) {
      deletion.scans = Array.from(new Set(input.channelIds)).filter((id) => id !== state.channelId).map((channelId) => ({ channelId, done: false })); deletion.initialized = true;
    } else if (input.action === "channel-deleted") deletion.channelDeleted = true;
    else if (input.action === "scan-progress") {
      const scan = deletion.scans.find((scan) => scan.channelId === input.channelId);
      if (!scan) fail("Unknown cleanup channel.", 400);
      if (!scan.done) { scan.before = input.before; scan.done = Boolean(input.done); }
    } else if (input.action === "complete") {
      if (!deletion.initialized || !deletion.channelDeleted || deletion.scans.some((scan) => !scan.done)) fail("Meeting cleanup is still pending.");
      await deleteMeetingNotes(connection, input.id, input.guildId);
      deletion.completedAt = Date.now();
    }
  });
}
