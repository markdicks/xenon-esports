import { z } from "zod";

export const discordId = z.string().regex(/^\d{17,20}$/);
export const meetingId = z.string().regex(/^[a-f0-9]{24}$/);
export const slotLength = 30 * 60 * 1000;
export const maxAutomaticRetries = 15;
const message = z.object({ channelId: discordId, messageId: discordId, buttonVersion: z.literal(1).optional() }).strict();
export const meetingStateSchema = z.object({
  id: meetingId,
  reference: z.string().regex(/^XEN-(APP|INT|CON)-[A-Z0-9]{6}$/),
  guildId: discordId,
  applicantDiscord: z.string().min(1).max(120),
  applicantId: discordId.nullable(),
  windowStart: z.number().int().positive(), windowEnd: z.number().int().positive(),
  status: z.enum(["pending", "collecting", "scheduled", "no_match", "expired"]),
  participants: z.array(z.object({
    userId: discordId, kind: z.enum(["applicant", "manager"]),
    slots: z.array(z.number().int().positive()).max(672), responded: z.boolean(),
    timezone: z.string().max(100).default("UTC"),
    invitation: message.optional(), failureNotice: message.optional(), outcome: message.optional(), noMatchNotice: message.optional(),
  }).strict()).min(1).max(101),
  attempts: z.number().int().min(0),
  automaticRetries: z.number().int().min(0).max(maxAutomaticRetries).optional(),
  retryPaused: z.boolean().default(false), manualRetryRequested: z.boolean().default(false),
  failureReason: z.string().max(300).nullable(),
  channelId: discordId.nullable(), scheduledAt: z.number().int().positive().nullable(),
  attendeeIds: z.array(discordId).max(101), announcementId: discordId.nullable(),
  completed: z.boolean(),
}).strict().superRefine((state, ctx) => {
  const managers = state.participants.filter((row) => row.kind === "manager");
  const applicants = state.participants.filter((row) => row.kind === "applicant");
  if (!managers.length || applicants.length !== (state.applicantId ? 1 : 0)
    || (state.applicantId && applicants[0]?.userId !== state.applicantId)
    || new Set(state.participants.map((row) => row.userId)).size !== state.participants.length
    || state.windowEnd - state.windowStart !== 14 * 24 * 60 * 60 * 1000
    || state.participants.some((row) => row.slots.some((slot) => slot < state.windowStart || slot >= state.windowEnd || slot % slotLength !== 0))) {
    ctx.addIssue({ code: "custom", message: "Invalid meeting participants or availability window" });
  }
}).transform((state) => ({ ...state, automaticRetries: state.automaticRetries ?? Math.min(maxAutomaticRetries, Math.max(0, state.attempts - 1)) }));
export type MeetingState = z.infer<typeof meetingStateSchema>;

export function matchingSlot(state: MeetingState, now = Date.now()) {
  const applicant = state.participants.find((row) => row.kind === "applicant");
  const managers = state.participants.filter((row) => row.kind === "manager");
  if (!applicant?.responded || !managers.length || managers.some((row) => !row.responded)) return null;
  const required = Math.ceil(managers.length * 2 / 3);
  for (const slot of Array.from(new Set(applicant.slots)).sort((a, b) => a - b)) {
    if (slot < now + 2 * 60 * 60 * 1000) continue;
    const attending = managers.filter((row) => row.slots.includes(slot));
    if (attending.length >= required) return { at: slot, attendeeIds: [applicant.userId, ...attending.map((row) => row.userId)] };
  }
  return null;
}
