import { z } from "zod";
import { choiceSchema, valorantEventId } from "@/lib/community-contract";
import { castCommunityVote, publicCommunityEvent } from "@/lib/community-events";
import { assertCommunityOrigin, safeCommunityFailure, validateCommunityInteraction } from "@/lib/community-security";
import { readMeetingJson, meetingJson } from "@/lib/meeting-api";
export const runtime = "nodejs";
const schema = z.object({ choice: choiceSchema, proof: z.string().max(200), website: z.literal("").default("") }).strict();
export async function POST(request: Request) {
  try {
    assertCommunityOrigin(request);
    const parsed = schema.safeParse(await readMeetingJson(request, 16000));
    if (!parsed.success) return meetingJson({ error: "Choose one of the approved event formats." }, 400);
    const identity = validateCommunityInteraction(request, parsed.data.proof);
    const saved = await castCommunityVote(parsed.data.choice, identity.voterHash, identity.networkHash);
    return meetingJson({ success: true, ...saved, event: await publicCommunityEvent(valorantEventId) });
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && ["Missing body", "Request too large"].includes(error.message))) return meetingJson({ error: "Invalid vote request." }, 400);
    const failure = safeCommunityFailure(error); return meetingJson({ error: failure.error }, failure.status);
  }
}
