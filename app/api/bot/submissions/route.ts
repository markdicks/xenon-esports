import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { claimBotSubmissions, recordBotDelivery } from "@/lib/bot-submissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  try {
    return json({ submissions: await claimBotSubmissions() });
  } catch (error) {
    console.error("Could not load Discord submission deliveries", error);
    return json({ error: "Could not load submissions" }, 503);
  }
}

const receiptSchema = z.object({
  reference: z.string().regex(/^XEN-(APP|CON)-[A-Z0-9]{6}$/),
  leaseToken: z.string().uuid(),
  deliveredUserIds: z.array(z.string().regex(/^\d{17,20}$/)).max(10000),
  complete: z.boolean(),
  release: z.boolean().default(true),
}).refine((result) => !result.complete || result.release);

export async function POST(request: Request) {
  if (!authorize(request)) return json({ error: "Unauthorized" }, 401);
  if (Number(request.headers.get("content-length") ?? 0) > 300_000) {
    return json({ error: "Request too large" }, 413);
  }
  let input: unknown;
  try {
    const body = await request.text();
    if (body.length > 300_000) return json({ error: "Request too large" }, 413);
    input = JSON.parse(body);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const parsed = receiptSchema.safeParse(input);
  if (!parsed.success) return json({ error: "Invalid delivery receipt" }, 400);
  try {
    const updated = await recordBotDelivery(parsed.data);
    return updated ? json({ success: true }) : json({ error: "Delivery lease expired" }, 409);
  } catch (error) {
    console.error("Could not record Discord submission delivery", error);
    return json({ error: "Could not record delivery" }, 503);
  }
}
