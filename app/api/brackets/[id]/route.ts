import { bracketId } from "@/lib/bracket-contract";
import { publicBracket } from "@/lib/brackets";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow, noarchive", "Referrer-Policy": "no-referrer" };
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const parsed = bracketId.safeParse((await context.params).id);
  if (!parsed.success) return Response.json({ error: "Bracket unavailable." }, { status: 404, headers });
  try {
    const bracket = await publicBracket(parsed.data);
    if (!bracket) return Response.json({ error: "Bracket unavailable." }, { status: 404, headers });
    const etag = `"${bracket.revision}"`;
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ...headers, ETag: etag } });
    return Response.json({ bracket }, { headers: { ...headers, ETag: etag } });
  } catch { console.error("Unlisted bracket read unavailable"); return Response.json({ error: "Scores are temporarily unavailable. Please try again shortly." }, { status: 503, headers }); }
}
