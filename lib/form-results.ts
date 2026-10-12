import { z } from "zod";

export const submissionResultSchema = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true), reference: z.string().regex(/^XEN-(APP|CON)-[A-Z0-9]{6}$/) }),
  z.object({
    success: z.literal(false),
    error: z.enum(["validation", "database", "network"]),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  }),
]);

export type SubmissionResult = z.infer<typeof submissionResultSchema>;
