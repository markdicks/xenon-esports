import { z } from "zod";
import { authorizeBot, meetingJson as json, readMeetingJson } from "@/lib/meeting-api";
import { discordId, meetingId } from "@/lib/meeting-contract";
import { departmentKeys, rolePolicySchema } from "@/lib/meeting-outcome-contract";
import { acknowledgeOnboardingRoles, claimOnboardingRoles, continueMeeting, createFollowupMeeting, createMeetingProposal, listMeetingOutcomes,
  observeMeeting, onboardingPolicy, outcomeDeliveryFailed, readMeetingOutcome, requestMeetingReview,
  respondToProposal, retryMeetingOutcome, saveOnboardingPolicy, saveOutcomeReceipt } from "@/lib/meeting-outcomes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const identity = { id: meetingId, guildId: discordId };
const manager = { ...identity, actorId: discordId, staff: z.literal(true) };
const version = z.number().int().min(0).max(20);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list"), guildId: discordId, after: meetingId.nullable().default(null) }).strict(),
  z.object({ action: z.literal("read"), ...identity }).strict(),
  z.object({ action: z.literal("policy"), guildId: discordId }).strict(),
  z.object({ action: z.literal("save-policy"), guildId: discordId, actorId: discordId, administrator: z.literal(true), revision: z.string().uuid().nullable(), ...rolePolicySchema.shape }).strict(),
  z.object({ action: z.literal("observe"), ...identity, qualified: z.boolean(), empty: z.boolean() }).strict(),
  z.object({ action: z.literal("review"), ...manager }).strict(),
  z.object({ action: z.literal("continue"), ...manager }).strict(),
  z.object({ action: z.literal("propose"), ...manager, version, summary: z.string().trim().min(1).max(2000), privateNotes: z.string().max(4000),
    roleIds: z.array(discordId).max(10), roleNames: z.array(z.string().min(1).max(100)).max(10), policyRevision: z.string().uuid().nullable() }).strict(),
  z.object({ action: z.literal("respond"), ...identity, userId: discordId, version, response: z.enum(["accepted", "declined", "countered"]), text: z.string().max(2000).default("") }).strict(),
  z.object({ action: z.literal("receipt"), ...identity, field: z.enum(["review", "proposal", "notice"]), version,
    channelId: discordId, messageId: discordId, reviewCycle: z.number().int().min(0).max(1000).optional(),
    noticeStatus: z.enum(["accepted", "countered", "declined", "onboarded"]).optional() }).strict(),
  z.object({ action: z.literal("failure"), ...identity, field: z.enum(["review", "proposal", "roles", "notification"]) }).strict(),
  z.object({ action: z.literal("retry"), ...manager }).strict(),
  z.object({ action: z.literal("grant-claim"), ...identity, version }).strict(),
  z.object({ action: z.literal("grant-ack"), ...identity, version, leaseToken: z.string().uuid(), appliedRoleIds: z.array(discordId).max(10), failed: z.boolean() }).strict(),
  z.object({ action: z.literal("followup"), ...manager, departments: z.array(z.enum(departmentKeys)).min(1).max(6),
    managerIds: z.array(discordId).min(1).max(90), privateNotes: z.string().max(4000).default("") }).strict(),
]);
export async function POST(request: Request) {
  if (!authorizeBot(request)) return json({ error: "Unauthorized" }, 401);
  let body;
  try { body = schema.safeParse(await readMeetingJson(request, 64000)); } catch { return json({ error: "Invalid meeting follow-up request" }, 400); }
  if (!body.success) return json({ error: "Invalid meeting follow-up request" }, 400);
  const input = body.data;
  try {
    switch (input.action) {
      case "list": return json(await listMeetingOutcomes(input.guildId, input.after));
      case "read": return json(await readMeetingOutcome(input.id, input.guildId));
      case "policy": return json(await onboardingPolicy(input.guildId));
      case "save-policy": return json(await saveOnboardingPolicy(input.guildId, input.actorId, input.revision, input.roleIds));
      case "observe": return json(await observeMeeting(input.id, input.guildId, input.qualified, input.empty));
      case "review": return json(await requestMeetingReview(input.id, input.guildId, input.actorId));
      case "continue": return json(await continueMeeting(input.id, input.guildId, input.actorId));
      case "propose": return json(await createMeetingProposal(input));
      case "respond": {
        const result = await respondToProposal(input);
        // Applicant responses must never return staff notes or old proposals.
        return json({ success: true, status: result.outcome.status });
      }
      case "receipt": return json(await saveOutcomeReceipt(input));
      case "failure": return json(await outcomeDeliveryFailed(input.id, input.guildId, input.field));
      case "retry": return json(await retryMeetingOutcome(input.id, input.guildId, input.actorId));
      case "grant-claim": return json(await claimOnboardingRoles(input.id, input.guildId, input.version));
      case "grant-ack": return json(await acknowledgeOnboardingRoles(input));
      case "followup": return json(await createFollowupMeeting(input));
    }
  } catch (error) {
    const known = error as { status?: number; message?: string; code?: string };
    const status = known.status && [400, 403, 404, 409].includes(known.status) ? known.status : 503;
    if (status === 503) console.error("Meeting follow-up unavailable", { action: input.action, code: /^[A-Z0-9_]{1,60}$/.test(known.code || "") ? known.code : "UNKNOWN" });
    return json({ error: status === 503 ? "Meeting follow-up storage unavailable. Check migration 010 and the website runtime log." : known.message }, status);
  }
}
