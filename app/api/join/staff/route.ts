import { handleFormSubmission } from "@/lib/form-route";
import { submitStaffApplication } from "@/lib/staff-submissions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleFormSubmission(request, submitStaffApplication);
}
