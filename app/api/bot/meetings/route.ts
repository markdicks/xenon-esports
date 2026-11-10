import { z } from "zod";
import { authorizeBot, meetingJson as json, readMeetingJson } from "@/lib/meeting-api";
import { claimMeetings, ensureMeeting, listPausedMeetings, requestManualMeetingRetry, saveMeetingJob } from "@/lib/meetings";
import { discordId, meetingId, meetingStateSchema } from "@/lib/meeting-contract";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!authorizeBot(request)) return json({ error: "Unauthorized" }, 401);
  const guild = discordId.safeParse(new URL(request.url).searchParams.get("guildId"));
  if (!guild.success) return json({ error: "Invalid server" }, 400);
  const view = new URL(request.url).searchParams.get("view");
  if (view !== null && view !== "paused") return json({ error: "Invalid meeting view" }, 400);
  try { return json({ meetings: view === "paused" ? await listPausedMeetings(guild.data) : await claimMeetings(guild.data) }); }
  catch (error) { console.error("Meeting queue unavailable", error); return json({ error: "Meeting storage unavailable. Check migration 008." }, 503); }
}
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ensure"), reference: z.string().regex(/^XEN-(APP|INT|CON)-[A-Z0-9]{6}$/), guildId: discordId,
    managerIds: z.array(discordId).min(1).max(90) }).strict(),
  z.object({ action: z.literal("save"), state: meetingStateSchema, revision: z.string().uuid(), leaseToken: z.string().uuid(), release: z.boolean() }).strict(),
  z.object({ action: z.literal("retry"), id: meetingId, guildId: discordId }).strict(),
]);
export async function POST(request: Request) {
  if (!authorizeBot(request)) return json({ error: "Unauthorized" }, 401);
  let body;
  try { body = schema.safeParse(await readMeetingJson(request)); } catch { return json({ error: "Invalid meeting request" }, 400); }
  if (!body.success) return json({ error: "Invalid meeting request" }, 400);
  try {
    if (body.data.action === "ensure") return json({ enabled: await ensureMeeting(body.data.reference, body.data.guildId, body.data.managerIds) });
    if (body.data.action === "retry") {
      const result = await requestManualMeetingRetry(body.data.id, body.data.guildId);
      return result === "queued" ? json({ success: true }) : json({ error: result === "missing" ? "Meeting not found" : result === "closed" ? "This invitation is not paused or has expired" : "Meeting changed. Reload before retrying" }, result === "missing" ? 404 : 409);
    }
    const revision = await saveMeetingJob(body.data);
    return revision ? json({ revision }) : json({ error: "Meeting changed or lease expired" }, 409);
  } catch (error) { console.error("Could not save meeting", error); return json({ error: "Meeting storage unavailable. Check migration 008." }, 503); }
}
