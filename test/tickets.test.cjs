const test = require("node:test"), assert = require("node:assert/strict"), load = require("./load-typescript.cjs");
const contract = load("lib/ticket-contract.ts"), id = (n) => String(100000000000000000n + BigInt(n));
const revision = "0899fdb8-5e85-45fb-b399-5d77523f8300", ticketId = "a".repeat(24);
const initial = () => contract.ticketStateSchema.parse({ id: ticketId, number: 1, guildId: id(1), openerId: id(2), subject: "Help", description: "An issue", createdAt: Date.now(), status: "open", categoryId: id(20), archiveCategoryId: id(21), logChannelId: id(22), staffRoleIds: [id(10)], changedBy: id(2) });
test("ticket configuration rejects arbitrary keys, incomplete enabled setups and public/log collisions", () => {
  assert.equal(contract.ticketConfigSchema.parse({}).enabled, false);
  assert.equal(contract.ticketConfigSchema.parse({}).managerRoleIds, null);
  for (const value of [{ secret: "bad" }, { enabled: true }, { panelChannelId: id(20), logChannelId: id(20) }, { embed: { ...contract.defaultTicketEmbed, image: "javascript:alert(1)" } }]) assert.equal(contract.ticketConfigSchema.safeParse(value).success, false);
});
test("ticket state transitions require closure before deletion, retain conversation identity and bound guests", () => {
  let s = initial(); assert.throws(() => contract.ticketChange(structuredClone(s), "delete", id(3)), /unavailable/);
  s = contract.ticketChange(s, "claim", id(3)); assert.equal(s.claimedBy, id(3)); assert.throws(() => contract.ticketChange(structuredClone(s), "claim", id(4)), /already claimed/);
  s = contract.ticketChange(s, "add", id(3), id(4)); s = contract.ticketChange(s, "add", id(3), id(4)); assert.deepEqual(s.memberIds, [id(4)]);
  s = contract.ticketChange(s, "close", id(2), "Resolved"); assert.equal(s.status, "closing"); assert.equal(s.closeVersion, 1); assert.throws(() => contract.ticketChange(s, "reopen", id(3)), /being processed/);
  s.status = "closed"; s = contract.ticketChange(s, "reopen", id(3)); assert.equal(s.status, "reopening"); assert.equal(s.id, ticketId); assert.equal(s.subject, "Help");
  s.status = "closed"; s = contract.ticketChange(s, "delete", id(3)); assert.equal(s.status, "deleting");
});
function fixture() {
  let data = { state: initial(), revision, leased: 0 }, audits = [], tail = Promise.resolve();
  const config = contract.ticketConfigSchema.parse({ enabled: true, panelChannelId: id(24), panelMessageId: id(25), categoryId: id(20), archiveCategoryId: id(21), logChannelId: id(22), staffRoleIds: [id(10)] });
  async function execute(target, sql, p = []) {
    if (sql.startsWith("CREATE")) return [{}];
    if (sql.includes("SELECT configuration")) return [[{ configuration: config }]];
    if (sql.includes("SELECT revision, configuration")) return [[{ revision, configuration: config }]];
    if (sql.includes("WHERE active_key =")) return [[structuredClone(target)]];
    if (sql.startsWith("SELECT revision, state")) return [[structuredClone(target)]];
    if (sql.startsWith("UPDATE discord_tickets SET state")) { target.state = JSON.parse(p[0]); target.revision = p[1]; return [{ affectedRows: 1 }]; }
    if (sql.startsWith("INSERT INTO discord_ticket_audit")) { audits.push(p); return [{}]; }
    throw Error(sql);
  }
  const pool = { execute: (sql, p) => execute(data, sql, p), getConnection: async () => {
    let draft, release;
    return { async beginTransaction() { const before = tail; tail = new Promise((resolve) => { release = resolve; }); await before; draft = structuredClone(data); }, execute: (sql, p) => execute(draft, sql, p), async commit() { data = draft; }, async rollback() {}, release() { release(); } };
  } };
  const api = load("lib/tickets.ts", { "@/lib/db": { getDbPool: () => pool } });
  return { api, config, data: () => data, set: (v) => { Object.assign(data, v); }, audits };
}
test("duplicate opens recover the existing reservation and inactive panel messages cannot reserve tickets", async () => {
  const f = fixture(), input = { guildId: id(1), openerId: id(2), subject: "Other", description: "Other details", panelMessageId: id(25) };
  const [one, two] = await Promise.all([f.api.reserveTicket(input), f.api.reserveTicket(input)]);
  assert.equal(one.ticket.id, two.ticket.id); assert.equal(one.existing, true); assert.equal(one.ticket.subject, "Help");
  await assert.rejects(f.api.reserveTicket({ ...input, panelMessageId: id(26) }), /inactive/);
});
test("stale revisions and active worker leases reject changes, while successful changes create an audit", async () => {
  const f = fixture(), input = { guildId: id(1), id: ticketId, revision, actorId: id(3), operation: "claim" };
  f.set({ leased: 1 }); await assert.rejects(f.api.changeTicket(input), /being processed/); f.set({ leased: 0 });
  await assert.rejects(f.api.changeTicket({ ...input, revision: "old" }), /changed/);
  const result = await f.api.changeTicket(input); assert.equal(result.ticket.claimedBy, id(3)); assert.notEqual(result.revision, revision); assert.equal(f.audits.length, 1);
  await assert.rejects(f.api.changeTicket(input), /changed/);
});
test("worker progress cannot change immutable identity, actor grants or original conversation", async () => {
  const f = fixture(), s = structuredClone(f.data().state), progress = { guildId: id(1), id: ticketId, revision, leaseToken: revision, ticket: s, release: true };
  await assert.rejects(f.api.saveTicketProgress({ ...progress, ticket: { ...s, openerId: id(4) } }), /Immutable/);
  await assert.rejects(f.api.saveTicketProgress({ ...progress, ticket: { ...s, staffRoleIds: [id(99)] } }), /Immutable/);
  const saved = await f.api.saveTicketProgress(progress); assert.ok(saved.revision); assert.equal(f.data().state.openerId, id(2));
});
test("configuration access policy cannot be edited without a root attestation", async () => {
  const f = fixture(); await assert.rejects(f.api.saveTicketConfig({ guildId: id(1), revision, config: { ...f.config, managerRoleIds: [id(44)] }, actorId: id(3), mayChangeAccess: false }), (e) => e.status === 403);
});
test("the internal ticket API authenticates before storage and rejects generic edits, spoofed fields and database errors", async () => {
  const old = process.env.WEBSITE_BOT_TOKEN; process.env.WEBSITE_BOT_TOKEN = "test-ticket-key";
  const route = load("app/api/bot/tickets/route.ts", { "@/lib/tickets": { ticketConfig: async () => { throw Error("database password should not leak"); } } });
  const request = (value, auth) => new Request("https://example.org/api/bot/tickets", { method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer test-ticket-key" } : {}) }, body: JSON.stringify(value) });
  try {
    assert.equal((await route.POST(request({ action: "config", guildId: id(1) }))).status, 401);
    assert.equal((await route.POST(request({ action: "sql", guildId: id(1), query: "DROP TABLE" }, true))).status, 400);
    assert.equal((await route.POST(request({ action: "config", guildId: id(1), serverOwner: true }, true))).status, 400);
    const failure = await route.POST(request({ action: "config", guildId: id(1) }, true)); assert.equal(failure.status, 503); assert.ok(!(await failure.text()).includes("password"));
  } finally { if (old === undefined) delete process.env.WEBSITE_BOT_TOKEN; else process.env.WEBSITE_BOT_TOKEN = old; }
});
