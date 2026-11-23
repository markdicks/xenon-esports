import { z } from "zod";
import { authorizeBot, meetingJson as json, readMeetingJson } from "@/lib/meeting-api";
import { discordId, meetingId } from "@/lib/meeting-contract";
import { addMeetingParticipants, participantContext } from "@/lib/meeting-participants";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ids = z.array(discordId).max(100).refine((values) => new Set(values).size === values.length);
const identity = { id: meetingId, guildId: discordId };
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("context"), ...identity }).strict(),
  z.object({ action: z.literal("add"), ...identity, actorId: discordId, revision: z.string().uuid(), serverOwner: z.boolean(),
    actorRoleIds: ids, staffRoleIds: ids, userIds: ids.refine((values) => values.length > 0) }).strict(),
]);
export async function POST(request: Request) {
  if (!authorizeBot(request)) return json({ error: "Unauthorized" }, 401);
  let body;
  try { body = schema.safeParse(await readMeetingJson(request, 24000)); } catch { return json({ error: "Invalid participant request" }, 400); }
  if (!body.success) return json({ error: "Invalid participant request" }, 400);
  const input = body.data;
  try { return json(input.action === "context" ? await participantContext(input.id, input.guildId) : await addMeetingParticipants(input)); }
  catch (error) {
    const known = error as { status?: number; message?: string };
    const status = known.status && [400, 403, 404, 409].includes(known.status) ? known.status : 503;
    return json({ error: status === 503 ? "Meeting participants are temporarily unavailable." : known.message }, status);
  }
}
