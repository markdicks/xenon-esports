import { z } from "zod";
import { authorizeBot, meetingJson, readMeetingJson } from "@/lib/meeting-api";
import { botStorageFailure } from "@/lib/bot-api-errors";
import { bracketConfigSchema, bracketId, matchId, seriesScoreSchema } from "@/lib/bracket-contract";
import { eventIdSchema } from "@/lib/community-contract";
import { bracketDetail, changeBracket, createBracket, listBrackets } from "@/lib/brackets";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function json(body: unknown, status = 200) { const r = meetingJson(body, status); r.headers.set("X-Xenon-Brackets", "1"); return r; }
const actor = { guildId: z.string().regex(/^\d{17,20}$/), actorId: z.string().regex(/^\d{17,20}$/), actorName: z.string().trim().min(1).max(120), access: z.literal(true) };
const target = { ...actor, id: bracketId, revision: z.string().uuid() };
const schema = z.discriminatedUnion("action", [
  z.object({ ...actor, action: z.literal("list") }).strict(),
  z.object({ ...actor, action: z.literal("detail"), id: bracketId }).strict(),
  z.object({ ...actor, action: z.literal("create"), eventId: eventIdSchema, requestId: z.string().uuid(), config: bracketConfigSchema }).strict(),
  z.object({ ...target, action: z.literal("configure"), config: bracketConfigSchema, confirmReset: z.boolean().default(false) }).strict(),
  z.object({ ...target, action: z.literal("score"), matchId, score: seriesScoreSchema, confirmReset: z.boolean().default(false) }).strict(),
  z.object({ ...target, action: z.literal("sharing"), enabled: z.boolean() }).strict(),
  z.object({ ...target, action: z.literal("reset"), confirmed: z.literal(true) }).strict(),
]);
export async function POST(request: Request) {
  if (!authorizeBot(request)) return json({ error: "Unauthorized" }, 401);
  let parsed; try { parsed = schema.safeParse(await readMeetingJson(request, 24000)); } catch { return json({ error: "Invalid bracket request." }, 400); }
  if (!parsed.success) return json({ error: "Check the bracket name, seeds, format and scores." }, 400);
  const v = parsed.data;
  try {
    if (v.action === "list") return json(await listBrackets(v.guildId));
    if (v.action === "detail") return json(await bracketDetail(v.guildId, v.id));
    if (v.action === "create") return json(await createBracket(v), 201);
    return json(await changeBracket(v));
  } catch (error) {
    const e = error as { status?: number; message?: string };
    if (e.status && [400, 403, 404, 409].includes(e.status)) return json({ error: e.message }, e.status);
    const failure = botStorageFailure(error, "brackets", ["list", "detail"].includes(v.action) ? "read" : "save", request);
    console.error("Bracket storage unavailable", failure.diagnostic); return json(failure.body, 503);
  }
}
