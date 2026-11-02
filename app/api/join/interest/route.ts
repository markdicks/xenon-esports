import { handleFormSubmission } from "@/lib/form-route";
import { submitInterestForm } from "@/lib/interest-submissions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleFormSubmission(request, submitInterestForm);
}
