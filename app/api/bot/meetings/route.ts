import { z } from "zod";
import { authorizeBot, meetingJson as json, readMeetingJson } from "@/lib/meeting-api";
import { bookMeetingJob, claimMeetings, ensureMeeting, listHistoricalMeetingCandidates, listPausedMeetings, requestManualMeetingRetry, saveMeetingJob } from "@/lib/meetings";
import { discordId, meetingId, meetingStateSchema } from "@/lib/meeting-contract";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!authorizeBot(request)) return json({ error: "Unauthorized" }, 401);
  const guild = discordId.safeParse(new URL(request.url).searchParams.get("guildId"));
  if (!guild.success) return json({ error: "Invalid server" }, 400);
  const params = new URL(request.url).searchParams, view = params.get("view"), after = params.get("after");
  if (view !== null && view !== "paused" && view !== "backfill") return json({ error: "Invalid meeting view" }, 400);
  if (after !== null && (view !== "backfill" || !/^XEN-(APP|INT|CON)-[A-Z0-9]{6}$/.test(after))) return json({ error: "Invalid cursor" }, 400);
  try {
    if (view === "backfill") return json({ candidates: await listHistoricalMeetingCandidates(after) });
    return json({ meetings: view === "paused" ? await listPausedMeetings(guild.data) : await claimMeetings(guild.data) });
  }
  catch (error) { console.error("Meeting queue unavailable", error); return json({ error: "Meeting storage unavailable. Check the website runtime log." }, 503); }
}
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ensure"), reference: z.string().regex(/^XEN-(APP|INT|CON)-[A-Z0-9]{6}$/), guildId: discordId,
    managerIds: z.array(discordId).min(1).max(90), includeHistorical: z.boolean().default(false) }).strict(),
  z.object({ action: z.literal("save"), state: meetingStateSchema, revision: z.string().uuid(), leaseToken: z.string().uuid(), release: z.boolean() }).strict(),
  z.object({ action: z.literal("book"), id: meetingId, guildId: discordId, revision: z.string().uuid(), leaseToken: z.string().uuid() }).strict(),
  z.object({ action: z.literal("retry"), id: meetingId, guildId: discordId }).strict(),
]);
export async function POST(request: Request) {
  if (!authorizeBot(request)) return json({ error: "Unauthorized" }, 401);
  let body;
  try { body = schema.safeParse(await readMeetingJson(request)); } catch { return json({ error: "Invalid meeting request" }, 400); }
  if (!body.success) return json({ error: "Invalid meeting request" }, 400);
  try {
    if (body.data.action === "ensure") return json({ enabled: await ensureMeeting(body.data.reference, body.data.guildId, body.data.managerIds, body.data.includeHistorical) });
    if (body.data.action === "book") {
      const result = await bookMeetingJob(body.data);
      return result ? json(result) : json({ error: "Meeting changed, is closed or lease expired" }, 409);
    }
    if (body.data.action === "retry") {
      const result = await requestManualMeetingRetry(body.data.id, body.data.guildId);
      return result === "queued" ? json({ success: true }) : json({ error: result === "missing" ? "Meeting not found" : result === "closed" ? "This invitation is not paused or has expired" : "Meeting changed. Reload before retrying" }, result === "missing" ? 404 : 409);
    }
    const revision = await saveMeetingJob(body.data);
    return revision ? json({ revision }) : json({ error: "Meeting changed or lease expired" }, 409);
  } catch (error) { console.error("Could not save meeting", error); return json({ error: "Meeting storage unavailable. Check the website runtime log." }, 503); }
}
