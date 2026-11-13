import { z } from "zod";

export const eventIds = ["valorant-december-2026", "rocket-league-december-2026"] as const;
export const eventIdSchema = z.enum(eventIds);
export type EventId = z.infer<typeof eventIdSchema>;
export const valorantEventId = eventIds[0];
export const pollChoices = [
  { id: "skirmish-2v2", title: "2v2 Skirmish", description: "Smaller teams, with best-of-three (BO3) series." },
  { id: "standard-5v5", title: "5v5 Standard Tournament", description: "A traditional community tournament with full teams of five." },
] as const;
export const choiceSchema = z.enum(["skirmish-2v2", "standard-5v5"]);
export type PollChoice = z.infer<typeof choiceSchema>;
const publicText = (maximum: number) => z.string().trim().max(maximum).refine((value) => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value));
const linkSchema = z.string().url().max(512).refine((value) => {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash; } catch { return false; }
});
export const eventSettingsSchema = z.object({
  name: publicText(100).min(1), description: publicText(1200).min(1),
  startsAt: z.string().datetime().nullable(), format: publicText(200).nullable(),
  status: z.enum(["planning", "announced", "closed", "complete"]),
  pollOpen: z.boolean(), registrationOpen: z.boolean(),
  organisers: z.array(publicText(100).min(1)).max(10), participation: publicText(1200),
  links: z.array(z.object({ label: publicText(80).min(1), url: linkSchema }).strict()).max(5),
}).strict();
export type EventSettings = z.infer<typeof eventSettingsSchema>;
export const registrationStatuses = ["pending", "accepted", "waitlisted", "declined", "withdrawn"] as const;
export const registrationStatusSchema = z.enum(registrationStatuses);
export const preShowSchema = z.object({
  discordUsername: publicText(120).min(2, "Enter your Discord username or user ID.").refine((value) => !/[\r\n]/.test(value)),
  riotId: publicText(80).min(3).refine((value) => /^[^#\s][^#\r\n]*#[^#\s]+$/.test(value), "Enter your Riot ID including #tag."),
  rank: publicText(60).default(""), region: publicText(100).min(1, "Enter your region or server."),
  availability: publicText(600).min(1, "Tell us when you are available."), message: publicText(600).default(""),
  agreement: z.literal(true, { error: "Please agree to community rules and organiser contact." }),
  requestId: z.string().uuid(), website: z.literal("").default(""),
}).strict();
export type PreShowInput = z.infer<typeof preShowSchema>;
export type PublicEvent = { id: EventId; game: string; available: boolean; settings: EventSettings;
  results: { total: number; votes: Record<PollChoice, number> } | null };
export const publicEventSchema = z.object({ id: eventIdSchema, game: z.string(), available: z.boolean(), settings: eventSettingsSchema,
  results: z.object({ total: z.number().int().nonnegative().safe(), votes: z.object({ "skirmish-2v2": z.number().int().nonnegative().safe(), "standard-5v5": z.number().int().nonnegative().safe() }) }).nullable(),
}).refine((event) => !event.results || event.results.total === event.results.votes["skirmish-2v2"] + event.results.votes["standard-5v5"]);
export const defaultEvents: Record<EventId, { game: string; settings: EventSettings }> = {
  "valorant-december-2026": { game: "Valorant", settings: {
    name: "Valorant - December Community Event", description: "Xenon's first December Valorant community event is in planning. The community will help shape the main event format.",
    startsAt: null, format: null, status: "planning", pollOpen: false, registrationOpen: false,
    organisers: ["Xenon Community", "Xenon Competitive"], participation: "Dates, eligibility and event-specific rules are being finalised. The main format is subject to organiser review, interest levels, player availability and feasibility.", links: [],
  } },
  "rocket-league-december-2026": { game: "Rocket League", settings: {
    name: "Rocket League - December Community Event", description: "A Rocket League community activity is being prepared for December. Confirmed details will be published here and in Discord.",
    startsAt: null, format: null, status: "planning", pollOpen: false, registrationOpen: false,
    organisers: ["Xenon Community", "Xenon Competitive"], participation: "The date, format and participation requirements remain unconfirmed. Registration is not open.", links: [],
  } },
};
