import { z } from "zod";
import { authorizeBot, meetingJson as json, readMeetingJson } from "@/lib/meeting-api";
import { discordId, meetingId } from "@/lib/meeting-contract";
import { setMeetingAvailability } from "@/lib/meeting-availability";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const identity = { id: meetingId, guildId: discordId, actorId: discordId, serverOwner: z.literal(true), revision: z.string().uuid(), participantId: discordId };
const schema = z.discriminatedUnion("mode", [
  z.object({ ...identity, mode: z.literal("entered"), slots: z.array(z.number().int().positive()).min(1).max(672), timezone: z.string().min(1).max(100) }).strict(),
  z.object({ ...identity, mode: z.literal("ignored") }).strict(),
  z.object({ ...identity, mode: z.literal("restore") }).strict(),
]);
export async function POST(request: Request) {
  if (!authorizeBot(request)) return json({ error: "Unauthorized" }, 401);
  let body;
  try { body = schema.safeParse(await readMeetingJson(request, 24000)); } catch { return json({ error: "Invalid availability request." }, 400); }
  if (!body.success) return json({ error: "Invalid owner availability request." }, 400);
  try { return json(await setMeetingAvailability(body.data)); }
  catch (error) {
    const known = error as { status?: number; message?: string }, status = known.status && [400, 403, 404, 409].includes(known.status) ? known.status : 503;
    if (status === 503) console.error("Owner meeting availability failed", { code: (error as { code?: string }).code || "unavailable" });
    return json({ error: status === 503 ? "Meeting availability is temporarily unavailable. Try loading the current data again." : known.message }, status);
  }
}
