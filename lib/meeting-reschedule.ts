import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { bookingNotice, meetingStateSchema, slotLength } from "@/lib/meeting-contract";
import { outcomeSchema } from "@/lib/meeting-outcome-contract";
import { withBookingLock } from "@/lib/meetings";
import { availabilityOverview } from "@/lib/meeting-portal";
import { getDbPool } from "@/lib/db";
const parsed = (v: unknown) => typeof v === "string" ? JSON.parse(v) : v;
function fail(message: string, status = 409): never { throw Object.assign(new Error(message), { status }); }
export async function rescheduleAvailability(input: { id: string; guildId: string; serverOwner: boolean; actorRoleIds: string[]; staffRoleIds: string[]; userIds: string[]; weekStart: string }) {
  const [rows] = await getDbPool().execute<RowDataPacket[]>("SELECT state FROM discord_meetings WHERE id = ? AND guild_id = ?", [input.id, input.guildId]);
  if (!rows[0]) fail("Meeting not found.", 404);
  const state = meetingStateSchema.parse(parsed(rows[0].state)), roles = state.staffRoleIds ?? input.staffRoleIds;
  if (!input.serverOwner && !roles.some((id) => input.actorRoleIds.includes(id))) fail("Only responsible meeting staff or the server owner can view rescheduling availability.", 403);
  if (state.status !== "scheduled" || state.deletion || state.lifecycle?.finishedAt || state.lifecycle?.cancellation?.confirmedAt || ["accepted", "rejected", "closed"].includes(state.workflowStatus)) fail("This meeting cannot be rescheduled.");
  const ids = Array.from(new Set([...state.participants.map((p) => p.userId), ...input.userIds])); if (ids.length > 101) fail("This meeting would exceed 101 participants.", 400);
  const start = Date.parse(`${input.weekStart}T00:00:00+02:00`), end = start + 7 * 86400000;
  const [profiles, [busy]] = await Promise.all([availabilityOverview(input.guildId, ids, input.weekStart), getDbPool().execute<RowDataPacket[]>(`SELECT state FROM discord_meetings WHERE id <> ?
    AND CAST(JSON_UNQUOTE(JSON_EXTRACT(state, '$.scheduledAt')) AS UNSIGNED) > ? AND CAST(JSON_UNQUOTE(JSON_EXTRACT(state, '$.scheduledAt')) AS UNSIGNED) < ?`, [state.id, start - slotLength, end])]);
  const commitments = busy.map((r) => meetingStateSchema.parse(parsed(r.state))).filter((s) => s.status === "scheduled" && !s.deletion && !s.lifecycle?.finishedAt && !s.lifecycle?.cancellation?.confirmedAt);
  return { weekStart: input.weekStart, timezone: "Africa/Johannesburg", items: profiles.map((profile) => {
    const person = state.participants.find((p) => p.userId === profile.userId), explicit = person?.responded && person.source === "meeting" && !person.availabilityWaivedAt;
    const known = Array.from({ length: 336 }, (_, i) => i).filter((i) => explicit && start + i * slotLength >= state.windowStart && start + i * slotLength < state.windowEnd);
    return { ...profile, attending: state.attendeeIds.includes(profile.userId) || input.userIds.includes(profile.userId), meetingKnownSlots: known,
      meetingGridSlots: explicit ? person.slots.filter((at) => at >= start && at < end).map((at) => (at - start) / slotLength) : [],
      busySlots: Array.from({ length: 336 }, (_, i) => i).filter((i) => commitments.some((s) => s.attendeeIds.includes(profile.userId) && start + i * slotLength < s.scheduledAt! + slotLength && s.scheduledAt! < start + (i + 1) * slotLength)) };
  }) };
}
export async function rescheduleMeeting(input: { id: string; guildId: string; actorId: string; revision: string; serverOwner: boolean;
  actorRoleIds: string[]; staffRoleIds: string[]; userIds: string[]; scheduledAt: number; reason: string }) {
  return withBookingLock(async (c) => {
    const [rows] = await c.execute<RowDataPacket[]>("SELECT state, revision, created_at, leased_until > NOW() AS leased FROM discord_meetings WHERE id = ? AND guild_id = ? FOR UPDATE", [input.id, input.guildId]);
    if (!rows[0]) fail("Meeting not found.", 404);
    const state = meetingStateSchema.parse(parsed(rows[0].state)), roles = state.staffRoleIds ?? input.staffRoleIds, now = Date.now();
    if (!input.serverOwner && !roles.some((id) => input.actorRoleIds.includes(id))) fail("Only responsible meeting staff or the server owner can reschedule this meeting.", 403);
    if (rows[0].revision !== input.revision) fail("The meeting changed. Reload before rescheduling.");
    if (Number(rows[0].leased)) fail("The bot is sending meeting messages. Wait a moment and retry rescheduling.");
    if (state.status !== "scheduled" || !state.scheduledAt || !state.applicantId || state.deletion || state.lifecycle?.finishedAt
      || state.lifecycle?.cancellation?.confirmedAt || ["accepted", "rejected", "closed"].includes(state.workflowStatus)) fail("Only an active booked meeting can be rescheduled.");
    if (state.lifecycle?.cancellation && state.lifecycle.cancellation.expiresAt > now) fail("Resolve the pending cancellation before rescheduling.");
    if (state.reschedule && (!state.completed || state.reschedule.cleanup.some((r) => !r.done))) fail("The previous reschedule notices are still being processed. Retry after delivery is complete.");
    if ((state.reschedule?.version || 0) >= 100) fail("This meeting has reached its reschedule limit.");
    if (!Number.isSafeInteger(input.scheduledAt) || input.scheduledAt % slotLength || input.scheduledAt < now + bookingNotice || input.scheduledAt > now + 90 * 86400000) fail("Choose a 30-minute slot at least two hours from now and within 90 days.", 400);
    if (input.scheduledAt === state.scheduledAt) fail("Choose a different meeting time.", 400);
    const [outcomes] = await c.execute<RowDataPacket[]>("SELECT state FROM discord_meeting_outcomes WHERE meeting_id = ? FOR UPDATE", [state.id]);
    const outcome = outcomeSchema.parse(parsed(outcomes[0]?.state) || {});
    if (outcome.status !== "watching" || outcome.qualifiedAt || outcome.proposals.length || outcome.reviewCycle || (outcome.grant.leaseUntil || 0) > now) fail("This meeting already has attendance or post-meeting activity. Arrange a follow-up meeting instead.");
    const ids = Array.from(new Set(input.userIds)).filter((id) => !state.participants.some((p) => p.userId === id));
    if (state.participants.length + ids.length > 101) fail("This meeting would exceed 101 participants.", 400);
    const attendees = Array.from(new Set([...state.attendeeIds, ...ids]));
    const [busy] = await c.execute<RowDataPacket[]>(`SELECT state FROM discord_meetings WHERE id <> ?
      AND CAST(JSON_UNQUOTE(JSON_EXTRACT(state, '$.scheduledAt')) AS UNSIGNED) > ?
      AND CAST(JSON_UNQUOTE(JSON_EXTRACT(state, '$.scheduledAt')) AS UNSIGNED) < ?`, [state.id, input.scheduledAt - slotLength, input.scheduledAt + slotLength]);
    if (busy.map((r) => meetingStateSchema.parse(parsed(r.state))).some((other) => other.status === "scheduled" && !other.deletion && !other.lifecycle?.finishedAt
      && !other.lifecycle?.cancellation?.confirmedAt && other.attendeeIds.some((id) => attendees.includes(id)))) fail("An attendee is already booked at that time. Choose another time or participant.");
    const createdAt = new Date(rows[0].created_at).getTime();
    state.reschedule = { version: (state.reschedule?.version || 0) + 1, fromAt: state.scheduledAt, at: now, actorId: input.actorId, reason: input.reason,
      searchSince: Math.max(1, (state.bookedAt || (Number.isFinite(createdAt) ? createdAt : Math.min(state.windowStart - bookingNotice, now))) - 300000), chatUpdated: false,
      cleanup: state.participants.filter((p) => p.outcome || state.attendeeIds.includes(p.userId)).map((p) => ({ userId: p.userId, receipt: p.outcome,
        ...(p.outcome ? { channelId: p.outcome.channelId } : {}), done: false })) };
    for (const p of state.participants) { delete p.outcome; delete p.deliveryFailure; }
    state.participants.push(...ids.map((userId) => ({ userId, kind: "guest" as const, addedAt: now, slots: [], responded: false, timezone: "UTC", source: "meeting" as const, sendCount: 0, resendGeneration: 0, resendRequested: false })));
    state.staffRoleIds = Array.from(new Set(roles)); state.attendeeIds = attendees; state.scheduledAt = input.scheduledAt; state.bookedAt = now;
    state.reminders = {}; state.nearTerm = null; state.completed = false; state.retryPaused = false; state.manualRetryRequested = false; state.failureReason = null;
    state.lastAction = { actorId: input.actorId, kind: "meeting_rescheduled", at: now };
    if (outcomes[0] && outcome.emptySince) { delete outcome.emptySince; await c.execute("UPDATE discord_meeting_outcomes SET state = ?, revision = ? WHERE meeting_id = ?", [JSON.stringify(outcome), randomUUID(), state.id]); }
    const revision = randomUUID();
    await c.execute("UPDATE discord_meetings SET state = ?, revision = ?, finished_at = NULL, lease_token = NULL, leased_until = NULL, next_attempt_at = NOW() WHERE id = ? AND guild_id = ?", [JSON.stringify(meetingStateSchema.parse(state)), revision, state.id, state.guildId]);
    return { success: true, added: ids.length, scheduledAt: state.scheduledAt, revision };
  });
}
