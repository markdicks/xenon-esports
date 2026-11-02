import { z } from "zod";
import { interestAreas } from "@/data/interest-areas";

const optionalEmail = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() || undefined : value),
  z.string().trim().email("Enter a valid email address.").max(255, "Email must contain no more than 255 characters.").optional(),
);

const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() || undefined : value),
  z.string().trim().url("Enter a valid portfolio URL.").max(500, "Portfolio URL must contain no more than 500 characters.").optional(),
);

const optionalText = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() || undefined : value),
  z.string().trim().max(2000, "Support needed must contain no more than 2000 characters.").optional(),
);

const requiredShortText = (label: string, max = 160) =>
  z.string().trim().min(1, `${label} is required.`)
    .max(max, `${label} must contain no more than ${max} characters.`);

const requiredLongText = (label: string, max = 4000) =>
  z.string().trim().min(1, `${label} is required.`)
    .max(max, `${label} must contain no more than ${max} characters.`);

const optionalLongText = (label: string, max: number) => z.preprocess(
  (value) => (typeof value === "string" ? value.trim() || undefined : value),
  z.string().trim().max(max, `${label} must contain no more than ${max} characters.`).optional(),
);

const optionalShortText = (label: string, max: number) => z.preprocess(
  (value) => (typeof value === "string" ? value.trim() || undefined : value),
  z.string().trim().max(max, `${label} must contain no more than ${max} characters.`).optional(),
);

export const staffApplicationSchema = z.object({
  discordUsername: requiredShortText("Discord username", 120),
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
  unpaidVolunteerAcknowledgement: z.literal(true, {
    error: "Confirm that you understand this is an unpaid volunteer application.",
  }),
});

export const contactSubmissionSchema = z.object({
  name: requiredShortText("Name"),
  discordUsername: z.string().trim().max(120).optional(),
  email: z.string().trim().email("Enter a valid email address.")
    .max(255, "Email must contain no more than 255 characters."),
  subject: requiredShortText("Subject"),
  message: requiredLongText("Message"),
});

export const interestSubmissionSchema = z.object({
  discordUsername: requiredShortText("Discord username", 120),
  email: optionalEmail,
  areasOfInterest: z.array(z.enum(interestAreas))
    .min(1, "Select at least one area of interest.")
    .max(interestAreas.length)
    .refine((values) => new Set(values).size === values.length, "Remove duplicate areas of interest."),
  introduction: optionalLongText("Introduction", 600),
  strengths: optionalLongText("Strengths", 800),
  goals: optionalLongText("Goals", 800),
  weeklyAvailability: optionalShortText("Weekly availability", 120),
  portfolioUrl: optionalUrl,
});

export type StaffApplicationInput = z.infer<typeof staffApplicationSchema>;
export type ContactSubmissionInput = z.infer<typeof contactSubmissionSchema>;
export type InterestSubmissionInput = z.infer<typeof interestSubmissionSchema>;
