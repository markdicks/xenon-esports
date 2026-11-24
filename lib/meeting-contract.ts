import { z } from "zod";

export const discordId = z.string().regex(/^\d{17,20}$/);
export const meetingId = z.string().regex(/^[a-f0-9]{24}$/);
export const meetingReference = z.string().regex(/^XEN-(?:(?:APP|INT|CON)-[A-Z0-9]{6}|MTG-[A-F0-9]{12})$/);
export const slotLength = 30 * 60 * 1000;
export const bookingNotice = 2 * 60 * 60 * 1000;
export const minimumAvailabilitySlots = 3;
export const minimumAvailabilityDays = 2;
export const hour = 60 * 60 * 1000;
export function availabilityDayCount(slots: number[], timezone: string) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, dateStyle: "short" });
  return new Set(slots.map((slot) => date.format(slot))).size;
}
export function followupWindowStart(scheduledAt: number, timezone: string, now: number) {
  let date: Intl.DateTimeFormat;
  try { date = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, dateStyle: "short" }); }
  catch { date = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", dateStyle: "short" }); }
  let start = Math.ceil(Math.max(scheduledAt + slotLength, now + bookingNotice) / slotLength) * slotLength;
  const previousDay = date.format(scheduledAt);
  while (date.format(start) === previousDay) start += slotLength;
  return start;
}
export function futureAvailabilitySlots(slots: number[], windowStart: number, windowEnd: number, now: number) {
  const earliest = Math.max(windowStart, now + bookingNotice);
  return Array.from(new Set(slots)).filter((slot) => Number.isSafeInteger(slot) && slot >= earliest && slot < windowEnd && slot % slotLength === 0);
}
export const maxAutomaticRetries = 15;
const message = z.object({ channelId: discordId, messageId: discordId, buttonVersion: z.literal(1).optional(), purposeVersion: z.literal(1).optional() }).strict();
const meetingDepartment = z.enum(["content", "operations", "competitive", "creators", "community", "staff", "founder"]);
export const meetingRequestSchema = z.object({
  requestId: z.string().uuid(), guildId: discordId, actorId: discordId,
  requester: z.string().trim().min(1).max(120), topic: z.string().trim().min(1).max(160),
  recipientType: z.enum(["department", "discord"]).default("department"), department: meetingDepartment.optional(),
  managerIds: z.array(discordId).min(1).max(90),
  delivery: z.object({ checkedAt: z.number().int().positive(), userIds: z.array(discordId).min(2).max(91),
    messages: z.array(message.extend({ userId: discordId })).max(91).optional() }).strict(),
}).superRefine((input, ctx) => {
  const recipients = new Set([input.actorId, ...input.managerIds]), checked = new Set(input.delivery.userIds);
  if (input.managerIds.includes(input.actorId) || new Set(input.managerIds).size !== input.managerIds.length
    || (input.recipientType === "discord" ? Boolean(input.department) || input.managerIds.length !== 1 : !input.department)) {
    ctx.addIssue({ code: "custom", message: "Choose a department or one other Discord member", path: ["managerIds"] });
  }
  if (checked.size !== input.delivery.userIds.length || checked.size !== recipients.size || Array.from(recipients).some((id) => !checked.has(id))
    || input.delivery.checkedAt < Date.now() - 120_000 || input.delivery.checkedAt > Date.now() + 30_000) {
    ctx.addIssue({ code: "custom", message: "Verify message delivery to every participant before creating the meeting", path: ["delivery"] });
  }
});
export const meetingStateSchema = z.object({
  id: meetingId,
  reference: meetingReference,
  guildId: discordId,
  roundNumber: z.number().int().min(1).max(100).default(1),
  parentMeetingId: meetingId.optional(),
  staffRoleIds: z.array(discordId).max(100).optional(),
  availabilityControlVersion: z.literal(1).optional(),
  reschedule: z.object({ version: z.number().int().min(1).max(100), fromAt: z.number().int().positive(), at: z.number().int().positive(),
    actorId: discordId, reason: z.string().trim().max(500), searchSince: z.number().int().positive(), chatUpdated: z.boolean().default(false),
    cleanup: z.array(z.object({ userId: discordId, receipt: message.optional(), channelId: discordId.optional(), before: discordId.optional(), done: z.boolean().default(false) }).strict()).max(101),
  }).strict().optional(),
  deliveryChecks: z.array(message.extend({ userId: discordId })).max(101).optional(),
  deletion: z.object({ requestedBy: discordId, requestedAt: z.number().int().positive(), completedAt: z.number().int().positive().optional(),
    initialized: z.boolean().default(false), channelDeleted: z.boolean().default(false),
    scans: z.array(z.object({ channelId: discordId, before: discordId.optional(), done: z.boolean().default(false) }).strict()).max(130).default([]),
  }).strict().optional(),
  lifecycle: z.object({
    finishedAt: z.number().int().positive().optional(),
    cancellation: z.object({
      token: z.string().uuid(), requestedBy: discordId, requestedAt: z.number().int().positive(),
      expiresAt: z.number().int().positive(), reason: z.string().trim().min(1).max(500),
      confirmedBy: discordId.optional(), confirmedAt: z.number().int().positive().optional(),
    }).strict().optional(),
    records: z.record(z.string().regex(/^[a-z0-9:-]{1,100}$/), z.object({ channelId: discordId, messageId: discordId }).strict()).default({}),
  }).strict().optional(),
  departments: z.array(meetingDepartment).max(7).default([]),
  reuseAvailability: z.literal(true).optional(),
  internal: z.object({ topic: z.string().min(1).max(160), recipientType: z.enum(["department", "discord"]).default("department"), deliveryCheckedAt: z.number().int().positive().optional(), requestId: z.string().uuid().optional() }).strict().optional(),
  nearTerm: z.object({ at: z.number().int().positive(), confirmed: z.boolean().default(false), notice: message.optional() }).strict().nullable().optional(),
  notBefore: z.number().int().positive().optional(),
  bookedAt: z.number().int().positive().optional(),
  reminders: z.object({ day: z.number().int().positive().optional(), six: z.number().int().positive().optional() }).strict().optional(),
  submissionTopics: z.array(z.string().max(160)).max(15).optional(),
  attentionSince: z.number().int().positive().optional(), attentionNotifiedAt: z.number().int().positive().optional(),
  applicantDiscord: z.string().min(1).max(120),
  applicantId: discordId.nullable(),
  windowStart: z.number().int().positive(), windowEnd: z.number().int().positive(),
  status: z.enum(["pending", "collecting", "scheduled", "no_match", "expired"]),
  workflowStatus: z.enum(["new", "reviewing", "meeting", "accepted", "rejected", "closed"]).default("new"),
  lastAction: z.object({ actorId: discordId, kind: z.string().max(60), at: z.number().int() }).strict().optional(),
  participants: z.array(z.object({
    userId: discordId, kind: z.enum(["applicant", "manager", "guest"]),
    addedAt: z.number().int().positive().optional(), channelGrantedAt: z.number().int().positive().optional(), additionNotice: message.optional(),
    slots: z.array(z.number().int().positive()).max(672), responded: z.boolean(),
    timezone: z.string().max(100).default("UTC"),
    displayName: z.string().max(120).optional(), source: z.enum(["meeting", "standing"]).default("meeting"),
    availabilityOverride: z.object({ mode: z.enum(["entered", "ignored"]), actorId: discordId, at: z.number().int().positive(),
      entered: z.object({ actorId: discordId, at: z.number().int().positive() }).strict().optional() }).strict().optional(),
    sendCount: z.number().int().min(0).default(0), lastSentAt: z.number().int().optional(), respondedAt: z.number().int().optional(),
    availabilityRequestedAt: z.number().int().positive().optional(), reminderSentAt: z.number().int().positive().optional(), reminderFailedAt: z.number().int().positive().optional(),
    availabilityWaivedAt: z.number().int().positive().optional(), waiverDmAt: z.number().int().positive().optional(), waiverStaffAt: z.number().int().positive().optional(),
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
  announcementIds: z.array(discordId).max(4).optional(),
  completed: z.boolean(),
}).strict().superRefine((state, ctx) => {
  const managers = state.participants.filter((row) => row.kind === "manager");
  const applicants = state.participants.filter((row) => row.kind === "applicant");
  if (!managers.length || applicants.length !== (state.applicantId ? 1 : 0)
    || state.reference.startsWith("XEN-MTG-") !== Boolean(state.internal) || (state.internal && (!state.applicantId
      || state.departments.length !== (state.internal.recipientType === "discord" ? 0 : 1)))
    || (state.applicantId && applicants[0]?.userId !== state.applicantId)
    || new Set(state.participants.map((row) => row.userId)).size !== state.participants.length
    || state.windowEnd - state.windowStart !== 14 * 24 * 60 * 60 * 1000
    || state.participants.some((row) => row.slots.some((slot) => slot < state.windowStart || slot >= state.windowEnd || slot % slotLength !== 0))) {
    ctx.addIssue({ code: "custom", message: "Invalid meeting participants or availability window" });
  }
}).transform((state) => ({ ...state, automaticRetries: state.automaticRetries ?? Math.min(maxAutomaticRetries, Math.max(0, state.attempts - 1)) }));
export type MeetingState = z.infer<typeof meetingStateSchema>;

export type BusyMeeting = { scheduledAt: number; attendeeIds: string[] };
export const ignoresAvailability = (person: MeetingState["participants"][number]) => person.availabilityOverride?.mode === "ignored";
export function readyToMatch(state: MeetingState) {
  return Boolean(state.applicantId) && state.participants.every((person) => ignoresAvailability(person) || person.responded || (person.kind === "manager" && person.availabilityWaivedAt));
}
export function matchingSlot(state: MeetingState, now = Date.now(), busy: BusyMeeting[] = []) {
  const applicant = state.participants.find((row) => row.kind === "applicant");
  const managers = state.participants.filter((row) => row.kind === "manager" && !row.availabilityWaivedAt);
  const guests = state.participants.filter((row) => row.kind === "guest");
  if (!applicant || !readyToMatch(state) || !managers.length) return null;
  const required = Math.ceil(managers.length * 2 / 3);
  const available = (userId: string, slot: number) => !busy.some((meeting) => meeting.attendeeIds.includes(userId)
    && slot < meeting.scheduledAt + slotLength && meeting.scheduledAt < slot + slotLength);
  // If the requester's times are ignored, search the window against the remaining constraints.
  const candidates = ignoresAvailability(applicant)
    ? Array.from({ length: 672 }, (_, i) => state.windowStart + i * slotLength) : applicant.slots;
  for (const slot of Array.from(new Set(candidates)).sort((a, b) => a - b)) {
    if (slot < Math.max(now + bookingNotice, state.notBefore ?? 0) || slot >= state.windowEnd || !available(applicant.userId, slot)
      || guests.some((person) => (!ignoresAvailability(person) && !person.slots.includes(slot)) || !available(person.userId, slot))
      || managers.some((person) => ignoresAvailability(person) && !available(person.userId, slot))) continue;
    const attending = managers.filter((row) => (ignoresAvailability(row) || row.slots.includes(slot)) && available(row.userId, slot));
    if (attending.length >= required) return { at: slot, attendeeIds: [applicant.userId, ...attending.map((row) => row.userId), ...guests.map((person) => person.userId)] };
  }
  return null;
}

export function needsNearTermConfirmation(state: MeetingState, at: number, now: number) {
  return Boolean(state.internal && at <= now + 3 * hour && !(state.nearTerm?.at === at && state.nearTerm.confirmed));
}

export function dueMeetingReminder(state: MeetingState, bookedAt: number, now: number): "day" | "six" | null {
  const at = state.scheduledAt;
  if (!at || !state.channelId || !state.announcementId || state.status !== "scheduled" || ["closed", "rejected", "accepted"].includes(state.workflowStatus) || at <= now) return null;
  if (at - now <= 6 * hour) return at - bookedAt >= 6 * hour && !state.reminders?.six ? "six" : null;
  if (at - now <= 24 * hour && at - bookedAt >= 48 * hour && !state.reminders?.day) return "day";
  return null;
}

export function meetingFollowUp(state: MeetingState, submittedAt: number, now = Date.now()) {
  const waitingForApplicant = !state.applicantId || !state.participants.some((person) => person.kind === "applicant" && (person.responded || ignoresAvailability(person)));
  const waitingForManagers = state.participants.filter((person) => person.kind !== "applicant" && !person.responded && !person.availabilityWaivedAt && !ignoresAvailability(person)).length;
  const waiting = waitingForApplicant || waitingForManagers > 0;
  const active = state.status !== "scheduled" && !["closed", "rejected", "accepted"].includes(state.workflowStatus);
  const ageDays = Math.max(0, Math.floor((now - (state.attentionSince ?? submittedAt)) / (24 * hour)));
  const overdueWeeks = active && waiting ? (ageDays >= 28 ? 4 : ageDays >= 14 ? 2 : ageDays >= 7 ? 1 : null) : null;
  const availabilityMismatch = active && !waiting && (state.status === "no_match"
    || (state.status === "collecting" && state.windowEnd > now && matchingSlot(state, now) === null));
  const failedRecipients = state.participants.filter((person) => person.deliveryFailure).length;
  return { waitingForApplicant, waitingForManagers, overdueWeeks, availabilityMismatch,
    deliveryFailed: Boolean(state.failureReason) || failedRecipients > 0, failedRecipients };
}
