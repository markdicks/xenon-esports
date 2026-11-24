import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { bookingNotice, meetingStateSchema, slotLength } from "@/lib/meeting-contract";
import { withBookingLock } from "@/lib/meetings";

function fail(message: string, status = 409): never { throw Object.assign(new Error(message), { status }); }
export async function setMeetingAvailability(input: { id: string; guildId: string; actorId: string; serverOwner: boolean; revision: string;
  participantId: string; mode: "entered" | "ignored" | "restore"; slots?: number[]; timezone?: string }) {
  if (!input.serverOwner) fail("Only the Discord server owner can override meeting availability.", 403);
  return withBookingLock(async (connection) => {
    const [rows] = await connection.execute<RowDataPacket[]>("SELECT state, revision, leased_until > NOW() AS leased FROM discord_meetings WHERE id = ? AND guild_id = ? FOR UPDATE", [input.id, input.guildId]);
    if (!rows[0]) fail("Meeting not found.", 404);
    const state = meetingStateSchema.parse(typeof rows[0].state === "string" ? JSON.parse(rows[0].state) : rows[0].state), now = Date.now();
    if (rows[0].revision !== input.revision) fail("The meeting changed. Reload the current data before saving availability.");
    if (Number(rows[0].leased)) fail("The bot is processing this meeting. Wait a moment, reload and try again.");
    if (state.status === "scheduled" || state.windowEnd <= now || state.deletion || state.lifecycle?.finishedAt || state.lifecycle?.cancellation?.confirmedAt
      || ["accepted", "rejected", "closed"].includes(state.workflowStatus)) fail("Availability can only be changed on an open, unbooked meeting. Use Reschedule for a booked meeting.");
    if (state.lifecycle?.cancellation && state.lifecycle.cancellation.expiresAt > now) fail("Resolve the pending cancellation before changing availability.");
    const person = state.participants.find((row) => row.userId === input.participantId);
    if (!person) fail("This person is no longer a participant in the meeting.", 404);
    if (input.mode === "entered") {
      const slots = input.slots ?? [];
      if (!input.timezone || !slots.length || new Set(slots).size !== slots.length || slots.length > 672
        || slots.some((at) => !Number.isSafeInteger(at) || at % slotLength !== 0 || at < Math.max(state.windowStart, now + bookingNotice) || at >= state.windowEnd)) {
        fail("Select future 30-minute times within this meeting's window, at least two hours from now.", 400);
      }
      try { new Intl.DateTimeFormat("en", { timeZone: input.timezone }).format(); } catch { fail("Choose a valid timezone.", 400); }
      person.slots = [...slots].sort((a, b) => a - b); person.responded = true; person.source = "meeting";
      person.timezone = input.timezone; person.respondedAt = now;
    }
    if (input.mode === "restore") {
      if (person.availabilityOverride?.mode !== "ignored") fail("This person's availability is already being used.");
      const entry = person.availabilityOverride.entered;
      if (entry) person.availabilityOverride = { mode: "entered", ...entry };
      else delete person.availabilityOverride;
    } else {
      const previous = person.availabilityOverride;
      const entered = input.mode === "ignored" ? previous?.mode === "entered" ? { actorId: previous.actorId, at: previous.at } : previous?.entered : undefined;
      person.availabilityOverride = { mode: input.mode, actorId: input.actorId, at: now, ...(entered ? { entered } : {}) };
    }
    delete person.availabilityWaivedAt; delete person.waiverDmAt; delete person.waiverStaffAt;
    delete person.reminderFailedAt; delete person.noMatchNotice; delete person.outcome;
    if (person.deliveryFailure?.stage === "invitation") delete person.deliveryFailure;
    person.resendRequested = false;
    state.availabilityControlVersion = 1;
    state.nearTerm = null; state.status = state.applicantId ? "collecting" : "pending";
    state.completed = false; state.retryPaused = false; state.manualRetryRequested = false;
    delete state.reuseAvailability;
    state.lastAction = { actorId: input.actorId, kind: `owner_availability_${input.mode}`, at: now };
    // The existing history trigger records the owner, action and participant snapshots atomically.
    await connection.execute("UPDATE discord_meetings SET state = ?, revision = ?, finished_at = NULL, next_attempt_at = NOW() WHERE id = ? AND guild_id = ?",
      [JSON.stringify(meetingStateSchema.parse(state)), randomUUID(), input.id, input.guildId]);
    return { success: true };
  });
}
