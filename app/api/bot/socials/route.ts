import { z } from "zod";
import { authorizeBot, meetingJson as baseJson, readMeetingJson } from "@/lib/meeting-api";
import { configActorSchema } from "@/lib/site-config-validation";
import { socialAppearanceSchema, socialDestinationsSchema, socialLinksSchema } from "@/lib/socials-contract";
import { getSocialsSettings, saveSocialsSettings } from "@/lib/socials-page";
import { botStorageFailure } from "@/lib/bot-api-errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => { const response = baseJson(body, status); response.headers.set("X-Xenon-Socials", "1"); return response; };
const identity = { guildId: z.string().regex(/^\d{17,20}$/), actor: configActorSchema };
const version = z.string().regex(/^[a-f0-9]{64}$/);
const schema = z.discriminatedUnion("action", [
  z.object({ ...identity, action: z.literal("read") }).strict(),
  z.object({ ...identity, action: z.literal("save-links"), version, mayEditLinks: z.boolean(), links: socialLinksSchema, destinations: socialDestinationsSchema }).strict(),
  z.object({ ...identity, action: z.literal("save-appearance"), version, mayEditAppearance: z.boolean(), appearance: socialAppearanceSchema }).strict(),
]);
export async function POST(request: Request) {
  if (!authorizeBot(request)) return json({ error: "Unauthorized" }, 401);
  let parsed;
  try { parsed = schema.safeParse(await readMeetingJson(request, 40_000)); } catch { return json({ error: "Invalid Socials request." }, 400); }
  if (!parsed.success) return json({ error: "Check the Socials fields, public HTTPS URLs and selected appearance options." }, 400);
  const input = parsed.data;
  if ((input.action === "save-links" && !input.mayEditLinks) || (input.action === "save-appearance" && !input.mayEditAppearance)) return json({ error: "Your Discord roles do not allow this Socials change." }, 403);
  try { return json(input.action === "read" ? await getSocialsSettings() : await saveSocialsSettings(input.version, input, input.actor)); }
  catch (error) {
    if ((error as { status?: number }).status === 409) return json({ error: "Socials changed in another editor or Discord command. Reload the current settings before saving." }, 409);
    const failure = botStorageFailure(error, "socials", input.action === "read" ? "read" : "save", request);
    console.error("Bot storage unavailable", failure.diagnostic); return json(failure.body, 503);
  }
}
