import { createHash, timingSafeEqual } from "node:crypto";
import { getConfigs, setConfig } from "@/lib/site-config";
import { configChangeSchema } from "@/lib/site-config-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maximumBodyBytes = 4096;

function authorized(request: Request) {
  const secret = process.env.INTERNAL_BOT_API_KEY;
  if (!secret) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`));
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  if (!authorized(request)) return json({ success: false, error: "Unauthorized" }, 401);
  try {
    return json({ success: true, configs: await getConfigs() });
  } catch {
    return json({ success: false, error: "Configuration is temporarily unavailable" }, 503);
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) return json({ success: false, error: "Unauthorized" }, 401);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ success: false, error: "Use application/json" }, 415);
  }
  if (Number(request.headers.get("content-length") ?? 0) > maximumBodyBytes) {
    return json({ success: false, error: "Request too large" }, 413);
  }
  let input: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ success: false, error: "Invalid JSON" }, 400);
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumBodyBytes) {
        await reader.cancel();
        return json({ success: false, error: "Request too large" }, 413);
      }
      chunks.push(value);
    }
    input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return json({ success: false, error: "Invalid JSON" }, 400);
  }
  const parsed = configChangeSchema.safeParse(input);
  if (!parsed.success) return json({ success: false, error: "Invalid public configuration change" }, 400);
  try {
    await setConfig(parsed.data.key, parsed.data.value, parsed.data.actor);
    return json({ success: true });
  } catch {
    return json({ success: false, error: "Could not save configuration" }, 503);
  }
}
