import { randomBytes, randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db";
import { applyBracketScore, bracketConfigSchema, bracketStateSchema, resolveBracket, type BracketConfig, type BracketState, type SeriesScore } from "@/lib/bracket-contract";
import { eventIdSchema, type EventId } from "@/lib/community-contract";

export const bracketTables = [
  `CREATE TABLE IF NOT EXISTS event_brackets (id CHAR(24) PRIMARY KEY, guild_id VARCHAR(20) NOT NULL, event_id VARCHAR(64) NOT NULL,
    request_id CHAR(36) NOT NULL, revision CHAR(36) NOT NULL, state JSON NOT NULL, published TINYINT(1) NOT NULL DEFAULT 0,
    updated_by_discord_id VARCHAR(20) NOT NULL, updated_by_name VARCHAR(120) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY bracket_request (guild_id, request_id), KEY bracket_guild (guild_id, created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS event_bracket_audit (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, bracket_id CHAR(24) NOT NULL,
    actor_id VARCHAR(20) NOT NULL, actor_name VARCHAR(120) NOT NULL, operation VARCHAR(40) NOT NULL, old_state JSON NULL, new_state JSON NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), KEY bracket_history (bracket_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];
const decode = (value: unknown) => typeof value === "string" ? JSON.parse(value) : value;
function fail(message: string, status = 409): never { throw Object.assign(Error(message), { status }); }
let initialization: Promise<void> | undefined;
async function ensureTables() {
  initialization ??= (async () => {
    for (const index of [0, 1]) {
      const name = ["event_brackets", "event_bracket_audit"][index];
      try { await getDbPool().execute(`SELECT id FROM ${name} LIMIT 0`); }
      catch (error) { if ((error as { code?: string }).code !== "ER_NO_SUCH_TABLE") throw error; await getDbPool().execute(bracketTables[index]); }
    }
  })().catch((error) => { initialization = undefined; throw error; });
  await initialization;
}
function project(row: RowDataPacket) {
  const state = bracketStateSchema.parse(decode(row.state));
  return { id: String(row.id), eventId: eventIdSchema.parse(row.event_id), revision: String(row.revision), state,
    enabled: Number(row.published) === 1, unlisted: true as const, updatedAt: new Date(row.updated_at).toISOString(), ...resolveBracket(state) };
}
export type PublicBracket = ReturnType<typeof project>;
export async function publicBracket(id: string): Promise<PublicBracket | null> {
  try {
    const [rows] = await getDbPool().execute<RowDataPacket[]>("SELECT id, event_id, revision, state, published, updated_at FROM event_brackets WHERE id = ? AND published = 1 LIMIT 1", [id]);
    return rows[0] ? project(rows[0]) : null;
  } catch (error) { if ((error as { code?: string }).code === "ER_NO_SUCH_TABLE") return null; throw error; }
}
export async function listBrackets(guildId: string) {
  await ensureTables();
  const [rows] = await getDbPool().execute<RowDataPacket[]>("SELECT id, event_id, revision, state, published, updated_at FROM event_brackets WHERE guild_id = ? ORDER BY created_at DESC LIMIT 100", [guildId]);
  return { brackets: rows.map((row) => { const value = project(row); return { id: value.id, eventId: value.eventId, name: value.state.name, format: value.state.format, entrants: value.state.entrants.length, enabled: value.enabled, revision: value.revision, updatedAt: value.updatedAt, champion: value.champion }; }) };
}
export async function bracketDetail(guildId: string, id: string) {
  await ensureTables();
  const [rows] = await getDbPool().execute<RowDataPacket[]>("SELECT id, event_id, revision, state, published, updated_at FROM event_brackets WHERE guild_id = ? AND id = ? LIMIT 1", [guildId, id]);
  if (!rows[0]) fail("Bracket not found.", 404);
  const [history] = await getDbPool().execute<RowDataPacket[]>("SELECT actor_id, actor_name, operation, created_at FROM event_bracket_audit WHERE bracket_id = ? ORDER BY id DESC LIMIT 12", [id]);
  return { bracket: project(rows[0]), history: history.map((row) => ({ actorId: String(row.actor_id), actorName: String(row.actor_name), operation: String(row.operation), at: new Date(row.created_at).toISOString() })) };
}
type Actor = { guildId: string; actorId: string; actorName: string };
async function audit(c: PoolConnection, id: string, actor: Actor, operation: string, before: unknown, after: unknown) {
  await c.execute("INSERT INTO event_bracket_audit (bracket_id, actor_id, actor_name, operation, old_state, new_state) VALUES (?, ?, ?, ?, ?, ?)", [id, actor.actorId, actor.actorName, operation, before ? JSON.stringify(before) : null, JSON.stringify(after)]);
}
export async function createBracket(input: Actor & { eventId: EventId; requestId: string; config: BracketConfig }) {
  await ensureTables(); const config = bracketConfigSchema.parse(input.config), c = await getDbPool().getConnection();
  let id = randomBytes(12).toString("hex");
  try {
    await c.beginTransaction();
    const state = bracketStateSchema.parse({ ...config, scores: {} });
    // The unique request key serialises duplicate submissions without a missing-row gap lock.
    await c.execute("INSERT INTO event_brackets (id, guild_id, event_id, request_id, revision, state, published, updated_by_discord_id, updated_by_name) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)",
      [id, input.guildId, input.eventId, input.requestId, randomUUID(), JSON.stringify(state), input.actorId, input.actorName]);
    await audit(c, id, input, "created", null, { state, enabled: false }); await c.commit();
  } catch (error) {
    await c.rollback();
    if ((error as { code?: string }).code !== "ER_DUP_ENTRY") throw error;
    const [rows] = await getDbPool().execute<RowDataPacket[]>("SELECT id FROM event_brackets WHERE guild_id = ? AND request_id = ?", [input.guildId, input.requestId]);
    if (!rows[0]) throw error; id = String(rows[0].id);
  } finally { c.release(); }
  return bracketDetail(input.guildId, id);
}
type Change = Actor & { id: string; revision: string } & (
  { action: "configure"; config: BracketConfig; confirmReset: boolean } | { action: "score"; matchId: string; score: SeriesScore; confirmReset: boolean }
  | { action: "sharing"; enabled: boolean } | { action: "reset"; confirmed: true });
export async function changeBracket(input: Change) {
  await ensureTables(); const c = await getDbPool().getConnection();
  try {
    await c.beginTransaction();
    const [rows] = await c.execute<RowDataPacket[]>("SELECT id, event_id, revision, state, published, updated_at FROM event_brackets WHERE guild_id = ? AND id = ? FOR UPDATE", [input.guildId, input.id]);
    if (!rows[0]) fail("Bracket not found.", 404);
    const before = project(rows[0]);
    if (before.revision !== input.revision) fail("This bracket changed in another editor. Reload it before saving.");
    let state: BracketState = before.state, enabled = before.enabled;
    if (input.action === "configure") {
      const config = bracketConfigSchema.parse(input.config);
      const structure = (value: BracketConfig) => JSON.stringify([value.format, value.entrants, value.roundBestOf, value.finalBestOf]);
      if (structure(state) !== structure(config)) {
        if (Object.keys(state.scores).length && !input.confirmReset) fail("Changing entrants, structure or series lengths clears recorded results. Confirm the reset before saving.");
        state = bracketStateSchema.parse({ ...config, scores: {} });
      } else state = { ...state, name: config.name };
    } else if (input.action === "score") {
      const result = applyBracketScore(state, input.matchId, input.score);
      if (result.cleared.length && !input.confirmReset) fail(`This correction clears ${result.cleared.length} affected later result(s). Confirm the reset before saving.`);
      state = result.state;
    } else if (input.action === "sharing") enabled = input.enabled;
    else state = { ...state, scores: {} };
    await c.execute("UPDATE event_brackets SET state = ?, published = ?, revision = ?, updated_by_discord_id = ?, updated_by_name = ? WHERE guild_id = ? AND id = ?",
      [JSON.stringify(state), enabled ? 1 : 0, randomUUID(), input.actorId, input.actorName, input.guildId, input.id]);
    await audit(c, input.id, input, input.action, { state: before.state, enabled: before.enabled }, { state, enabled });
    await c.commit();
  } catch (error) { await c.rollback(); throw error; } finally { c.release(); }
  return bracketDetail(input.guildId, input.id);
}
