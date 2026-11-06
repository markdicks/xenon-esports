import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getManagementConfig, managementSchema, saveManagementConfig } from "@/lib/discord-management";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const id = z.string().regex(/^\d{17,20}$/);
const maximumBodyBytes = 1_000_000;
const update = z.object({ guildId: id, revision: z.string().uuid().nullable(), config: managementSchema, actorId: id }).strict();
function authorized(request: Request) {
  const secret = process.env.WEBSITE_BOT_TOKEN;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`), actual = Buffer.from(request.headers.get("authorization") || "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  if (!authorized(request)) return json({ error: "Unauthorized" }, 401);
  const guildId = id.safeParse(new URL(request.url).searchParams.get("guildId"));
  if (!guildId.success) return json({ error: "Invalid server" }, 400);
  try { return json(await getManagementConfig(guildId.data)); }
  catch (error) { console.error("Could not load Discord management", error); return json({ error: "Management storage unavailable" }, 503); }
}

export async function PUT(request: Request) {
  if (!authorized(request)) return json({ error: "Unauthorized" }, 401);
  if (Number(request.headers.get("content-length") ?? 0) > maximumBodyBytes) return json({ error: "Request too large" }, 413);
  let value: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Invalid JSON" }, 400);
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      length += chunk.byteLength;
      if (length > maximumBodyBytes) {
        await reader.cancel();
        return json({ error: "Request too large" }, 413);
      }
      chunks.push(chunk);
    }
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return json({ error: "Invalid JSON" }, 400); }
  const parsed = update.safeParse(value);
  if (!parsed.success) return json({ error: "Invalid management configuration" }, 400);
  try {
    const { guildId, revision, config, actorId } = parsed.data;
    const saved = await saveManagementConfig(guildId, revision, config, actorId);
    return saved ? json({ revision: saved }) : json({ error: "Configuration changed. Reload before saving." }, 409);
  } catch (error) { console.error("Could not save Discord management", error); return json({ error: "Management storage unavailable" }, 503); }
}
