import { z } from "zod";
import { authorizeBot, meetingJson as json, readMeetingJson } from "@/lib/meeting-api";
import { discordId, meetingId } from "@/lib/meeting-contract";
import { rescheduleAvailability, rescheduleMeeting } from "@/lib/meeting-reschedule";
import { weekSchema } from "@/lib/availability-contract";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ids = z.array(discordId).max(100).refine((v) => new Set(v).size === v.length);
const context = { id: meetingId, guildId: discordId, actorId: discordId, serverOwner: z.boolean(), actorRoleIds: ids, staffRoleIds: ids, userIds: ids };
const schema = z.discriminatedUnion("action", [
  z.object({ ...context, action: z.literal("reschedule"), revision: z.string().uuid(), scheduledAt: z.number().int().positive(), reason: z.string().trim().max(500), confirmed: z.literal(true) }).strict(),
  z.object({ ...context, action: z.literal("availability"), weekStart: weekSchema }).strict(),
]);
export async function POST(request: Request) {
  if (!authorizeBot(request)) return json({ error: "Unauthorized" }, 401);
  let body; try { body = schema.safeParse(await readMeetingJson(request, 24000)); } catch { return json({ error: "Invalid meeting reschedule request." }, 400); }
  if (!body.success) return json({ error: "Invalid meeting reschedule request." }, 400);
  try { return json(body.data.action === "availability" ? await rescheduleAvailability(body.data) : await rescheduleMeeting(body.data)); }
  catch (error) {
    const e = error as { status?: number; message?: string }, status = e.status && [400, 403, 404, 409].includes(e.status) ? e.status : 503;
    return json({ error: status === 503 ? "Meeting rescheduling is temporarily unavailable." : e.message }, status);
  }
}
