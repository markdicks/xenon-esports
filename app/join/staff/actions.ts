"use server";

import { redirect } from "next/navigation";
import { getDbPool } from "@/lib/db";
import { generatePublicReference } from "@/lib/references";
import { staffApplicationSchema } from "@/lib/validation";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function submitStaffApplication(formData: FormData) {
  const honeypot = readString(formData, "website");

  if (honeypot) {
    redirect(`/join/staff?submitted=${generatePublicReference("APP")}`);
  }

  const parsed = staffApplicationSchema.safeParse({
    discordUsername: readString(formData, "discordUsername"),
    email: readString(formData, "email"),
    timezone: readString(formData, "timezone"),
    role: readString(formData, "role"),
    weeklyAvailability: readString(formData, "weeklyAvailability"),
    experience: readString(formData, "experience"),
    portfolioUrl: readString(formData, "portfolioUrl"),
    motivation: readString(formData, "motivation"),
    firstThirtyDaysGoal: readString(formData, "firstThirtyDaysGoal"),
    reliabilityExample: readString(formData, "reliabilityExample"),
    reasonMayLeave: readString(formData, "reasonMayLeave"),
    supportNeeded: readString(formData, "supportNeeded"),
    unpaidVolunteerAcknowledgement:
      formData.get("unpaidVolunteerAcknowledgement") === "on",
  });

  if (!parsed.success) {
    redirect("/join/staff?error=validation");
  }

  const reference = generatePublicReference("APP");
  const application = parsed.data;

  await getDbPool().execute(
    `INSERT INTO applications (
      public_reference,
      discord_username,
      email,
      timezone,
      role,
      weekly_availability,
      experience,
      portfolio_url,
      motivation,
      first_30_days_goal,
      reliability_example,
      reason_may_leave,
      support_needed,
      unpaid_volunteer_acknowledgement
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      reference,
      application.discordUsername,
      application.email ?? null,
      application.timezone,
      application.role,
      application.weeklyAvailability,
      application.experience,
      application.portfolioUrl ?? null,
      application.motivation,
      application.firstThirtyDaysGoal,
      application.reliabilityExample,
      application.reasonMayLeave,
      application.supportNeeded ?? null,
      application.unpaidVolunteerAcknowledgement,
    ],
  );

  redirect(`/join/staff?submitted=${reference}`);
}
