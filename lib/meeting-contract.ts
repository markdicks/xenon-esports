import { z } from "zod";

export const discordId = z.string().regex(/^\d{17,20}$/);
export const meetingId = z.string().regex(/^[a-f0-9]{24}$/);
export const slotLength = 30 * 60 * 1000;
export const bookingNotice = 2 * 60 * 60 * 1000;
export const minimumAvailabilitySlots = 3;
export function futureAvailabilitySlots(slots: number[], windowStart: number, windowEnd: number, now: number) {
  const earliest = Math.max(windowStart, now + bookingNotice);
  return Array.from(new Set(slots)).filter((slot) => Number.isSafeInteger(slot) && slot >= earliest && slot < windowEnd && slot % slotLength === 0);
}
export const maxAutomaticRetries = 15;
const message = z.object({ channelId: discordId, messageId: discordId, buttonVersion: z.literal(1).optional(), purposeVersion: z.literal(1).optional() }).strict();
export const meetingStateSchema = z.object({
  id: meetingId,
  reference: z.string().regex(/^XEN-(APP|INT|CON)-[A-Z0-9]{6}$/),
  guildId: discordId,
  roundNumber: z.number().int().min(1).max(100).default(1),
  parentMeetingId: meetingId.optional(),
  departments: z.array(z.enum(["content", "operations", "competitive", "creators", "community", "staff"])).max(6).default([]),
  applicantDiscord: z.string().min(1).max(120),
  applicantId: discordId.nullable(),
  windowStart: z.number().int().positive(), windowEnd: z.number().int().positive(),
  status: z.enum(["pending", "collecting", "scheduled", "no_match", "expired"]),
  workflowStatus: z.enum(["new", "reviewing", "meeting", "accepted", "rejected", "closed"]).default("new"),
  lastAction: z.object({ actorId: discordId, kind: z.string().max(60), at: z.number().int() }).strict().optional(),
  participants: z.array(z.object({
    userId: discordId, kind: z.enum(["applicant", "manager"]),
    slots: z.array(z.number().int().positive()).max(672), responded: z.boolean(),
    timezone: z.string().max(100).default("UTC"),
    displayName: z.string().max(120).optional(), source: z.enum(["meeting", "standing"]).default("meeting"),
    sendCount: z.number().int().min(0).default(0), lastSentAt: z.number().int().optional(), respondedAt: z.number().int().optional(),
    resendGeneration: z.number().int().min(0).default(0), resendRequested: z.boolean().default(false),
    deliveryFailure: z.object({ stage: z.enum(["invitation", "outcome"]), at: z.number().int().positive() }).strict().optional(),
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

export type BusyMeeting = { scheduledAt: number; attendeeIds: string[] };
export function matchingSlot(state: MeetingState, now = Date.now(), busy: BusyMeeting[] = []) {
  const applicant = state.participants.find((row) => row.kind === "applicant");
  const managers = state.participants.filter((row) => row.kind === "manager");
  if (!applicant?.responded || !managers.length || managers.some((row) => !row.responded)) return null;
  const required = Math.ceil(managers.length * 2 / 3);
  const available = (userId: string, slot: number) => !busy.some((meeting) => meeting.attendeeIds.includes(userId)
    && slot < meeting.scheduledAt + slotLength && meeting.scheduledAt < slot + slotLength);
  for (const slot of Array.from(new Set(applicant.slots)).sort((a, b) => a - b)) {
    if (slot < now + bookingNotice || !available(applicant.userId, slot)) continue;
    const attending = managers.filter((row) => row.slots.includes(slot) && available(row.userId, slot));
    if (attending.length >= required) return { at: slot, attendeeIds: [applicant.userId, ...attending.map((row) => row.userId)] };
  }
  return null;
}

export function meetingFollowUp(state: MeetingState, submittedAt: number, now = Date.now()) {
  const waitingForApplicant = !state.applicantId || !state.participants.some((person) => person.kind === "applicant" && person.responded);
  const waitingForManagers = state.participants.filter((person) => person.kind === "manager" && !person.responded).length;
  const waiting = waitingForApplicant || waitingForManagers > 0;
  const active = state.status !== "scheduled" && !["closed", "rejected", "accepted"].includes(state.workflowStatus);
  const ageDays = Math.max(0, Math.floor((now - submittedAt) / (24 * 60 * 60 * 1000)));
  const overdueWeeks = active && waiting ? (ageDays >= 28 ? 4 : ageDays >= 14 ? 2 : ageDays >= 7 ? 1 : null) : null;
  const availabilityMismatch = active && !waiting && (state.status === "no_match"
    || (state.status === "collecting" && state.windowEnd > now && matchingSlot(state, now) === null));
  const failedRecipients = state.participants.filter((person) => person.deliveryFailure).length;
  return { waitingForApplicant, waitingForManagers, overdueWeeks, availabilityMismatch,
    deliveryFailed: Boolean(state.failureReason) || failedRecipients > 0, failedRecipients };
}
