const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), { randomUUID } = require("node:crypto");
const load = require("./load-typescript.cjs"), contract = load("lib/bracket-contract.ts");
const guildId = "111111111111111111", actorId = "222222222222222222", actorName = "TEST server nickname";
const config = () => ({ name: "TEST bracket", format: "single", entrants: ["TEST one", "TEST two", "TEST three", "TEST four"], roundBestOf: 3, finalBestOf: 5 });
const actor = { guildId, actorId, actorName };
function fixture({ failAudit = false, missing = false } = {}) {
  let data = { rows: new Map(), history: [] }, tail = Promise.resolve(); const calls = [];
  async function execute(target, sql, params = []) {
    calls.push([sql, params]);
    if (/^(SELECT id FROM event_brackets LIMIT 0|SELECT id FROM event_bracket_audit LIMIT 0)/.test(sql)) return [[]];
    if (sql.startsWith("INSERT INTO event_brackets")) {
      if ([...target.rows.values()].some((v) => v.guild_id === params[1] && v.request_id === params[3])) throw Object.assign(Error("TEST duplicate"), { code: "ER_DUP_ENTRY" });
      const [id, guild_id, event_id, request_id, revision, state] = params; target.rows.set(id, { id, guild_id, event_id, request_id, revision, state, published: 0, updated_at: new Date() }); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("SELECT id FROM event_brackets WHERE guild_id")) return [[...target.rows.values()].filter((v) => v.guild_id === params[0] && v.request_id === params[1]).map((v) => ({ id: v.id }))];
    if (sql.startsWith("SELECT id, event_id, revision, state, published, updated_at FROM event_brackets")) {
      if (missing) throw Object.assign(Error("TEST missing table"), { code: "ER_NO_SUCH_TABLE" });
      return [[...target.rows.values()].filter((v) => sql.includes("WHERE id = ?") ? v.id === params[0] && v.published === 1 : v.guild_id === params[0] && (params.length === 1 || v.id === params[1]))];
    }
    if (sql.startsWith("UPDATE event_brackets SET state")) { const row = target.rows.get(params[6]); assert.equal(row.guild_id, params[5]); Object.assign(row, { state: params[0], published: params[1], revision: params[2], updated_at: new Date() }); return [{ affectedRows: 1 }]; }
    if (sql.startsWith("INSERT INTO event_bracket_audit")) {
      if (failAudit) throw Error("TEST PRIVATE audit DB failure");
      target.history.push({ bracket_id: params[0], actor_id: params[1], actor_name: params[2], operation: params[3], before: params[4] && JSON.parse(params[4]), after: JSON.parse(params[5]), created_at: new Date() }); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("SELECT actor_id, actor_name")) return [target.history.filter((v) => v.bracket_id === params[0]).toReversed().slice(0, 12)];
    throw Error(`Unexpected test query: ${sql}`);
  }
  const pool = { execute: (sql, params) => execute(data, sql, params), getConnection: async () => {
    let draft, release;
    return { async beginTransaction() { const before = tail; tail = new Promise((resolve) => { release = resolve; }); await before; draft = structuredClone(data); },
      execute: (sql, params) => execute(draft, sql, params), async commit() { data = draft; }, async rollback() {}, release() { release(); } };
  } };
  const api = load("lib/brackets.ts", { "@/lib/db": { getDbPool: () => pool }, "@/lib/bracket-contract": contract });
  const create = (input = {}) => api.createBracket({ ...actor, eventId: "valorant-december-2026", requestId: randomUUID(), config: config(), ...input });
  const change = (b, input) => api.changeBracket({ ...actor, id: b.id, revision: b.revision, ...input });
  return { api, create, change, calls, data: () => data, failAudit: () => { failAudit = true; } };
}
test("creation is an unlisted disabled draft, audits the actor nickname, and duplicate requests create only once", async () => {
  const f = fixture(), requestId = randomUUID();
  const [one, two] = await Promise.all([f.create({ requestId }), f.create({ requestId })]);
  assert.equal(one.bracket.id, two.bracket.id); assert.match(one.bracket.id, /^[a-f0-9]{24}$/); assert.equal(one.bracket.enabled, false); assert.equal(one.bracket.unlisted, true);
  assert.equal(await f.api.publicBracket(one.bracket.id), null); assert.equal(f.data().rows.size, 1); assert.equal(f.data().history.length, 1);
  assert.equal(f.data().history[0].actor_name, actorName); assert.equal(f.data().history[0].before, null);
  assert.equal((await f.api.listBrackets("333333333333333333")).brackets.length, 0);
  await assert.rejects(f.api.bracketDetail("333333333333333333", one.bracket.id), (e) => e.status === 404);
  await assert.rejects(f.change(one.bracket, { action: "sharing", enabled: true, guildId: "333333333333333333" }), (e) => e.status === 404);
});
test("sharing is reversible and public reads omit guild, actor and audit data", async () => {
  const f = fixture(), { bracket: b } = await f.create();
  const enabled = await f.change(b, { action: "sharing", enabled: true }), value = await f.api.publicBracket(b.id);
  assert.equal(value.id, b.id); assert.equal(value.enabled, true); assert.equal(value.unlisted, true);
  for (const key of ["guildId", "guild_id", "actorId", "actorName", "history", "requestId"]) assert.equal(value[key], undefined);
  await f.change(enabled.bracket, { action: "sharing", enabled: false }); assert.equal(await f.api.publicBracket(b.id), null);
  assert.deepEqual(f.data().history.map((v) => v.operation), ["created", "sharing", "sharing"]);
});
test("public read does not initialise schema, and a missing table is indistinguishable from a missing bracket", async () => {
  const f = fixture({ missing: true }); assert.equal(await f.api.publicBracket("a".repeat(24)), null);
  assert.equal(f.calls.length, 1); assert.ok(!f.calls.some(([sql]) => /CREATE|LIMIT 0/.test(sql)));
});
test("audit failure rolls back creation and all state changes", async () => {
  const f = fixture({ failAudit: true }); await assert.rejects(f.create(), /audit DB failure/); assert.equal(f.data().rows.size, 0); assert.equal(f.data().history.length, 0);
  const updates = fixture(), { bracket } = await updates.create(); updates.failAudit();
  await assert.rejects(updates.change(bracket, { action: "sharing", enabled: true }), /audit DB failure/);
  const saved = (await updates.api.bracketDetail(guildId, bracket.id)).bracket; assert.equal(saved.enabled, false); assert.equal(saved.revision, bracket.revision); assert.equal(updates.data().history.length, 1);
});
test("concurrent saves use a revision check; a stale editor cannot overwrite scores", async () => {
  const f = fixture(), { bracket: b } = await f.create();
  const results = await Promise.allSettled([f.change(b, { action: "score", matchId: "u1m1", score: { a: 2, b: 0 } }), f.change(b, { action: "score", matchId: "u1m1", score: { a: 0, b: 2 } })]);
  assert.equal(results.filter((v) => v.status === "fulfilled").length, 1); assert.equal(results.find((v) => v.status === "rejected").reason.status, 409);
  assert.equal(f.data().history.length, 2); assert.deepEqual((await f.api.bracketDetail(guildId, b.id)).bracket.state.scores.u1m1, { a: 2, b: 0 });
});
test("renaming preserves results, structural edits and downstream corrections require explicit confirmation", async () => {
  const f = fixture(); let b = (await f.create()).bracket;
  for (const [matchId, score] of [["u1m1", { a: 2, b: 0 }], ["u1m2", { a: 2, b: 0 }], ["u2m1", { a: 3, b: 0 }]]) b = (await f.change(b, { action: "score", matchId, score })).bracket;
  b = (await f.change(b, { action: "configure", config: { ...config(), name: "TEST renamed" }, confirmReset: false })).bracket;
  assert.equal(Object.keys(b.state.scores).length, 3);
  await assert.rejects(f.change(b, { action: "score", matchId: "u1m1", score: { a: 0, b: 2 }, confirmReset: false }), (e) => e.status === 409 && /affected/.test(e.message));
  b = (await f.change(b, { action: "score", matchId: "u1m1", score: { a: 0, b: 2 }, confirmReset: true })).bracket;
  assert.equal(b.state.scores.u2m1, undefined); assert.ok(b.state.scores.u1m2);
  const changed = { ...config(), entrants: ["TEST changed", ...config().entrants.slice(1)] };
  await assert.rejects(f.change(b, { action: "configure", config: changed, confirmReset: false }), /Confirm the reset/);
  b = (await f.change(b, { action: "configure", config: changed, confirmReset: true })).bracket;
  assert.deepEqual(b.state.scores, {}); assert.equal(f.data().history.at(-1).before.state.entrants[0], "TEST one"); assert.equal(f.data().history.at(-1).after.state.entrants[0], "TEST changed");
});
test("staff API requires the existing bot secret and rejects actor, arbitrary key and action spoofing", async (t) => {
  const previous = process.env.WEBSITE_BOT_TOKEN; process.env.WEBSITE_BOT_TOKEN = "TEST bracket secret";
  t.after(() => { if (previous === undefined) delete process.env.WEBSITE_BOT_TOKEN; else process.env.WEBSITE_BOT_TOKEN = previous; });
  let calls = 0; const route = load("app/api/bot/brackets/route.ts", { "@/lib/brackets": { listBrackets: async () => { calls++; return { brackets: [] }; } } });
  const request = (body, auth = true) => new Request("https://xenon.test/api/bot/brackets", { method: "POST", headers: auth ? { authorization: "Bearer TEST bracket secret" } : {}, body: JSON.stringify(body) });
  assert.equal((await route.POST(request({ ...actor, access: true, action: "list" }, false))).status, 401); assert.equal(calls, 0);
  for (const body of [{ ...actor, access: false, action: "list" }, { ...actor, access: true, action: "list", sql: "TEST arbitrary SQL" }, { ...actor, access: true, action: "delete" }, { ...actor, access: true, action: "create", requestId: randomUUID(), eventId: "other-event", config: config() }]) assert.equal((await route.POST(request(body))).status, 400);
  assert.equal((await route.POST(request({ ...actor, access: true, action: "list" }))).status, 200); assert.equal(calls, 1);
});
test("public API has no write handler, disables indexing/caching and rechecks link access before returning 304", async () => {
  const f = fixture(); let b = (await f.create()).bracket; b = (await f.change(b, { action: "sharing", enabled: true })).bracket;
  const route = load("app/api/brackets/[id]/route.ts", { "@/lib/brackets": f.api });
  assert.equal(route.POST, undefined); assert.equal(route.PUT, undefined);
  const get = (id, revision) => route.GET(new Request(`https://xenon.test/api/brackets/${id}`, { headers: revision ? { "If-None-Match": `"${revision}"` } : {} }), { params: Promise.resolve({ id }) });
  const response = await get(b.id); assert.equal(response.status, 200); assert.match(response.headers.get("x-robots-tag"), /noindex.*nofollow/); assert.match(response.headers.get("cache-control"), /no-store/); assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal((await get(b.id, b.revision)).status, 304);
  await f.change(b, { action: "sharing", enabled: false }); assert.equal((await get(b.id, b.revision)).status, 404); assert.equal((await get("not-a-bracket")).status, 404);
});
test("unlisted pages and API report safe storage failures without database details", async () => {
  const route = load("app/api/brackets/[id]/route.ts", { "@/lib/brackets": { publicBracket: async () => { throw Error("TEST PRIVATE SQL password"); } } });
  const response = await route.GET(new Request("https://xenon.test"), { params: Promise.resolve({ id: "a".repeat(24) }) });
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /PRIVATE|SQL|password/);
  const page = fs.readFileSync("app/brackets/[id]/page.tsx", "utf8"); assert.match(page, /index: false, follow: false/);
  const next = fs.readFileSync("next.config.mjs", "utf8"); assert.match(next, /X-Robots-Tag/);
  const publicSources = ["components/layout/Navbar.tsx", "components/layout/Footer.tsx", "app/events/page.tsx", "app/events/valorant/page.tsx", "app/collaborations/page.tsx"].map((p) => fs.readFileSync(p, "utf8")).join("\n");
  assert.doesNotMatch(publicSources, /href=["'`]\/brackets/);
});
