import { z } from "zod";

const optionalEmail = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().email("Enter a valid email address.").optional(),
);

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().url("Enter a valid URL.").optional(),
);

const optionalText = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().max(2000).optional(),
);

const requiredShortText = (label: string, max = 160) =>
  z.string().trim().min(2, `${label} is required.`).max(max);

const requiredLongText = (label: string, max = 4000) =>
  z.string().trim().min(20, `${label} needs a little more detail.`).max(max);

export const staffApplicationSchema = z.object({
  discordUsername: requiredShortText("Discord username"),
  email: optionalEmail,
  timezone: requiredShortText("Timezone", 80),
  role: requiredShortText("Role", 120),
  weeklyAvailability: requiredShortText("Weekly availability", 120),
  experience: requiredLongText("Experience"),
  portfolioUrl: optionalUrl,
  motivation: requiredLongText("Motivation"),
  firstThirtyDaysGoal: requiredLongText("First 30 days goal"),
  reliabilityExample: requiredLongText("Reliability example"),
  reasonMayLeave: requiredLongText("Reason you may leave"),
  supportNeeded: optionalText,
  unpaidVolunteerAcknowledgement: z.literal(true),
});

export const contactSubmissionSchema = z.object({
  name: requiredShortText("Name"),
  discordUsername: z.string().trim().max(120).optional(),
  email: z.string().trim().email("Enter a valid email address."),
  subject: requiredShortText("Subject", 160),
  message: requiredLongText("Message"),
});

export type StaffApplicationInput = z.infer<typeof staffApplicationSchema>;
export type ContactSubmissionInput = z.infer<typeof contactSubmissionSchema>;
