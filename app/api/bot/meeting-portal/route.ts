import { z } from "zod";
import { authorizeBot, meetingJson as json, readMeetingJson } from "@/lib/meeting-api";
import { discordId, meetingId } from "@/lib/meeting-contract";
import { departmentKeys } from "@/lib/meeting-outcome-contract";
import { getStaffProfile, portalCorrectDiscord, portalDetail, portalFailure, portalList, portalMutate, profileSchema, routeKeys, saveStaffProfile } from "@/lib/meeting-portal";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const context = { guildId: discordId, actorId: discordId, allowedRoutes: z.array(z.enum(routeKeys)).max(6), allowedDepartments: z.array(z.enum(departmentKeys)).max(6).default([]) };
const schema = z.discriminatedUnion("action", [
  z.object({ ...context, action: z.literal("list"), before: meetingId.nullable().default(null), status: z.enum(["new","reviewing","meeting","accepted","rejected","closed"]).nullable().default(null), search: z.string().max(120).default("") }).strict(),
  z.object({ ...context, action: z.literal("detail"), id: meetingId, historyBefore: z.number().int().positive().nullable().default(null) }).strict(),
  z.object({ ...context, action: z.literal("mutate"), id: meetingId, revision: z.string().uuid(), operation: z.enum(["status", "resend", "reopen", "discord-username"]), value: z.enum(["new","reviewing","meeting","accepted","rejected","closed"]).optional(), discordUsername: z.string().trim().min(1).max(120).optional() }).strict(),
  z.object({ ...context, action: z.literal("profile") }).strict(),
  z.object({ ...context, action: z.literal("save-profile"), profile: profileSchema }).strict(),
]);
export async function POST(request: Request) {
  if (!authorizeBot(request)) return json({ error: "Unauthorized" }, 401);
  let parsed;
  try { parsed = schema.safeParse(await readMeetingJson(request)); } catch { return json({ error: "Invalid portal request" }, 400); }
  if (!parsed.success) return json({ error: "Invalid portal request" }, 400);
  const input = parsed.data;
  const access = { actorId: input.actorId, departments: input.allowedDepartments };
  try {
    if (input.action === "list") return json(await portalList(input.guildId, input.allowedRoutes, input.before, input.status, input.search, access));
    if (input.action === "detail") {
      const detail = await portalDetail(input.id, input.guildId, input.allowedRoutes, input.historyBefore, access);
      return detail ? json(detail) : json({ error: "Submission not found" }, 404);
    }
    if (input.action === "profile") return json({ profile: await getStaffProfile(input.guildId, input.actorId) });
    if (input.action === "save-profile") {
      if (!input.allowedRoutes.length && !input.allowedDepartments.length && input.profile.enabled) return json({ error: "A notification or department role is required to save staff availability" }, 403);
      await saveStaffProfile(input.guildId, input.actorId, input.profile); return json({ success: true });
    }
    if (input.operation === "status" && !input.value) return json({ error: "Choose a status" }, 400);
    if (input.operation === "discord-username" && !input.discordUsername) return json({ error: "Enter a Discord username or user ID" }, 400);
    const result = input.operation === "discord-username"
      ? await portalCorrectDiscord(input.id, input.guildId, input.allowedRoutes, input.actorId, input.revision, input.discordUsername!, access)
      : await portalMutate(input.id, input.guildId, input.allowedRoutes, input.actorId, input.revision, input.operation, input.value, access);
    return result === "saved" ? json({ success: true }) : json({ error: result === "missing" ? "Submission not found" : `Submission ${result}. Reload before changing it.` }, result === "missing" ? 404 : 409);
  } catch (error) {
    const failure = portalFailure(error, input.action);
    console.error("Meeting portal unavailable", failure.diagnostic);
    return json({ error: failure.error, code: failure.code }, 503);
  }
}
