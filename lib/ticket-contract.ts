import { z } from "zod";
export const ticketDiscordId = z.string().regex(/^\d{17,20}$/);
export const ticketId = z.string().regex(/^[a-f0-9]{24}$/);
const ids = z.array(ticketDiscordId).max(20).refine((v) => new Set(v).size === v.length);
const image = z.union([z.literal(""), z.string().url().max(1000).refine((v) => {
  const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password;
})]);
export const defaultTicketEmbed = { title: "Xenon Support", description: "Need help or want to speak privately with the Xenon team?\n\nPress **Open ticket**, give us a short description, and a member of our team will assist you. Please open one ticket per issue and avoid sharing passwords or account tokens.", footer: "Xenon Esports • Private support", color: "#4fffd8", buttonLabel: "Open ticket", image: "", thumbnail: "", footerIcon: "", author: "", url: "" };
export const ticketEmbedSchema = z.object({ title: z.string().trim().min(1).max(256), description: z.string().trim().min(1).max(4000), footer: z.string().max(1000),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/), buttonLabel: z.string().trim().min(1).max(80), image, thumbnail: image, footerIcon: image, author: z.string().max(256), url: image }).strict();
export const ticketConfigFields = z.object({ enabled: z.boolean().default(false), panelChannelId: ticketDiscordId.nullable().default(null),
  categoryId: ticketDiscordId.nullable().default(null), archiveCategoryId: ticketDiscordId.nullable().default(null), logChannelId: ticketDiscordId.nullable().default(null),
  panelMessageId: ticketDiscordId.nullable().default(null), staffRoleIds: ids.default([]), managerRoleIds: ids.nullable().default(null), embed: ticketEmbedSchema.default(defaultTicketEmbed) }).strict();
export const ticketSetupToken = z.string().regex(/^[a-f0-9]{20}$/);
export const ticketSetupDraftSchema = z.object({ revision: z.string().uuid().nullable(), config: ticketConfigFields, page: z.enum(["roles", "channels", "message", "access"]), edit: z.boolean(),
  uncertainResource: z.enum(["categoryId", "archiveCategoryId", "logChannelId"]).nullable().default(null) }).strict();
export type TicketSetupDraft = z.infer<typeof ticketSetupDraftSchema>;
export const ticketConfigSchema = ticketConfigFields
  .refine((v) => !v.enabled || Boolean(v.panelChannelId && v.categoryId && v.archiveCategoryId && v.logChannelId && v.staffRoleIds.length), "Choose all ticket resources and at least one support role.")
  .refine((v) => !v.panelChannelId || v.panelChannelId !== v.logChannelId, "The public panel and private logs must use separate channels.")
  .refine((v) => !v.categoryId || v.categoryId !== v.archiveCategoryId, "Choose separate active and archive categories.");
export type TicketConfig = z.infer<typeof ticketConfigSchema>;
export const ticketStateSchema = z.object({ id: ticketId, number: z.number().int().positive(), guildId: ticketDiscordId, openerId: ticketDiscordId,
  subject: z.string().min(1).max(100), description: z.string().min(1).max(1500), createdAt: z.number().int().positive(),
  status: z.enum(["creating", "open", "closing", "closed", "reopening", "deleting", "deleted"]), channelId: ticketDiscordId.nullable().default(null),
  controlMessageId: ticketDiscordId.nullable().default(null), categoryId: ticketDiscordId, archiveCategoryId: ticketDiscordId, logChannelId: ticketDiscordId, staffRoleIds: ids.min(1),
  memberIds: ids.default([]), claimedBy: ticketDiscordId.nullable().default(null), reason: z.string().max(500).default(""), changedBy: ticketDiscordId,
  claimHiddenRoleIds: ids.optional(), openerName: z.string().max(120).optional(), claimantName: z.string().max(120).optional(),
  presentationVersion: z.literal(2).optional(), activityId: z.string().uuid().optional(),
  renamePending: z.boolean().optional(), renameAfter: z.number().int().nonnegative().optional(),
  lastAction: z.object({ operation: z.string().max(30), actorId: ticketDiscordId, at: z.number().int().positive() }).strict().optional(),
  transcript: z.object({ channelId: ticketDiscordId, messageId: ticketDiscordId, at: z.number().int().positive() }).nullable().default(null),
  closeVersion: z.number().int().nonnegative().default(0), exportRequested: z.number().int().positive().nullable().default(null), dirty: z.boolean().default(true), error: z.string().max(200).nullable().default(null) }).strict()
  .refine((value) => !value.claimHiddenRoleIds?.some((id) => !value.staffRoleIds.includes(id)), "Claim exclusions must be configured support roles.");
export type TicketState = z.infer<typeof ticketStateSchema>;
export function ticketChange(state: TicketState, operation: string, actorId: string, value?: string): TicketState {
  if (!["open", "closed"].includes(state.status)) throw Object.assign(new Error("This ticket is being processed. Try again shortly."), { status: 409 });
  if (operation === "transcript") state.exportRequested = Date.now();
  else if (operation === "close" && state.status === "open") { state.status = "closing"; state.closeVersion++; state.reason = value || "Closed by request."; }
  else if (operation === "reopen" && state.status === "closed") { state.status = "reopening"; state.transcript = null; }
  else if (operation === "delete" && state.status === "closed") state.status = "deleting";
  else if (operation === "claim" && state.status === "open") {
    if (state.claimedBy && state.claimedBy !== actorId) throw Object.assign(new Error("This ticket is already claimed."), { status: 409 });
    state.claimedBy = actorId;
  } else if (operation === "unclaim" && state.status === "open") state.claimedBy = null;
  else if (operation === "add" && state.status === "open" && value) {
    if (value !== state.openerId && !state.memberIds.includes(value)) state.memberIds.push(ticketDiscordId.parse(value));
  } else if (operation === "remove" && state.status === "open" && value) state.memberIds = state.memberIds.filter((id) => id !== value);
  else throw Object.assign(new Error("That action is unavailable for this ticket."), { status: 409 });
  state.changedBy = actorId; state.lastAction = { operation, actorId, at: Date.now() }; state.dirty = true; state.error = null; return ticketStateSchema.parse(state);
}
