import { communitySession } from "@/lib/community-security";
import { publicCommunityEvent, recordedVote } from "@/lib/community-events";
import { valorantEventId } from "@/lib/community-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const event = await publicCommunityEvent(valorantEventId);
  const headers = new Headers({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  if (new URL(request.url).searchParams.get("results") === "1") return Response.json({ event }, { headers });
  try {
    if (!event.available) throw new Error("Event unavailable");
    const session = communitySession(request), choice = await recordedVote(session.voterHash);
    if (session.cookie) headers.set("Set-Cookie", session.cookie);
    return Response.json({ event, proof: session.proof, choice, formReady: true }, { headers });
  } catch { return Response.json({ event, proof: null, choice: null, formReady: false }, { headers }); }
}
