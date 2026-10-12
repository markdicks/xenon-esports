import { z } from "zod";
import { getDbPool } from "@/lib/db";
import type { SubmissionResult } from "@/lib/form-results";
import { generatePublicReference } from "@/lib/references";
import { contactSubmissionSchema } from "@/lib/validation";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function submitContactForm(formData: FormData): Promise<SubmissionResult> {
  const honeypot = readString(formData, "website");

  if (honeypot) {
    return {
      success: true,
      reference: generatePublicReference("CON"),
    } satisfies SubmissionResult;
  }

  const parsed = contactSubmissionSchema.safeParse({
    name: readString(formData, "name"),
    discordUsername: readString(formData, "discordUsername") || undefined,
    email: readString(formData, "email"),
    subject: readString(formData, "subject"),
    message: readString(formData, "message"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: "validation",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    } satisfies SubmissionResult;
  }

  const reference = generatePublicReference("CON");
  const enquiry = parsed.data;

  try {
    await getDbPool().execute(
      `INSERT INTO contact_submissions (
        public_reference,
        name,
        discord_username,
        email,
        subject,
        message
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        reference,
        enquiry.name,
        enquiry.discordUsername ?? null,
        enquiry.email,
        enquiry.subject,
        enquiry.message,
      ],
    );
  } catch (error) {
    console.error("Contact submission failed", error);
    return {
      success: false,
      error: "database",
    } satisfies SubmissionResult;
  }

  return {
    success: true,
    reference,
  } satisfies SubmissionResult;
}
