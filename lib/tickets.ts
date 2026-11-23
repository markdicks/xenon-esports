import { randomBytes, randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { getDbPool } from "@/lib/db";
import { ticketChange, ticketConfigSchema, ticketStateSchema, type TicketConfig, type TicketState } from "@/lib/ticket-contract";
// Additive initialization in the existing local database. No bot database connection.
export const ticketTables = [
  `CREATE TABLE IF NOT EXISTS discord_ticket_config (guild_id VARCHAR(20) PRIMARY KEY, revision CHAR(36) NOT NULL, configuration JSON NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS discord_tickets (number BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, id CHAR(24) NOT NULL UNIQUE, guild_id VARCHAR(20) NOT NULL, opener_id VARCHAR(20) NOT NULL, active_key VARCHAR(45) NULL UNIQUE, revision CHAR(36) NOT NULL, state JSON NOT NULL, lease_token CHAR(36) NULL, leased_until DATETIME NULL, next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY ticket_guild (guild_id, number)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS discord_ticket_audit (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, guild_id VARCHAR(20) NOT NULL, ticket_id CHAR(24) NULL, actor_id VARCHAR(20) NOT NULL, action VARCHAR(40) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY ticket_audit (guild_id, ticket_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];
let initialization: Promise<void> | undefined;
export async function ensureTicketTables() {
  initialization ??= (async () => { for (const sql of ticketTables) await getDbPool().execute(sql); })().catch((error) => { initialization = undefined; throw error; });
  await initialization;
}
const decode = (v: unknown) => typeof v === "string" ? JSON.parse(v) : v;
function fail(message: string, status = 409): never { throw Object.assign(new Error(message), { status }); }
async function transaction<T>(work: (c: PoolConnection) => Promise<T>) {
  await ensureTicketTables(); const c = await getDbPool().getConnection();
  try { await c.beginTransaction(); const result = await work(c); await c.commit(); return result; }
  catch (error) { await c.rollback(); throw error; } finally { c.release(); }
}
const audit = (c: PoolConnection, guildId: string, id: string | null, actor: string, action: string) => c.execute("INSERT INTO discord_ticket_audit (guild_id, ticket_id, actor_id, action) VALUES (?, ?, ?, ?)", [guildId, id, actor, action]);
export async function ticketConfig(guildId: string) {
  await ensureTicketTables(); const [rows] = await getDbPool().execute<RowDataPacket[]>("SELECT revision, configuration FROM discord_ticket_config WHERE guild_id = ?", [guildId]);
  return { revision: rows[0]?.revision as string | undefined || null, config: ticketConfigSchema.parse(rows[0] ? decode(rows[0].configuration) : {}) };
}
export async function saveTicketConfig(input: { guildId: string; revision: string | null; config: TicketConfig; actorId: string; mayChangeAccess: boolean }) {
  return transaction(async (c) => {
    const [rows] = await c.execute<RowDataPacket[]>("SELECT revision, configuration FROM discord_ticket_config WHERE guild_id = ? FOR UPDATE", [input.guildId]);
    if ((rows[0]?.revision || null) !== input.revision) fail("Ticket settings changed. Run setup again or reload before saving.");
    const old = ticketConfigSchema.parse(rows[0] ? decode(rows[0].configuration) : {});
    if (!input.mayChangeAccess && JSON.stringify(old.managerRoleIds) !== JSON.stringify(input.config.managerRoleIds)) fail("Only the server owner or Founder can change ticket command access.", 403);
    const revision = randomUUID();
    await c.execute("INSERT INTO discord_ticket_config (guild_id, revision, configuration) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE revision = VALUES(revision), configuration = VALUES(configuration)", [input.guildId, revision, JSON.stringify(input.config)]);
    await audit(c, input.guildId, null, input.actorId, "settings_saved"); return { revision, config: input.config };
  });
}
function project(row: RowDataPacket) { return { revision: row.revision as string, ticket: ticketStateSchema.parse(decode(row.state)) }; }
export async function readTicket(guildId: string, id?: string, channelId?: string) {
  const lookup = id || channelId; if (!lookup) fail("Choose a ticket or channel.", 400);
  await ensureTicketTables(); const [rows] = await getDbPool().execute<RowDataPacket[]>(`SELECT revision, state FROM discord_tickets WHERE guild_id = ? AND ${id ? "id = ?" : "JSON_UNQUOTE(JSON_EXTRACT(state, '$.channelId')) = ?"} LIMIT 1`, [guildId, lookup]);
  if (!rows[0]) fail("This is not a managed Xenon ticket.", 404); return project(rows[0]);
}
export async function listTickets(guildId: string, before?: number) {
  await ensureTicketTables(); const [rows] = await getDbPool().execute<RowDataPacket[]>("SELECT revision, state FROM discord_tickets WHERE guild_id = ? AND number < ? ORDER BY number DESC LIMIT 26", [guildId, before || Number.MAX_SAFE_INTEGER]);
  return { tickets: rows.slice(0, 25).map(project), next: rows.length > 25 ? project(rows[24]).ticket.number : null };
}
export async function reserveTicket(input: { guildId: string; openerId: string; subject: string; description: string; panelMessageId: string }) {
  return transaction(async (c) => {
    const [configRows] = await c.execute<RowDataPacket[]>("SELECT configuration FROM discord_ticket_config WHERE guild_id = ? FOR UPDATE", [input.guildId]);
    const config = ticketConfigSchema.parse(configRows[0] ? decode(configRows[0].configuration) : {});
    if (!config.enabled || config.panelMessageId !== input.panelMessageId) fail("This ticket panel is inactive. Please use the latest panel.");
    const activeKey = `${input.guildId}:${input.openerId}`;
    const [existing] = await c.execute<RowDataPacket[]>("SELECT revision, state FROM discord_tickets WHERE active_key = ?", [activeKey]);
    if (existing[0]) return { ...project(existing[0]), existing: true };
    const [recent] = await c.execute<RowDataPacket[]>("SELECT COUNT(*) AS count FROM discord_tickets WHERE guild_id = ? AND opener_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)", [input.guildId, input.openerId]);
    if (Number(recent[0].count) >= 3) fail("Please wait before opening another ticket.", 429);
    const id = randomBytes(12).toString("hex"), revision = randomUUID();
    const [result] = await c.execute<ResultSetHeader>("INSERT INTO discord_tickets (id, guild_id, opener_id, active_key, revision, state) VALUES (?, ?, ?, ?, ?, JSON_OBJECT())", [id, input.guildId, input.openerId, activeKey, revision]);
    const ticket = ticketStateSchema.parse({ id, number: Number(result.insertId), guildId: input.guildId, openerId: input.openerId, subject: input.subject, description: input.description,
      createdAt: Date.now(), status: "creating", categoryId: config.categoryId, archiveCategoryId: config.archiveCategoryId, logChannelId: config.logChannelId, staffRoleIds: config.staffRoleIds, changedBy: input.openerId });
    await c.execute("UPDATE discord_tickets SET state = ? WHERE id = ?", [JSON.stringify(ticket), id]); await audit(c, input.guildId, id, input.openerId, "opened"); return { revision, ticket, existing: false };
  });
}
export async function changeTicket(input: { guildId: string; id: string; revision: string; actorId: string; operation: string; value?: string }) {
  return transaction(async (c) => {
    const [rows] = await c.execute<RowDataPacket[]>("SELECT revision, state, leased_until > NOW() AS leased FROM discord_tickets WHERE id = ? AND guild_id = ? FOR UPDATE", [input.id, input.guildId]);
    if (!rows[0]) fail("Ticket not found.", 404);
    if (rows[0].revision !== input.revision || rows[0].leased) fail("This ticket changed or is being processed. Please retry shortly.");
    const ticket = ticketChange(project(rows[0]).ticket, input.operation, input.actorId, input.value), revision = randomUUID();
    const activeKey = ["closed", "deleted", "deleting"].includes(ticket.status) ? null : `${ticket.guildId}:${ticket.openerId}`;
    try { await c.execute("UPDATE discord_tickets SET state = ?, revision = ?, active_key = ?, next_attempt_at = NOW() WHERE id = ?", [JSON.stringify(ticket), revision, activeKey, ticket.id]); }
    catch (error) { if ((error as { code?: string }).code === "ER_DUP_ENTRY") fail("This member already has an open ticket."); throw error; }
    await audit(c, input.guildId, ticket.id, input.actorId, input.operation); return { revision, ticket };
  });
}
export async function ticketJobs(guildId: string) {
  await ensureTicketTables(); const [rows] = await getDbPool().execute<RowDataPacket[]>(`SELECT id FROM discord_tickets WHERE guild_id = ? AND JSON_UNQUOTE(JSON_EXTRACT(state, '$.dirty')) = 'true' AND next_attempt_at <= NOW() AND (leased_until IS NULL OR leased_until < NOW()) ORDER BY number LIMIT 5`, [guildId]);
  return { ids: rows.map((r) => String(r.id)) };
}
export async function leaseTicket(guildId: string, id: string) {
  return transaction(async (c) => {
    const token = randomUUID(); const [result] = await c.execute<ResultSetHeader>("UPDATE discord_tickets SET lease_token = ?, leased_until = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE guild_id = ? AND id = ? AND (leased_until IS NULL OR leased_until < NOW())", [token, guildId, id]);
    if (!result.affectedRows) fail("Ticket is already being processed.");
    const [rows] = await c.execute<RowDataPacket[]>("SELECT revision, state FROM discord_tickets WHERE guild_id = ? AND id = ?", [guildId, id]); return { ...project(rows[0]), leaseToken: token };
  });
}
export async function saveTicketProgress(input: { guildId: string; id: string; leaseToken: string; revision: string; ticket: TicketState; release: boolean }) {
  return transaction(async (c) => {
    const [rows] = await c.execute<RowDataPacket[]>("SELECT revision, state FROM discord_tickets WHERE id = ? AND guild_id = ? AND lease_token = ? AND leased_until > NOW() FOR UPDATE", [input.id, input.guildId, input.leaseToken]);
    if (!rows[0] || rows[0].revision !== input.revision) fail("Ticket worker lease changed.");
    const old = project(rows[0]).ticket, ticket = input.ticket;
    for (const key of ["id", "number", "guildId", "openerId", "createdAt", "subject", "description", "categoryId", "archiveCategoryId", "logChannelId", "staffRoleIds"] as const) if (JSON.stringify(old[key]) !== JSON.stringify(ticket[key])) fail("Immutable ticket fields changed.", 400);
    const revision = randomUUID(), activeKey = ["closed", "deleting", "deleted"].includes(ticket.status) ? null : `${ticket.guildId}:${ticket.openerId}`;
    await c.execute("UPDATE discord_tickets SET state = ?, revision = ?, active_key = ?, lease_token = ?, leased_until = ?, next_attempt_at = DATE_ADD(NOW(), INTERVAL ? SECOND) WHERE id = ?",
      [JSON.stringify(ticket), revision, activeKey, input.release ? null : input.leaseToken, input.release ? null : new Date(Date.now() + 600000), ticket.error ? 300 : 30, ticket.id]); return { revision };
  });
}
