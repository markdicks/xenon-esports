import { z } from "zod";
import { authorizeBot, meetingJson, readMeetingJson } from "@/lib/meeting-api";
import { discordId, meetingId } from "@/lib/meeting-contract";
import { getMeeting } from "@/lib/meetings";
import { portalDetail, routeKeys } from "@/lib/meeting-portal";
import { departmentKeys } from "@/lib/meeting-outcome-contract";
import { changeMeetingNote, meetingNoteJobs } from "@/lib/meeting-notes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function json(body: unknown, status = 200) { const r = meetingJson(body, status); r.headers.set("X-Xenon-Meeting-Notes", "1"); return r; }
const identity = { id: meetingId, guildId: discordId, actorId: discordId };
const access = { allowedRoutes: z.array(z.enum(routeKeys)).max(routeKeys.length), allowedDepartments: z.array(z.enum(departmentKeys)).max(7),
  serverOwner: z.boolean(), viewAllInternal: z.boolean(), teamMember: z.boolean(), actorStaffRoleIds: z.array(discordId).max(100), authorName: z.string().trim().min(1).max(120) };
const work = { ...identity, revision: z.string().uuid(), leaseToken: z.string().uuid() };
const schema = z.discriminatedUnion("action", [
  z.object({ ...identity, ...access, action: z.literal("open") }).strict(),
  z.object({ ...identity, ...access, action: z.literal("save"), revision: z.string().uuid(), text: z.string().max(4000) }).strict(),
  z.object({ guildId: discordId, action: z.literal("jobs") }).strict(),
  z.object({ ...identity, action: z.literal("claim") }).strict(),
  z.object({ ...work, action: z.literal("prepare") }).strict(),
  z.object({ ...work, action: z.literal("sent"), receipt: z.object({ channelId: discordId, messageId: discordId }).strict() }).strict(),
  z.object({ ...work, action: z.literal("failed"), failure: z.enum(["dm-blocked", "member-left", "retrying", "unavailable"]) }).strict(),
]);
export async function POST(request: Request) {
  if (!authorizeBot(request)) return json({ error: "Unauthorized" }, 401);
  let input;
  try { input = schema.safeParse(await readMeetingJson(request, 16000)); } catch { return json({ error: "Invalid notes request." }, 400); }
  if (!input.success) return json({ error: "Invalid notes request." }, 400);
  const v = input.data;
  try {
    if (v.action === "jobs") return json(await meetingNoteJobs(v.guildId));
    if (v.action === "open" || v.action === "save") {
      const current = await getMeeting(v.id);
      if (!current || current.state.guildId !== v.guildId) return json({ error: "Meeting not found." }, 404);
      if (!current.state.participants.some((p) => p.userId === v.actorId)
        && !await portalDetail(v.id, v.guildId, v.allowedRoutes, null, { actorId: v.actorId, departments: v.allowedDepartments, serverOwner: v.serverOwner,
          viewAllInternal: v.viewAllInternal, hideInternal: !v.teamMember, actorStaffRoleIds: v.actorStaffRoleIds })) return json({ error: "You do not have access to this meeting." }, 403);
    }
    return json(await changeMeetingNote(v));
  } catch (error) {
    const e = error as { status?: number; message?: string }, known = e.status && [400, 403, 404, 409].includes(e.status);
    if (!known) console.error("Meeting notes storage unavailable");
    return json({ error: known ? e.message : "Meeting notes could not be loaded or saved. Check website migration 014 and try again shortly." }, known ? e.status : 503);
  }
}
