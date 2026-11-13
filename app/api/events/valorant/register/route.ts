import { z } from "zod";
import { preShowSchema } from "@/lib/community-contract";
import { registerPreShow } from "@/lib/community-events";
import { assertCommunityOrigin, safeCommunityFailure, validateCommunityInteraction } from "@/lib/community-security";
import { readMeetingJson, meetingJson } from "@/lib/meeting-api";
export const runtime = "nodejs";
const schema = preShowSchema.extend({ proof: z.string().max(200) });
export async function POST(request: Request) {
  try {
    assertCommunityOrigin(request);
    const parsed = schema.safeParse(await readMeetingJson(request, 16000));
    if (!parsed.success) return meetingJson({ error: "Please check your registration details.", fieldErrors: z.flattenError(parsed.error).fieldErrors }, 400);
    const identity = validateCommunityInteraction(request, parsed.data.proof);
    const { proof: _proof, ...input } = parsed.data;
    const saved = await registerPreShow(input, identity.voterHash, identity.networkHash);
    return meetingJson({ success: true, ...saved });
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && ["Missing body", "Request too large"].includes(error.message))) return meetingJson({ error: "Invalid registration request." }, 400);
    const failure = safeCommunityFailure(error); return meetingJson({ error: failure.error }, failure.status);
  }
}
