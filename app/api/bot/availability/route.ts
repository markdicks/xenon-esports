import { z } from "zod";
import { authorizeBot, meetingJson as json, readMeetingJson } from "@/lib/meeting-api";
import { discordId } from "@/lib/meeting-contract";
import { profileSchema, weekSchema } from "@/lib/availability-contract";
import { availabilityOverview, getStaffProfile, saveStaffProfile } from "@/lib/meeting-portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const identity = { guildId: discordId, actorId: discordId, member: z.boolean(), viewer: z.boolean() };
const schema = z.discriminatedUnion("action", [
  z.object({ ...identity, action: z.literal("profile") }).strict(),
  z.object({ ...identity, action: z.literal("save-profile"), profile: profileSchema }).strict(),
  z.object({ ...identity, action: z.literal("overview"), weekStart: weekSchema, userIds: z.array(discordId).max(50).refine((ids) => new Set(ids).size === ids.length) }).strict(),
]);
export async function POST(request: Request) {
  if (!authorizeBot(request)) return json({ error: "Unauthorized" }, 401);
  let parsed;
  try { parsed = schema.safeParse(await readMeetingJson(request, 120_000)); } catch { return json({ error: "Invalid availability request" }, 400); }
  if (!parsed.success) return json({ error: "Check the timezone, weeks and selected times" }, 400);
  const input = parsed.data;
  if (input.action === "save-profile" && input.profile.enabled && !input.member) return json({ error: "The Xenon Member role is required to share availability" }, 403);
  if (input.action === "overview" && !input.viewer) return json({ error: "Only Xenon leadership and server administrators can view team availability" }, 403);
  try {
    if (input.action === "overview") return json({ items: await availabilityOverview(input.guildId, input.userIds, input.weekStart) });
    return json({ profile: input.action === "profile" ? await getStaffProfile(input.guildId, input.actorId) : await saveStaffProfile(input.guildId, input.actorId, input.profile) });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "AVAILABILITY_CONFLICT") return json({ error: "Availability changed in another tab. Reload the saved schedule before saving again." }, 409);
    console.error("Availability storage unavailable", { action: input.action, code: typeof code === "string" && /^[A-Z0-9_]{1,60}$/.test(code) ? code : "UNKNOWN" });
    return json({ error: "Availability could not be loaded or saved. Please try again shortly." }, 503);
  }
}
