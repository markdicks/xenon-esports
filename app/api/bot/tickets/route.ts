import { z } from "zod";
import { authorizeBot, meetingJson as json, readMeetingJson } from "@/lib/meeting-api";
import { ticketConfigSchema, ticketDiscordId as discordId, ticketId, ticketStateSchema } from "@/lib/ticket-contract";
import { changeTicket, leaseTicket, listTickets, readTicket, reserveTicket, saveTicketConfig, saveTicketProgress, ticketConfig, ticketJobs } from "@/lib/tickets";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const identity = { guildId: discordId }, target = { ...identity, id: ticketId }, revision = z.string().uuid();
const schema = z.discriminatedUnion("action", [
  z.object({ ...identity, action: z.literal("config") }).strict(),
  z.object({ ...identity, action: z.literal("save-config"), revision: revision.nullable(), actorId: discordId, config: ticketConfigSchema, mayChangeAccess: z.boolean() }).strict(),
  z.object({ ...identity, action: z.literal("reserve"), openerId: discordId, subject: z.string().trim().min(1).max(100), description: z.string().trim().min(1).max(1500), panelMessageId: discordId }).strict(),
  z.object({ ...identity, action: z.literal("read"), id: ticketId.optional(), channelId: discordId.optional() }).strict().refine((v) => Boolean(v.id) !== Boolean(v.channelId)),
  z.object({ ...identity, action: z.literal("list"), before: z.number().int().positive().optional() }).strict(),
  z.object({ ...target, action: z.literal("change"), revision, actorId: discordId, operation: z.enum(["claim", "unclaim", "close", "reopen", "delete", "add", "remove", "transcript"]), value: z.string().trim().max(500).optional() }).strict(),
  z.object({ ...identity, action: z.literal("jobs") }).strict(),
  z.object({ ...target, action: z.literal("lease") }).strict(),
  z.object({ ...target, action: z.literal("progress"), revision, leaseToken: revision, ticket: ticketStateSchema, release: z.boolean() }).strict().refine((v) => v.ticket.id === v.id && v.ticket.guildId === v.guildId),
]);
export async function POST(request: Request) {
  if (!authorizeBot(request)) return json({ error: "Unauthorized" }, 401);
  let body; try { body = schema.safeParse(await readMeetingJson(request, 32000)); } catch { return json({ error: "Invalid ticket request." }, 400); }
  if (!body.success) return json({ error: "Invalid ticket request." }, 400);
  const v = body.data;
  try {
    switch (v.action) {
      case "config": return json(await ticketConfig(v.guildId));
      case "save-config": return json(await saveTicketConfig(v));
      case "reserve": return json(await reserveTicket(v));
      case "read": return json(await readTicket(v.guildId, v.id, v.channelId));
      case "list": return json(await listTickets(v.guildId, v.before));
      case "change": return json(await changeTicket(v));
      case "jobs": return json(await ticketJobs(v.guildId));
      case "lease": return json(await leaseTicket(v.guildId, v.id));
      case "progress": return json(await saveTicketProgress(v));
    }
  } catch (error) {
    const e = error as { status?: number; message?: string }, status = e.status && [400, 403, 404, 409, 429].includes(e.status) ? e.status : 503;
    return json({ error: status === 503 ? "Ticket storage is unavailable. Check the website connection and ticket migration 012." : e.message }, status);
  }
}
