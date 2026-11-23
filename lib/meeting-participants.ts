import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db";
import { meetingStateSchema, slotLength } from "@/lib/meeting-contract";
import { withBookingLock } from "@/lib/meetings";
const parsed = (value: unknown) => typeof value === "string" ? JSON.parse(value) : value;
function fail(message: string, status = 409): never { throw Object.assign(new Error(message), { status }); }
export async function participantContext(id: string, guildId: string) {
  const [rows] = await getDbPool().execute<RowDataPacket[]>("SELECT state, revision FROM discord_meetings WHERE id = ? AND guild_id = ?", [id, guildId]);
  if (!rows[0]) fail("Meeting not found.", 404);
  const state = meetingStateSchema.parse(parsed(rows[0].state));
  return { revision: rows[0].revision, meeting: { id, guildId, staffRoleIds: state.staffRoleIds, internal: Boolean(state.internal),
    workflowStatus: state.workflowStatus, lifecycle: state.lifecycle, deletion: state.deletion,
    participants: state.participants.map(({ userId, kind }) => ({ userId, kind })), status: state.status, scheduledAt: state.scheduledAt } };
}
export async function addMeetingParticipants(input: { id: string; guildId: string; actorId: string; revision: string; serverOwner: boolean;
  actorRoleIds: string[]; staffRoleIds: string[]; userIds: string[] }) {
  return withBookingLock(async (connection) => {
    const [rows] = await connection.execute<RowDataPacket[]>("SELECT state, revision FROM discord_meetings WHERE id = ? AND guild_id = ? FOR UPDATE", [input.id, input.guildId]);
    if (!rows[0]) fail("Meeting not found.", 404);
    const state = meetingStateSchema.parse(parsed(rows[0].state));
    const staffRoles = state.staffRoleIds ?? input.staffRoleIds;
    if (!input.serverOwner && !staffRoles.some((id) => input.actorRoleIds.includes(id))) fail("Only staff roles already responsible for this meeting or the Discord server owner can add participants.", 403);
    if (rows[0].revision !== input.revision) fail("The meeting changed. Reload before adding participants.");
    if (state.deletion || state.lifecycle?.finishedAt || state.lifecycle?.cancellation?.confirmedAt || ["accepted", "rejected", "closed"].includes(state.workflowStatus)) fail("This meeting is closed.");
    if (state.status !== "scheduled" && state.windowEnd <= Date.now()) fail("Reopen the availability window before adding participants.");
    const ids = Array.from(new Set(input.userIds)).filter((id) => !state.participants.some((person) => person.userId === id));
    if (state.participants.length + ids.length + (state.applicantId ? 0 : 1) > 101) fail("This meeting would exceed 101 participants.", 400);
    if (!ids.length) return { success: true, added: 0 };
    if (state.status === "scheduled") {
      const [busy] = await connection.execute<RowDataPacket[]>(`SELECT state FROM discord_meetings WHERE id <> ?
        AND CAST(JSON_UNQUOTE(JSON_EXTRACT(state, '$.scheduledAt')) AS UNSIGNED) > ?
        AND CAST(JSON_UNQUOTE(JSON_EXTRACT(state, '$.scheduledAt')) AS UNSIGNED) < ?`, [state.id, state.scheduledAt! - slotLength, state.scheduledAt! + slotLength]);
      if (busy.map((row) => meetingStateSchema.parse(parsed(row.state))).some((other) => other.status === "scheduled"
        && !other.deletion && !other.lifecycle?.finishedAt && !other.lifecycle?.cancellation?.confirmedAt && other.attendeeIds.some((id) => ids.includes(id)))) fail("A selected participant is already booked at this time. Choose someone else.");
      state.attendeeIds.push(...ids);
    } else {
      state.status = state.applicantId ? "collecting" : "pending";
      if (state.internal) state.nearTerm = null;
    }
    state.staffRoleIds = Array.from(new Set(staffRoles));
    state.participants.push(...ids.map((userId) => ({ userId, kind: "guest" as const, addedAt: Date.now(), slots: [], responded: false,
      timezone: "UTC", source: "meeting" as const, sendCount: 0, resendGeneration: 0, resendRequested: false })));
    state.completed = false; state.retryPaused = false; state.manualRetryRequested = false;
    state.lastAction = { actorId: input.actorId, kind: "participants_added", at: Date.now() };
    await connection.execute("UPDATE discord_meetings SET state = ?, revision = ?, finished_at = NULL, next_attempt_at = NOW() WHERE id = ? AND guild_id = ?",
      [JSON.stringify(meetingStateSchema.parse(state)), randomUUID(), input.id, input.guildId]);
    return { success: true, added: ids.length };
  });
}
