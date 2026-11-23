import { z } from "zod";
import { authorizeBot, meetingJson as json, readMeetingJson } from "@/lib/meeting-api";
import { discordId, meetingId } from "@/lib/meeting-contract";
import { deletionProgress, readDeletionContext, requestMeetingDeletion } from "@/lib/meeting-deletion";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const identity = { id: meetingId, guildId: discordId };
const schema = z.discriminatedUnion("action", [
  z.object({ ...identity, action: z.literal("request"), actorId: discordId, serverOwner: z.literal(true), revision: z.string().uuid() }).strict(),
  z.object({ ...identity, action: z.literal("context") }).strict(),
  z.object({ ...identity, action: z.literal("init"), channelIds: z.array(discordId).max(130) }).strict(),
  z.object({ ...identity, action: z.literal("channel-deleted") }).strict(),
  z.object({ ...identity, action: z.literal("scan-progress"), channelId: discordId, before: discordId.optional(), done: z.boolean() }).strict(),
  z.object({ ...identity, action: z.literal("complete") }).strict(),
]);
export async function POST(request: Request) {
  if (!authorizeBot(request)) return json({ error: "Unauthorized" }, 401);
  let body;
  try { body = schema.safeParse(await readMeetingJson(request, 24000)); } catch { return json({ error: "Invalid meeting cleanup request" }, 400); }
  if (!body.success) return json({ error: "Invalid meeting cleanup request" }, 400);
  const input = body.data;
  try { return json(input.action === "context" ? await readDeletionContext(input.id, input.guildId) : input.action === "request" ? await requestMeetingDeletion(input) : await deletionProgress(input)); }
  catch (error) {
    const known = error as { status?: number; message?: string };
    const status = known.status && [400, 403, 404, 409].includes(known.status) ? known.status : 503;
    return json({ error: status === 503 ? "Meeting cleanup storage is temporarily unavailable." : known.message }, status);
  }
}
