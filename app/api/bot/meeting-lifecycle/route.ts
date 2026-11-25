import { z } from "zod";
import { authorizeBot, meetingJson as json, readMeetingJson } from "@/lib/meeting-api";
import { discordId, meetingId } from "@/lib/meeting-contract";
import { confirmMeetingCancellation, finishInternalMeeting, listMeetingLifecycle, readMeetingLifecycle,
  requestMeetingCancellation, saveLifecycleRecord, dueMeetingAttendance, claimMeetingAttendance, completeMeetingAttendance } from "@/lib/meeting-lifecycle";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const identity = { id: meetingId, guildId: discordId };
const staff = { ...identity, actorId: discordId, staff: z.literal(true), revision: z.string().uuid() };
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("attendance-jobs"), guildId: discordId }).strict(),
  z.object({ action: z.literal("attendance-claim"), ...identity, scheduledAt: z.number().int().positive() }).strict(),
  z.object({ action: z.literal("attendance-complete"), ...identity, scheduledAt: z.number().int().positive(), leaseToken: z.string().uuid(), receipt: z.object({ channelId: discordId, messageId: discordId }).strict().optional() }).strict(),
  z.object({ action: z.literal("list"), guildId: discordId, after: meetingId.nullable().default(null), participantId: discordId.optional() }).strict(),
  z.object({ action: z.literal("read-channel"), guildId: discordId, channelId: discordId }).strict(),
  z.object({ action: z.literal("request-cancel"), ...staff, reason: z.string().trim().min(1).max(500) }).strict(),
  z.object({ action: z.literal("confirm-cancel"), ...identity, actorId: discordId, token: z.string().uuid(), staff: z.boolean() }).strict(),
  z.object({ action: z.literal("finish"), ...staff }).strict(),
  z.object({ action: z.literal("record"), ...identity, key: z.string().regex(/^[a-z0-9:-]{1,100}$/), channelId: discordId, messageId: discordId }).strict(),
]);
export async function POST(request: Request) {
  if (!authorizeBot(request)) return json({ error: "Unauthorized" }, 401);
  let body;
  try { body = schema.safeParse(await readMeetingJson(request, 8000)); } catch { return json({ error: "Invalid meeting lifecycle request" }, 400); }
  if (!body.success) return json({ error: "Invalid meeting lifecycle request" }, 400);
  const input = body.data;
  try {
    switch (input.action) {
      case "attendance-jobs": return json(await dueMeetingAttendance(input.guildId));
      case "attendance-claim": return json(await claimMeetingAttendance(input));
      case "attendance-complete": return json(await completeMeetingAttendance(input));
      case "list": return json(await listMeetingLifecycle(input.guildId, input.after, input.participantId));
      case "read-channel": return json(await readMeetingLifecycle(input.guildId, input.channelId));
      case "request-cancel": return json(await requestMeetingCancellation(input));
      case "confirm-cancel": return json(await confirmMeetingCancellation(input));
      case "finish": return json(await finishInternalMeeting(input));
      case "record": return json(await saveLifecycleRecord(input));
    }
  } catch (error) {
    const known = error as { status?: number; message?: string };
    const status = known.status && [400, 403, 404, 409].includes(known.status) ? known.status : 503;
    if (status === 503) console.error("Meeting lifecycle storage unavailable");
    return json({ error: status === 503 ? "Meeting storage unavailable. Please try again shortly." : known.message }, status);
  }
}
