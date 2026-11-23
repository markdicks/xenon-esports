import { randomUUID } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { getDbPool } from "@/lib/db";
import { ticketSetupDraftSchema, type TicketSetupDraft } from "@/lib/ticket-contract";

export const ticketSetupTable = `CREATE TABLE IF NOT EXISTS discord_ticket_setup_sessions (
  session_id CHAR(20) PRIMARY KEY, guild_id VARCHAR(20) NOT NULL, actor_id VARCHAR(20) NOT NULL,
  draft JSON NOT NULL, expires_at DATETIME NOT NULL, lease_token CHAR(36) NULL, leased_until DATETIME NULL,
  KEY setup_actor (guild_id, actor_id), KEY setup_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
let initialization: Promise<void> | undefined;
async function ensureTable() {
  initialization ??= (async () => {
    try { await getDbPool().execute("SELECT session_id FROM discord_ticket_setup_sessions LIMIT 0"); }
    catch (error) { if ((error as { code?: string }).code !== "ER_NO_SUCH_TABLE") throw error; await getDbPool().execute(ticketSetupTable); }
  })().catch((error) => { initialization = undefined; throw error; });
  await initialization;
}
type Identity = { guildId: string; actorId: string; token: string };
const fail = (message: string) => Object.assign(new Error(message), { status: 409 });
export async function beginTicketSetup(input: Identity & { draft: TicketSetupDraft }) {
  await ensureTable(); const c = await getDbPool().getConnection();
  try {
    await c.beginTransaction();
    const [busy] = await c.execute<RowDataPacket[]>("SELECT session_id FROM discord_ticket_setup_sessions WHERE guild_id = ? AND actor_id = ? AND leased_until > NOW() FOR UPDATE", [input.guildId, input.actorId]);
    if (busy.length) throw fail("A ticket setup action is still running. Wait for it to finish before opening another editor.");
    await c.execute("DELETE FROM discord_ticket_setup_sessions WHERE (guild_id = ? AND actor_id = ?) OR (expires_at < NOW() AND (leased_until IS NULL OR leased_until < NOW()))", [input.guildId, input.actorId]);
    await c.execute("INSERT INTO discord_ticket_setup_sessions (session_id, guild_id, actor_id, draft, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 20 MINUTE))", [input.token, input.guildId, input.actorId, JSON.stringify(ticketSetupDraftSchema.parse(input.draft))]);
    await c.commit(); return { success: true };
  } catch (error) { await c.rollback(); throw error; } finally { c.release(); }
}
export async function claimTicketSetup(input: Identity) {
  await ensureTable(); const c = await getDbPool().getConnection();
  try {
    await c.beginTransaction();
    const [rows] = await c.execute<RowDataPacket[]>("SELECT draft, (leased_until > NOW()) AS busy FROM discord_ticket_setup_sessions WHERE session_id = ? AND guild_id = ? AND actor_id = ? AND expires_at > NOW() FOR UPDATE", [input.token, input.guildId, input.actorId]);
    if (!rows.length) throw fail("This ticket setup is no longer active. Run /ticket setup again; saved ticket settings are kept.");
    if (rows[0].busy) throw fail("Another ticket setup action is still running. Wait a moment before continuing.");
    const draft = ticketSetupDraftSchema.parse(typeof rows[0].draft === "string" ? JSON.parse(rows[0].draft) : rows[0].draft), leaseToken = randomUUID();
    await c.execute("UPDATE discord_ticket_setup_sessions SET lease_token = ?, leased_until = DATE_ADD(NOW(), INTERVAL 3 MINUTE), expires_at = DATE_ADD(NOW(), INTERVAL 20 MINUTE) WHERE session_id = ? AND guild_id = ? AND actor_id = ?", [leaseToken, input.token, input.guildId, input.actorId]);
    await c.commit(); return { draft, leaseToken };
  } catch (error) { await c.rollback(); throw error; } finally { c.release(); }
}
export async function progressTicketSetup(input: Identity & { draft: TicketSetupDraft; leaseToken: string; release: boolean; finish: boolean }) {
  await ensureTable();
  const where = "WHERE session_id = ? AND guild_id = ? AND actor_id = ? AND lease_token = ? AND leased_until > NOW()";
  const scope = [input.token, input.guildId, input.actorId, input.leaseToken];
  const [result] = input.finish ? await getDbPool().execute<ResultSetHeader>(`DELETE FROM discord_ticket_setup_sessions ${where}`, scope)
    : await getDbPool().execute<ResultSetHeader>(`UPDATE discord_ticket_setup_sessions SET draft = ?, expires_at = DATE_ADD(NOW(), INTERVAL 20 MINUTE), lease_token = ?, leased_until = ${input.release ? "NULL" : "DATE_ADD(NOW(), INTERVAL 3 MINUTE)"} ${where}`, [JSON.stringify(ticketSetupDraftSchema.parse(input.draft)), input.release ? null : input.leaseToken, ...scope]);
  if (result.affectedRows !== 1) throw fail("This setup action lost its lock. Reopen the current setup message before continuing; no action was repeated.");
  return { success: true };
}
