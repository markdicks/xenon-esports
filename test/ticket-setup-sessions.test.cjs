const test = require("node:test"), assert = require("node:assert/strict"), load = require("./load-typescript.cjs");
const contract = load("lib/ticket-contract.ts"), id = (n) => String(100000000000000000n + BigInt(n));
const token = "a".repeat(20), identity = { guildId: id(1), actorId: id(2), token };
const draft = () => contract.ticketSetupDraftSchema.parse({ revision: null, config: {}, page: "roles", edit: false });

function storage({ missing = false } = {}) {
  let rows = new Map(), now = 0, tail = Promise.resolve(), exists = !missing; const queries = [];
  const scope = (map, args) => { const r = map.get(args[0]); return r && r.guild === args[1] && r.actor === args[2] ? r : null; };
  async function execute(map, sql, p = []) {
    queries.push([sql, p]);
    if (sql.includes("LIMIT 0")) { if (!exists) throw Object.assign(Error("Missing table"), { code: "ER_NO_SUCH_TABLE" }); return [[]]; }
    if (sql.startsWith("CREATE TABLE")) { exists = true; return [{}]; }
    if (sql.startsWith("SELECT session_id")) return [[...map.values()].filter((r) => r.guild === p[0] && r.actor === p[1] && r.leaseUntil > now)];
    if (sql.startsWith("DELETE") && sql.includes("expires_at <")) { for (const [key, r] of map) if ((r.guild === p[0] && r.actor === p[1]) || (r.expires < now && !(r.leaseUntil > now))) map.delete(key); return [{}]; }
    if (sql.startsWith("INSERT")) { map.set(p[0], { guild: p[1], actor: p[2], draft: JSON.parse(p[3]), expires: now + 1200000, lease: null, leaseUntil: null }); return [{ affectedRows: 1 }]; }
    if (sql.startsWith("SELECT draft")) { const r = scope(map, p); return [r && r.expires > now ? [{ draft: r.draft, busy: r.leaseUntil > now ? 1 : 0 }] : []]; }
    if (sql.startsWith("UPDATE") && sql.includes("SET lease_token")) { const r = scope(map, p.slice(1)); Object.assign(r, { lease: p[0], leaseUntil: now + 180000, expires: now + 1200000 }); return [{ affectedRows: 1 }]; }
    const args = sql.startsWith("DELETE") ? p : p.slice(2), r = scope(map, args);
    if (!r || r.lease !== args[3] || !(r.leaseUntil > now)) return [{ affectedRows: 0 }];
    if (sql.startsWith("DELETE")) map.delete(args[0]);
    else Object.assign(r, { draft: JSON.parse(p[0]), lease: p[1], leaseUntil: p[1] ? now + 180000 : null, expires: now + 1200000 });
    return [{ affectedRows: 1 }];
  }
  const pool = { execute: (sql, p) => execute(rows, sql, p), getConnection: async () => {
    let copy, unlock;
    return { beginTransaction: async () => { const before = tail; tail = new Promise((r) => { unlock = r; }); await before; copy = structuredClone(rows); },
      execute: (sql, p) => execute(copy, sql, p), commit: async () => { rows = copy; }, rollback: async () => {}, release: () => unlock() };
  } };
  return { api: load("lib/ticket-setup-sessions.ts", { "@/lib/db": { getDbPool: () => pool } }), queries, advance: (ms) => { now += ms; } };
}

test("setup claims bind the member/server, serialize concurrent workers and fence stale progress", async () => {
  const f = storage(), { api } = f;
  await api.beginTicketSetup({ ...identity, draft: draft() });
  for (const patch of [{ actorId: id(3) }, { guildId: id(4) }]) await assert.rejects(api.claimTicketSetup({ ...identity, ...patch }), /no longer active/);
  const attempts = await Promise.allSettled([api.claimTicketSetup(identity), api.claimTicketSetup(identity)]);
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
  const first = attempts.find((r) => r.status === "fulfilled").value;
  await assert.rejects(api.beginTicketSetup({ ...identity, token: "b".repeat(20), draft: draft() }), /still running/);
  f.advance(180001); const next = await api.claimTicketSetup(identity);
  await assert.rejects(api.progressTicketSetup({ ...identity, ...first, release: true, finish: false }), /lost its lock/);
  next.draft.page = "channels"; next.draft.config.staffRoleIds = [id(10)];
  await api.progressTicketSetup({ ...identity, ...next, release: true, finish: false });
  const restored = await api.claimTicketSetup(identity); assert.deepEqual(restored.draft.config.staffRoleIds, [id(10)]); assert.equal(restored.draft.page, "channels");
  await api.progressTicketSetup({ ...identity, ...restored, release: true, finish: true });
  await assert.rejects(api.claimTicketSetup(identity), /no longer active/);
  assert.equal(f.queries.some(([sql]) => sql.startsWith("CREATE")), false);
});

test("successful progress extends inactivity expiry; abandoned setup cannot be resumed", async () => {
  const f = storage(); await f.api.beginTicketSetup({ ...identity, draft: draft() });
  f.advance(1100000); const current = await f.api.claimTicketSetup(identity);
  await f.api.progressTicketSetup({ ...identity, ...current, release: true, finish: false });
  f.advance(1100000); const resumed = await f.api.claimTicketSetup(identity); assert.ok(resumed.leaseToken);
  await f.api.progressTicketSetup({ ...identity, ...resumed, release: true, finish: false });
  f.advance(1200001); await assert.rejects(f.api.claimTicketSetup(identity), /no longer active/);
});

test("the setup table is created automatically only when it is missing", async () => {
  const f = storage({ missing: true }); await f.api.beginTicketSetup({ ...identity, draft: draft() });
  assert.ok((await f.api.claimTicketSetup(identity)).leaseToken);
  assert.equal(f.queries.filter(([sql]) => sql.startsWith("CREATE TABLE")).length, 1);
});

test("draft storage accepts incomplete choices, while published config retains strict validation and API scope", async (t) => {
  const value = draft(); value.config.enabled = true;
  assert.equal(contract.ticketSetupDraftSchema.safeParse(value).success, true);
  assert.equal(contract.ticketConfigSchema.safeParse(value.config).success, false);
  assert.equal(contract.ticketSetupDraftSchema.safeParse({ ...value, secret: "not-allowed" }).success, false);
  const prior = process.env.WEBSITE_BOT_TOKEN; process.env.WEBSITE_BOT_TOKEN = "setup-key";
  t.after(() => { if (prior === undefined) delete process.env.WEBSITE_BOT_TOKEN; else process.env.WEBSITE_BOT_TOKEN = prior; });
  let calls = 0;
  const api = load("app/api/bot/tickets/route.ts", { "@/lib/ticket-setup-sessions": { claimTicketSetup: async (v) => { calls++; assert.equal(v.actorId, id(2)); return { draft: draft(), leaseToken: "0899fdb8-5e85-45fb-b399-5d77523f8300" }; } } });
  const request = (body, key = "setup-key") => new Request("https://xenon.example/api/bot/tickets", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
  const body = { ...identity, action: "setup-claim" };
  assert.equal((await api.POST(request(body, "wrong"))).status, 401); assert.equal(calls, 0);
  assert.equal((await api.POST(request({ ...body, sql: "not-allowed" }))).status, 400); assert.equal(calls, 0);
  const response = await api.POST(request(body)); assert.equal(response.status, 200); assert.equal(response.headers.get("X-Xenon-Ticket-Setup"), "1"); assert.equal(calls, 1);
});
