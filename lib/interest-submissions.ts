import { z } from "zod";
import { getDbPool } from "@/lib/db";
import type { SubmissionResult } from "@/lib/form-results";
import { generatePublicReference } from "@/lib/references";
import { interestSubmissionSchema } from "@/lib/validation";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function submitInterestForm(formData: FormData): Promise<SubmissionResult> {
  if (readString(formData, "website")) {
    return { success: true, reference: generatePublicReference("INT") } satisfies SubmissionResult;
  }

  const parsed = interestSubmissionSchema.safeParse({
    discordUsername: readString(formData, "discordUsername"),
    email: readString(formData, "email"),
    areasOfInterest: formData.getAll("areasOfInterest").filter((value): value is string => typeof value === "string"),
    introduction: readString(formData, "introduction"),
    strengths: readString(formData, "strengths"),
    goals: readString(formData, "goals"),
    weeklyAvailability: readString(formData, "weeklyAvailability"),
    portfolioUrl: readString(formData, "portfolioUrl"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: "validation",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    } satisfies SubmissionResult;
  }

  const reference = generatePublicReference("INT");
  const interest = parsed.data;

  try {
    await getDbPool().execute(
      `INSERT INTO interest_submissions (
        reference_code,
        discord_username,
        email,
        interests,
        introduction,
        strengths,
        goals,
        weekly_availability,
        portfolio_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        reference,
        interest.discordUsername,
        interest.email ?? null,
        JSON.stringify(interest.areasOfInterest),
        interest.introduction ?? null,
        interest.strengths ?? null,
        interest.goals ?? null,
        interest.weeklyAvailability ?? null,
        interest.portfolioUrl ?? null,
      ],
    );
  } catch (error) {
    console.error("Interest submission failed", error);
    return { success: false, error: "database" } satisfies SubmissionResult;
  }

  return { success: true, reference } satisfies SubmissionResult;
}
