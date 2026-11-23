import { z } from "zod";
import { authorizeBot, meetingJson as json, readMeetingJson } from "@/lib/meeting-api";
import { discordId } from "@/lib/meeting-contract";
import { availabilityTeamsSchema, profileSchema, weekSchema } from "@/lib/availability-contract";
import { getAvailabilityTeams, saveAvailabilityTeams } from "@/lib/availability-teams";
import { availabilityOverview, getStaffProfile, saveStaffProfile } from "@/lib/meeting-portal";
import { botStorageFailure } from "@/lib/bot-api-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const identity = { guildId: discordId, actorId: discordId, member: z.boolean(), viewer: z.boolean() };
const schema = z.discriminatedUnion("action", [
  z.object({ ...identity, action: z.literal("profile") }).strict(),
  z.object({ ...identity, action: z.literal("save-profile"), profile: profileSchema }).strict(),
  z.object({ ...identity, action: z.literal("overview"), weekStart: weekSchema, userIds: z.array(discordId).max(50).refine((ids) => new Set(ids).size === ids.length) }).strict(),
  z.object({ ...identity, action: z.literal("teams") }).strict(),
  z.object({ ...identity, action: z.literal("save-teams"), revision: z.string().uuid().nullable(), teams: availabilityTeamsSchema }).strict(),
]);
export async function POST(request: Request) {
  if (!authorizeBot(request)) return json({ error: "Unauthorized" }, 401);
  let parsed;
  try { parsed = schema.safeParse(await readMeetingJson(request, 120_000)); } catch { return json({ error: "Invalid availability request" }, 400); }
  if (!parsed.success) return json({ error: "Check the timezone, weeks and selected times" }, 400);
  const input = parsed.data;
  if (input.action === "save-profile" && input.profile.enabled && !input.member) return json({ error: "The Xenon Member role is required to share availability" }, 403);
  if (["overview", "teams", "save-teams"].includes(input.action) && !input.viewer) return json({ error: "Only Xenon leadership and server administrators can manage team availability" }, 403);
  try {
    if (input.action === "teams") return json(await getAvailabilityTeams(input.guildId));
    if (input.action === "save-teams") return json(await saveAvailabilityTeams(input.guildId, input.actorId, input.revision, input.teams));
    if (input.action === "overview") return json({ items: await availabilityOverview(input.guildId, input.userIds, input.weekStart) });
    return json({ profile: input.action === "profile" ? await getStaffProfile(input.guildId, input.actorId) : await saveStaffProfile(input.guildId, input.actorId, input.profile) });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "AVAILABILITY_CONFLICT") return json({ error: "Availability changed in another tab. Reload the saved schedule before saving again." }, 409);
    const failure = botStorageFailure(error, "availability", input.action, request);
    console.error("Bot storage unavailable", failure.diagnostic);
    return json(failure.body, 503);
  }
}
