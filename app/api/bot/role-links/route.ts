import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getDiscordRoleLinks, replaceDiscordRoleLinks } from "@/lib/discord-role-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const guildIdSchema = z.string().regex(/^\d{17,20}$/);
const linkSchema = z.object({
  roleKey: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/),
  discordRoleId: guildIdSchema,
});
const linksSchema = z.object({
  guildId: guildIdSchema,
  links: z.array(linkSchema).max(50).refine(
    (links) => new Set(links.map((link) => link.roleKey)).size === links.length
      && new Set(links.map((link) => link.discordRoleId)).size === links.length,
    "Role links must be unique.",
  ),
});

function authorize(request: Request) {
  const token = process.env.WEBSITE_BOT_TOKEN;
  if (!token) return false;
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  if (!authorize(request)) return json({ error: "Unauthorized" }, 401);
  const guildId = new URL(request.url).searchParams.get("guildId");
  const parsedGuildId = guildIdSchema.safeParse(guildId);
  if (!parsedGuildId.success) return json({ error: "Invalid Discord server" }, 400);
  try {
    return json({ links: await getDiscordRoleLinks(parsedGuildId.data) });
  } catch (error) {
    console.error("Could not load Discord role links", error);
    return json({ error: "Could not load role links" }, 503);
  }
}

export async function PUT(request: Request) {
  if (!authorize(request)) return json({ error: "Unauthorized" }, 401);
  if (Number(request.headers.get("content-length") ?? 0) > 30_000) return json({ error: "Request too large" }, 413);
  let input: unknown;
  try {
    const body = await request.text();
    if (body.length > 30_000) return json({ error: "Request too large" }, 413);
    input = JSON.parse(body);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const parsed = linksSchema.safeParse(input);
  if (!parsed.success) return json({ error: "Invalid role links" }, 400);
  try {
    await replaceDiscordRoleLinks(parsed.data.guildId, parsed.data.links);
    return json({ success: true });
  } catch (error) {
    console.error("Could not save Discord role links", error);
    return json({ error: "Could not save role links" }, 503);
  }
}
