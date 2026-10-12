import { submitContactForm } from "@/lib/contact-submissions";
import { handleFormSubmission } from "@/lib/form-route";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleFormSubmission(request, submitContactForm);
}
