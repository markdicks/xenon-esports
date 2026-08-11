"use server";

import { redirect } from "next/navigation";
import { getDbPool } from "@/lib/db";
import { generatePublicReference } from "@/lib/references";
import { contactSubmissionSchema } from "@/lib/validation";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function submitContactForm(formData: FormData) {
  const honeypot = readString(formData, "website");

  if (honeypot) {
    redirect(`/contact?submitted=${generatePublicReference("CON")}`);
  }

  const parsed = contactSubmissionSchema.safeParse({
    name: readString(formData, "name"),
    discordUsername: readString(formData, "discordUsername") || undefined,
    email: readString(formData, "email"),
    subject: readString(formData, "subject"),
    message: readString(formData, "message"),
  });

  if (!parsed.success) {
    redirect("/contact?error=validation");
  }

  const reference = generatePublicReference("CON");
  const enquiry = parsed.data;

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

  redirect(`/contact?submitted=${reference}`);
}
