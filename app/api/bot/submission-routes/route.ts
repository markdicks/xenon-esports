import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { interestRoutes } from "@/data/interest-routing";
import {
  getDiscordSubmissionRoutes,
  saveDiscordSubmissionRoutes,
  type SubmissionRoutes,
} from "@/lib/discord-submission-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const guildIdSchema = z.string().regex(/^\d{17,20}$/);
const roleIdsSchema = z.array(guildIdSchema).max(250).refine(
  (ids) => new Set(ids).size === ids.length,
  "Role selections must be unique.",
);
const routesSchema = z.object({
  application: roleIdsSchema,
  interest: roleIdsSchema,
  "contact-partnerships": roleIdsSchema,
  "contact-business": roleIdsSchema,
  "contact-media": roleIdsSchema,
  "contact-general-enquiry": roleIdsSchema,
  ...Object.fromEntries(interestRoutes.map(([key]) => [key, roleIdsSchema.optional()])),
}).strict();
const updateSchema = z.object({
  guildId: guildIdSchema,
  routes: routesSchema,
}).strict();

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
  const parsedGuildId = guildIdSchema.safeParse(new URL(request.url).searchParams.get("guildId"));
  if (!parsedGuildId.success) return json({ error: "Invalid Discord server" }, 400);
  try {
    return json(await getDiscordSubmissionRoutes(parsedGuildId.data));
  } catch (error) {
    console.error("Could not load Discord submission routes", error);
    return json({ error: "Could not load submission routes" }, 503);
  }
}

export async function PUT(request: Request) {
  if (!authorize(request)) return json({ error: "Unauthorized" }, 401);
  if (Number(request.headers.get("content-length") ?? 0) > 100_000) {
    return json({ error: "Request too large" }, 413);
  }

  let input: unknown;
  try {
    const body = await request.text();
    if (body.length > 100_000) return json({ error: "Request too large" }, 413);
    input = JSON.parse(body);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return json({ error: "Invalid submission routes" }, 400);
  try {
    await saveDiscordSubmissionRoutes(parsed.data.guildId, parsed.data.routes as SubmissionRoutes);
    return json({ success: true });
  } catch (error) {
    console.error("Could not save Discord submission routes", error);
    return json({ error: "Could not save submission routes" }, 503);
  }
}
