const test = require("node:test"), assert = require("node:assert/strict"), { randomUUID } = require("node:crypto");
const fs = require("node:fs"), path = require("node:path"), load = require("./load-typescript.cjs");
const contract = load("lib/community-contract.ts"), security = load("lib/community-security.ts"), meetingApi = load("lib/meeting-api.ts");
const eventId = contract.valorantEventId, actorId = "111111111111111111";
function secret(t) {
  const before = process.env.COMMUNITY_FORM_SECRET; process.env.COMMUNITY_FORM_SECRET = "isolated-test-secret-for-community-forms-2026";
  t.after(() => { if (before === undefined) delete process.env.COMMUNITY_FORM_SECRET; else process.env.COMMUNITY_FORM_SECRET = before; });
}
function input(index = 0) {
  return contract.preShowSchema.parse({ discordUsername: `TEST-player-${index}`, riotId: `TEST-player-${index}#TEST`, rank: "", region: "TEST region", availability: "TEST evenings UTC+2", message: "TEST PRIVATE MESSAGE", agreement: true, requestId: randomUUID(), website: "" });
}
function fixture({ open = true, failAudit = false } = {}) {
  let data = { events: new Map(contract.eventIds.map((id) => [id, { revision: randomUUID(), settings: { ...structuredClone(contract.defaultEvents[id].settings), pollOpen: id === eventId && open, registrationOpen: id === eventId && open } }])),
    votes: new Map(), registrations: new Map(), limits: new Map(), history: [], next: 1 }, tail = Promise.resolve();
  const calls = [];
  async function execute(target, sql, params = []) {
    calls.push([sql, params]);
    if (sql.includes("SELECT revision, settings FROM community_events")) return [[target.events.get(params[0])].filter(Boolean)];
    if (sql.startsWith("SELECT settings FROM community_events")) return [[target.events.get(params[0])].filter(Boolean)];
    if (sql.startsWith("SELECT id, revision, settings FROM community_events")) return [[...target.events].map(([id, value]) => ({ id, ...value }))];
    if (sql.startsWith("SELECT choice, COUNT(*)")) {
      const counts = {}; for (const row of target.votes.values()) counts[row.choice] = (counts[row.choice] || 0) + 1;
      return [Object.entries(counts).map(([choice, votes]) => ({ choice, votes: String(votes) }))];
    }
    if (sql.startsWith("SELECT choice FROM community_poll_votes")) return [[target.votes.get(`${params[0]}:${params[1]}`)].filter(Boolean)];
    if (sql.startsWith("INSERT INTO community_poll_votes")) { target.votes.set(`${params[0]}:${params[2]}`, { choice: params[1] }); return [{ affectedRows: 1 }]; }
    if (sql.startsWith("INSERT INTO community_rate_limits")) { target.limits.set(params[0], (target.limits.get(params[0]) || 0) + 1); return [{ affectedRows: 1 }]; }
    if (sql.startsWith("SELECT hits FROM community_rate_limits")) return [[{ hits: target.limits.get(params[0]) }]];
    if (sql.startsWith("SELECT reference_code, voter_hash, payload_hash")) return [[...target.registrations.values()].filter((row) => row.event_id === params[0] && (row.request_id === params[1] || row.identity_hash === params[2] || row.voter_hash === params[3])).slice(0, 1)];
    if (sql.startsWith("INSERT INTO community_registrations")) {
      const [reference_code, event_id, revision, request_id, voter_hash, identity_hash, payload_hash, discord_username, riot_id, player_rank, region, availability, message] = params;
      target.registrations.set(reference_code, { id: target.next++, reference_code, event_id, revision, request_id, voter_hash, identity_hash, payload_hash, discord_username, riot_id, player_rank, region, availability, message,
        status: "pending", created_at: new Date(), notification_attempts: 0, notification_sent_at: null, notified_user_ids: [], lease_token: null, leased_until: null, next_attempt_at: 0 });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("SELECT revision, status FROM community_registrations")) return [[target.registrations.get(params[1])].filter(Boolean)];
    if (sql.startsWith("SELECT COUNT(*) AS accepted")) return [[{ accepted: [...target.registrations.values()].filter((row) => row.event_id === params[0] && row.status === "accepted").length }]];
    if (sql.startsWith("UPDATE community_registrations SET status")) { const row = target.registrations.get(params[3]); row.status = params[0]; row.revision = params[1]; return [{ affectedRows: 1 }]; }
    if (sql.startsWith("UPDATE community_events SET revision")) { target.events.set(params[3], { revision: params[0], settings: JSON.parse(params[1]) }); return [{ affectedRows: 1 }]; }
    if (sql.startsWith("INSERT INTO community_event_history")) {
      if (failAudit) throw new Error("TEST audit failure"); target.history.push({ actorId: params[2], action: params[3], detail: JSON.parse(params[4]) }); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("SELECT reference_code FROM community_registrations")) return [[...target.registrations.values()].filter((row) => !row.notification_sent_at && row.notification_attempts < 16 && row.next_attempt_at <= Date.now() && (!row.leased_until || row.leased_until <= Date.now())).slice(0, 5).map((row) => ({ reference_code: row.reference_code }))];
    if (sql.startsWith("UPDATE community_registrations SET lease_token")) {
      const row = target.registrations.get(params[1]);
      if (row.notification_sent_at || row.notification_attempts >= 16 || row.next_attempt_at > Date.now() || row.leased_until > Date.now()) return [{ affectedRows: 0 }];
      row.lease_token = params[0]; row.leased_until = Date.now() + 120000; row.notification_attempts++; return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("SELECT reference_code, discord_username, status")) { const row = target.registrations.get(params[0]); return [row?.lease_token === params[1] ? [row] : []]; }
    if (sql.startsWith("UPDATE community_registrations SET notified_user_ids")) {
      const row = target.registrations.get(params[4]);
      if (!row || row.lease_token !== params[5] || row.leased_until <= Date.now()) return [{ affectedRows: 0 }];
      row.notified_user_ids = JSON.parse(params[0]); row.notification_sent_at = params[1] ? new Date() : null; row.next_attempt_at = Date.now() + 120000;
      if (params[2]) { row.lease_token = null; row.leased_until = null; } return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("UPDATE community_registrations SET notification_attempts")) {
      const row = target.registrations.get(params[0]);
      if (!row || row.notification_sent_at || row.leased_until > Date.now()) return [{ affectedRows: 0 }];
      row.notification_attempts = 15; row.next_attempt_at = Date.now(); return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected test query: ${sql}`);
  }
  const pool = { execute: (sql, params) => execute(data, sql, params), getConnection: async () => {
    let draft, release;
    return { async beginTransaction() { const before = tail; tail = new Promise((resolve) => { release = resolve; }); await before; draft = structuredClone(data); },
      execute: (sql, params) => execute(draft, sql, params), async commit() { data = draft; }, async rollback() {}, release() { release(); } };
  } };
  const api = load("lib/community-events.ts", { "@/lib/db": { getDbPool: () => pool }, "@/lib/community-contract": contract, "@/lib/community-security": security });
  const register = (index) => api.registerPreShow(input(index), `voter-${index}`, `network-${index}`);
  return { api, calls, data: () => data, register };
}

test("polls and registrations default closed, and unavailable storage never creates a fake zero result", async (t) => {
  secret(t); const f = fixture({ open: false });
  await assert.rejects(f.api.castCommunityVote("skirmish-2v2", "one", "one"), /closed/);
  await assert.rejects(f.register(1), /closed/); assert.equal(f.data().registrations.size, 0);
  assert.equal((await f.api.publicCommunityEvent(eventId)).results.total, 0);
  const broken = load("lib/community-events.ts", { "@/lib/db": { getDbPool: () => { throw new Error("TEST offline"); } }, "@/lib/community-contract": contract, "@/lib/community-security": security });
  const event = await broken.publicCommunityEvent(eventId); assert.equal(event.available, false); assert.equal(event.results, null); assert.equal(event.settings.pollOpen, false);
});

test("poll results are recorded counts and retries cannot change or duplicate an existing vote", async (t) => {
  secret(t); const f = fixture();
  await f.api.castCommunityVote("skirmish-2v2", "voter-one", "network-one");
  const retry = await f.api.castCommunityVote("standard-5v5", "voter-one", "network-one");
  assert.deepEqual(retry, { choice: "skirmish-2v2", alreadyRecorded: true });
  await f.api.castCommunityVote("standard-5v5", "voter-two", "network-two");
  await f.api.castCommunityVote("standard-5v5", "voter-three", "network-three");
  assert.deepEqual((await f.api.publicCommunityEvent(eventId)).results, { total: 3, votes: { "skirmish-2v2": 1, "standard-5v5": 2 } });
  await assert.rejects(f.api.castCommunityVote("unapproved-choice", "four", "four"), (error) => error.status === 400);
});

test("network limits are enforced in MySQL across different browser identities", async (t) => {
  secret(t); const f = fixture();
  for (let index = 0; index < 3; index++) await f.api.castCommunityVote("standard-5v5", `browser-${index}`, "same-network");
  await assert.rejects(f.api.castCommunityVote("skirmish-2v2", "new-browser", "same-network"), (error) => error.status === 429);
  assert.equal(f.data().votes.size, 3);
});

test("pre-show registrations remain pending beyond six, use parameterized SQL and safely recover repeated requests", async (t) => {
  secret(t); const f = fixture(), original = input(1);
  const first = await f.api.registerPreShow(original, "voter-one", "network-one");
  assert.match(first.reference, /^XEN-EVT-[A-Z0-9]{6}$/);
  assert.deepEqual(await f.api.registerPreShow(original, "voter-one", "network-one"), first);
  await assert.rejects(f.api.registerPreShow(original, "another-browser", "another-network"), /already exists/);
  await assert.rejects(f.api.registerPreShow({ ...original, message: "Changed answer" }, "voter-one", "network-one"), /already exists/);
  for (let index = 2; index < 12; index++) await f.register(index);
  assert.equal(f.data().registrations.size, 11); assert.ok([...f.data().registrations.values()].every((row) => row.status === "pending"));
  const query = f.calls.find(([sql]) => sql.startsWith("INSERT INTO community_registrations"));
  assert.equal(query[0].includes(original.discordUsername), false); assert.ok(query[1].includes(original.availability));
});

test("concurrent acceptance cannot exceed six and withdrawal frees exactly one place", async (t) => {
  secret(t); const f = fixture(), refs = [];
  for (let index = 0; index < 8; index++) refs.push((await f.register(index)).reference);
  const select = (reference, status) => f.api.selectPreShow(reference, f.data().registrations.get(reference).revision, status, actorId);
  for (const reference of refs.slice(0, 5)) await select(reference, "accepted");
  const racing = await Promise.allSettled(refs.slice(5).map((reference) => select(reference, "accepted")));
  assert.equal(racing.filter((row) => row.status === "fulfilled").length, 1);
  assert.equal([...f.data().registrations.values()].filter((row) => row.status === "accepted").length, 6);
  await select(refs[0], "withdrawn");
  const next = [...f.data().registrations.values()].find((row) => row.status === "pending"); await select(next.reference_code, "accepted");
  assert.equal([...f.data().registrations.values()].filter((row) => row.status === "accepted").length, 6);
  await assert.rejects(f.api.selectPreShow(refs[0], randomUUID(), "accepted", actorId), /changed/);
  await assert.rejects(select(refs[0], "unknown-status"), (error) => error.status === 400);
});

test("selection and its audit commit together, and audit failure rolls back acceptance", async (t) => {
  secret(t); const f = fixture({ failAudit: true }), reference = (await f.register(1)).reference;
  await assert.rejects(f.api.selectPreShow(reference, f.data().registrations.get(reference).revision, "accepted", actorId), /audit failure/);
  assert.equal(f.data().registrations.get(reference).status, "pending"); assert.equal(f.data().history.length, 0);
});

test("event changes require a current revision and never open unsupported or completed events", async (t) => {
  secret(t); const f = fixture({ open: false }), value = { ...f.data().events.get(eventId).settings, pollOpen: true };
  await assert.rejects(f.api.configureCommunityEvent(eventId, randomUUID(), value, actorId), /changed/);
  await f.api.configureCommunityEvent(eventId, f.data().events.get(eventId).revision, value, actorId);
  assert.equal(f.data().events.get(eventId).settings.pollOpen, true); assert.equal(f.data().history[0].action, "event_settings_changed");
  await assert.rejects(f.api.configureCommunityEvent(contract.eventIds[1], f.data().events.get(contract.eventIds[1]).revision, value, actorId), /only for the Valorant/);
  await assert.rejects(f.api.configureCommunityEvent(eventId, f.data().events.get(eventId).revision, { ...value, status: "closed" }, actorId), /Close voting/);
});

test("notification claims use leases and expose only the concise summary, never full registration answers", async (t) => {
  secret(t); const f = fixture(), reference = (await f.register(1)).reference;
  const [first, second] = await Promise.all([f.api.claimCommunityNotifications(), f.api.claimCommunityNotifications()]);
  assert.equal(first.registrations.length + second.registrations.length, 1);
  const job = [...first.registrations, ...second.registrations][0];
  assert.doesNotMatch(JSON.stringify(job), /TEST PRIVATE MESSAGE|riot_id|availability|payload_hash|identity_hash/);
  await assert.rejects(f.api.acknowledgeCommunityNotification({ reference, leaseToken: randomUUID(), deliveredUserIds: [], complete: true, release: true }), /lease changed/);
  await f.api.acknowledgeCommunityNotification({ reference, leaseToken: job.leaseToken, deliveredUserIds: [actorId], complete: true, release: true });
  assert.equal((await f.api.claimCommunityNotifications()).registrations.length, 0);
});

test("event notifications pause after 16 attempts and one manual retry never cancels a live lease", async (t) => {
  secret(t); const f = fixture(), reference = (await f.register(1)).reference;
  f.data().registrations.get(reference).notification_attempts = 16;
  assert.equal((await f.api.claimCommunityNotifications()).registrations.length, 0);
  await f.api.retryCommunityNotification(reference, actorId);
  const job = (await f.api.claimCommunityNotifications()).registrations[0];
  await assert.rejects(f.api.retryCommunityNotification(reference, actorId), /in progress/);
  await f.api.acknowledgeCommunityNotification({ reference, leaseToken: job.leaseToken, deliveredUserIds: [], complete: false, release: true });
  assert.equal(f.data().registrations.get(reference).notification_attempts, 16); assert.equal((await f.api.claimCommunityNotifications()).registrations.length, 0);
});

test("anonymous form sessions are signed, cookie-bound, expiring and reject cross-origin or immediate submissions", (t) => {
  secret(t); let now = Date.now(); t.mock.method(Date, "now", () => now);
  const base = "https://xenon.example/api/events/valorant", start = new Request(base), session = security.communitySession(start);
  assert.match(session.cookie, /HttpOnly; SameSite=Lax; Secure/);
  const headers = { Cookie: session.cookie.split(";")[0], Origin: "https://xenon.example", "X-Forwarded-For": "198.51.100.20" };
  assert.throws(() => security.validateCommunityInteraction(new Request(base, { headers }), session.proof), (error) => error.status === 429);
  now += 2500;
  const verified = security.validateCommunityInteraction(new Request(base, { headers }), session.proof);
  assert.equal(verified.voterHash, session.voterHash); assert.doesNotMatch(verified.networkHash, /198\.51/);
  assert.throws(() => security.validateCommunityInteraction(new Request(base, { headers: { ...headers, Origin: "https://elsewhere.example" } }), session.proof), (error) => error.status === 403);
  assert.throws(() => security.validateCommunityInteraction(new Request(base, { headers: { ...headers, Cookie: `${headers.Cookie}bad` } }), session.proof), (error) => error.status === 403);
  now += 3600001; assert.throws(() => security.validateCommunityInteraction(new Request(base, { headers }), session.proof), (error) => error.status === 403);
});

test("trusted proxy selection ignores spoofed prefixes and canonicalizes IPv6 /64 and IPv4-mapped addresses", () => {
  const request = (ip) => new Request("https://xenon.example", { headers: { "X-Forwarded-For": ip } });
  assert.equal(security.networkIdentity(request("203.0.113.99, 198.51.100.20")), "198.51.100.20");
  assert.equal(security.networkIdentity(request("2001:db8:1:2::1")), security.networkIdentity(request("2001:0DB8:0001:0002::abcd")));
  assert.equal(security.networkIdentity(request("::ffff:192.0.2.1")), "192.0.2.1");
  assert.throws(() => security.networkIdentity(request("")), (error) => error.status === 503);
});

test("public APIs validate choices, agreement, proof and origin before database writes", async (t) => {
  secret(t); let writes = 0;
  const overrides = { "@/lib/community-contract": contract, "@/lib/community-security": security, "@/lib/meeting-api": meetingApi,
    "@/lib/community-events": { castCommunityVote: () => { writes++; }, registerPreShow: () => { writes++; } } };
  const vote = load("app/api/events/valorant/vote/route.ts", overrides), register = load("app/api/events/valorant/register/route.ts", overrides);
  const request = (body, origin = "https://xenon.example") => new Request("https://xenon.example/api/events/valorant", { method: "POST", headers: { Origin: origin }, body: JSON.stringify(body) });
  assert.equal((await vote.POST(request({ choice: "arbitrary", proof: "x" }))).status, 400);
  assert.equal((await vote.POST(request({ choice: "standard-5v5", proof: "x" }, "https://evil.example"))).status, 403);
  assert.equal((await register.POST(request({ ...input(), agreement: false, proof: "x" }))).status, 400);
  assert.equal((await register.POST(request({ ...input(), proof: "x", website: "BOT" }))).status, 400);
  assert.equal(writes, 0);
});

test("public session and submission APIs persist votes and pending registrations through the signed cookie flow", async (t) => {
  secret(t); const f = fixture(); let now = Date.now(); t.mock.method(Date, "now", () => now);
  const overrides = { "@/lib/community-contract": contract, "@/lib/community-security": security, "@/lib/meeting-api": meetingApi, "@/lib/community-events": f.api };
  const sessionApi = load("app/api/events/valorant/route.ts", overrides), vote = load("app/api/events/valorant/vote/route.ts", overrides), register = load("app/api/events/valorant/register/route.ts", overrides);
  const origin = "https://xenon.example", url = `${origin}/api/events/valorant`;
  const sessionResponse = await sessionApi.GET(new Request(url)), session = await sessionResponse.json();
  assert.equal(session.formReady, true); assert.equal(session.event.results.total, 0);
  const headers = { Cookie: sessionResponse.headers.get("set-cookie").split(";")[0], Origin: origin, "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.77" };
  now += 2500;
  const request = (body) => new Request(url, { method: "POST", headers, body: JSON.stringify({ ...body, proof: session.proof }) });
  const recorded = await vote.POST(request({ choice: "standard-5v5", website: "" }));
  assert.equal(recorded.status, 200); assert.equal((await recorded.json()).event.results.total, 1);
  const renewed = await (await sessionApi.GET(new Request(url, { headers }))).json();
  assert.equal(renewed.choice, "standard-5v5");
  const submission = input(45), registered = await register.POST(request(submission)), saved = await registered.json();
  assert.equal(registered.status, 200); assert.match(saved.reference, /^XEN-EVT-[A-Z0-9]{6}$/);
  assert.equal(f.data().registrations.get(saved.reference).status, "pending");
  assert.equal((await (await register.POST(request(submission))).json()).reference, saved.reference);
  const countsOnly = await (await sessionApi.GET(new Request(`${url}?results=1`))).json();
  assert.equal(countsOnly.event.results.total, 1); assert.equal(countsOnly.proof, undefined);
  f.data().events.get(eventId).settings.pollOpen = 0;
  f.data().events.get(eventId).settings.registrationOpen = 1;
  const seeded = await f.api.publicCommunityEvent(eventId);
  assert.equal(seeded.settings.pollOpen, false); assert.equal(seeded.settings.registrationOpen, true);
});

test("internal community controls authenticate before reads and reject forged or incomplete staff context", async (t) => {
  const before = process.env.WEBSITE_BOT_TOKEN; process.env.WEBSITE_BOT_TOKEN = "TEST-bot-secret";
  t.after(() => { if (before === undefined) delete process.env.WEBSITE_BOT_TOKEN; else process.env.WEBSITE_BOT_TOKEN = before; });
  let reads = 0;
  const api = load("app/api/bot/community-events/route.ts", { "@/lib/meeting-api": meetingApi, "@/lib/community-contract": contract, "@/lib/community-security": security,
    "@/lib/community-events": { adminCommunityEvents: async () => { reads++; return { events: [] }; } } });
  const request = (body, token = "TEST-bot-secret") => new Request("https://xenon.example/api/bot/community-events", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  assert.equal((await api.POST(request({ action: "list", actorId, access: true }, "wrong"))).status, 401);
  assert.equal((await api.POST(request({ action: "list", actorId }))).status, 400);
  assert.equal((await api.POST(request({ action: "list", actorId, access: true, admin: true }))).status, 400);
  assert.equal(reads, 0); assert.equal((await api.POST(request({ action: "list", actorId, access: true }))).status, 200); assert.equal(reads, 1);
});

test("approved news publishes five November articles, preserves October summaries and keeps coaching private", () => {
  const { news, publishedNews, publishedArticle, newsDate } = load("data/news.ts");
  assert.equal(publishedNews().filter((article) => article.date === "2026-11-13").length, 5);
  assert.equal(publishedArticle("rocket-league-coaching-addition"), undefined);
  assert.equal(news.find((article) => article.slug === "rocket-league-coaching-addition").status, "draft");
  assert.doesNotMatch(JSON.stringify(publishedNews()), /Serenity|Yash/);
  assert.equal(new Set(news.map((article) => article.slug)).size, news.length);
  assert.equal(newsDate("2026-10"), "October 2026"); assert.equal(newsDate("2026-11-13"), "13 November 2026");
  const sql = fs.readFileSync(path.join(__dirname, "../sql/011_community_events.sql"), "utf8");
  assert.doesNotMatch(sql, /\bDROP\b|\bTRUNCATE\b|ALTER TABLE/i); assert.match(sql, /INSERT IGNORE INTO community_events/);
});
