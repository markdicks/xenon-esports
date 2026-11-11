import { timingSafeEqual } from "node:crypto";
export function authorizeBot(request: Request) {
  const token = process.env.WEBSITE_BOT_TOKEN;
  if (!token) return false;
  const expected = Buffer.from(`Bearer ${token}`), actual = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export const meetingJson = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
});
export async function readMeetingJson(request: Request, limit = 2_000_000): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > limit) throw new Error("Request too large");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > limit) { await reader.cancel(); throw new Error("Request too large"); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
