import { submissionResultSchema, type SubmissionResult } from "@/lib/form-results";

export async function submitForm(endpoint: string, formData: FormData): Promise<SubmissionResult> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body: formData,
      headers: { Accept: "application/json" },
      redirect: "error",
      cache: "no-store",
    });
    const parsed = submissionResultSchema.safeParse(await response.json());
    if (!parsed.success || (!response.ok && parsed.data.success)) {
      return { success: false, error: "network" };
    }
    if (!response.ok && response.status !== 400 && !parsed.data.success && parsed.data.error === "validation") {
      return { success: false, error: "network" };
    }
    return parsed.data;
  } catch {
    // Do not retry automatically: the server may have already saved the form.
    return { success: false, error: "network" };
  }
}
