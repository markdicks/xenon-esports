import { z } from "zod";
import { discordId, meetingId } from "@/lib/meeting-contract";

export const departmentKeys = ["content", "operations", "competitive", "creators", "community", "staff"] as const;
export const rolePolicySchema = z.object({ roleIds: z.array(discordId).max(20).refine((ids) => new Set(ids).size === ids.length) }).strict();
const receipt = z.object({ channelId: discordId, messageId: discordId }).strict();
export const outcomeSchema = z.object({
  status: z.enum(["watching", "review", "offered", "countered", "declined", "accepted", "onboarded", "followup", "closed"]).default("watching"),
  qualifiedAt: z.number().int().positive().optional(), emptySince: z.number().int().positive().optional(),
  reviewMessage: receipt.optional(), privateNotes: z.string().max(4000).default(""),
  reviewCycle: z.number().int().min(0).max(1000).default(0),
  proposals: z.array(z.object({
    version: z.number().int().min(1).max(20), authorId: discordId, at: z.number().int().positive(),
    summary: z.string().trim().min(1).max(2000), privateNotes: z.string().max(4000).default(""), roleIds: z.array(discordId).max(10), roleNames: z.array(z.string().max(100)).max(10),
    message: receipt.optional(), response: z.object({ kind: z.enum(["accepted", "declined", "countered"]),
      userId: discordId, at: z.number().int().positive(), text: z.string().max(2000).default("") }).strict().optional(),
  }).strict()).max(20).default([]),
  followupId: meetingId.optional(),
  deliveryAttempts: z.number().int().min(0).max(16).default(0), deliveryPaused: z.boolean().default(false),
  nextDeliveryAt: z.number().int().optional(),
  deliveryFailure: z.enum(["review", "proposal", "roles", "notification"]).optional(),
  grant: z.object({ appliedRoleIds: z.array(discordId).max(10).default([]), attempts: z.number().int().min(0).max(16).default(0),
    paused: z.boolean().default(false), nextAttemptAt: z.number().int().optional(), leaseToken: z.string().uuid().optional(), leaseUntil: z.number().int().optional() }).strict().default({ appliedRoleIds: [], attempts: 0, paused: false }),
  managerNoticeVersion: z.number().int().min(0).default(0),
}).strict();
export type MeetingOutcome = z.infer<typeof outcomeSchema>;
