"use server";

import { getDbPool } from "@/lib/db";
import { generatePublicReference } from "@/lib/references";
import { contactSubmissionSchema } from "@/lib/validation";

export type ContactFormResult =
  | {
      success: true;
      reference: string;
    }
  | {
      success: false;
      error: "validation" | "database";
    };

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function submitContactForm(formData: FormData) {
  const honeypot = readString(formData, "website");

  if (honeypot) {
    return {
      success: true,
      reference: generatePublicReference("CON"),
    } satisfies ContactFormResult;
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
    } satisfies ContactFormResult;
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
    } satisfies ContactFormResult;
  }

  return {
    success: true,
    reference,
  } satisfies ContactFormResult;
}
