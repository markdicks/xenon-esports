const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-typescript.cjs");
const contract = load("lib/meeting-contract.ts");
const outcomeContract = load("lib/meeting-outcome-contract.ts", { "@/lib/meeting-contract": contract });
const id = (n) => String(100000000000000000n + BigInt(n));
function portal(pool = {}, meeting = null) { return load("lib/meeting-portal.ts", { "@/lib/db": { getDbPool: () => pool },
  "@/lib/meetings": { getMeeting: async () => meeting }, "@/lib/meeting-contract": contract, "@/lib/meeting-outcome-contract": outcomeContract }); }
test("weekly slots expand using the profile timezone including DST transitions", () => {
  const api = portal();
  const start = Date.parse("2026-10-25T00:00:00Z"), end = start + 3 * 3600000;
  // UK clocks repeat 01:00; both UTC instants are valid weekly availability.
  assert.deepEqual(api.expandWeeklyAvailability({ timezone: "Europe/London", weeklySlots: [6 * 48 + 2] }, start, end), [start, start + 3600000]);
  assert.equal(api.profileSchema.safeParse({ timezone: "Invalid/Zone", weeklySlots: [] }).success, false);
  assert.equal(api.profileSchema.safeParse({ timezone: "UTC", weeklySlots: [336] }).success, false);
  assert.equal(api.profileSchema.safeParse({ timezone: "UTC", weeklySlots: [1, 1] }).success, false);
  const monday = Date.parse("2026-11-09T03:00:00Z");
  assert.deepEqual(api.expandWeeklyAvailability({ timezone: "Asia/Kathmandu", weeklySlots: [18] }, monday, monday + 3600000), []);
  assert.deepEqual(api.expandWeeklyAvailability({ timezone: "Asia/Kathmandu", weeklySlots: [18, 19] }, monday, monday + 3600000), [monday + 1800000]);
});
test("meeting-specific overrides survive standing profile refreshes", async () => {
  const state = contract.meetingStateSchema.parse({ id: "a".repeat(24), reference: "XEN-INT-A7K42P", guildId: id(1), applicantDiscord: "applicant", applicantId: id(2),
    windowStart: 1800000, windowEnd: 1800000 + 14 * 86400000, status: "collecting", attempts: 0, failureReason: null, channelId: null, scheduledAt: null, attendeeIds: [], announcementId: null, completed: false,
    participants: [{ userId: id(2), kind: "applicant", slots: [], responded: false }, { userId: id(3), kind: "manager", slots: [1800000], responded: true }, { userId: id(4), kind: "manager", slots: [], responded: false }] });
  const calls = [];
  const api = portal({ execute: async (sql, params) => { calls.push(params); return [[{ user_id: id(4), timezone: "UTC", weekly_slots: [0] }]]; } });
  await api.applyStandingAvailability(state);
  assert.deepEqual(state.participants[1].slots, [1800000]); assert.equal(state.participants[1].source, "meeting");
  assert.equal(state.participants[2].responded, true); assert.equal(state.participants[2].source, "standing");
  assert.equal(calls[0].includes(id(3)), false);
});
test("no routes means no list access, including owner/default views", async () => {
  const api = portal({ execute: () => { throw new Error("Unexpected data read"); } });
  assert.deepEqual(await api.portalList(id(1), [], null, null, ""), { items: [], next: null });
  assert.equal(api.submissionRoute("contact", "Business"), "contact-business");
});

test("inbox pagination retains its guild scope and binds all filters", async () => {
  const calls = [], before = "a".repeat(24);
  const api = portal({ execute: async (sql, params) => { calls.push({ sql, params }); return [[]]; } });
  assert.deepEqual(await api.portalList(id(1), ["interest"], before, "reviewing", "applicant"), { items: [], next: null });
  assert.match(calls[0].sql, /\(meeting.created_at, meeting.id\) < \(SELECT created_at, id FROM discord_meetings WHERE id = \? AND guild_id = \?\)/);
  assert.deepEqual(calls[0].params, [id(1), before, before, id(1), "applicant", "%applicant%", "%applicant%", "reviewing", "reviewing", "interest"]);
  await api.portalList(id(1), ["interest"], null, null, "");
  assert.deepEqual(calls[1].params.slice(0, 4), [id(1), null, null, id(1)]);
});

test("portal queries normalize source, JSON status and route collations without changing the pool", async () => {
  const queries = [];
  const api = portal({ execute: async (sql) => { queries.push(sql); return [[]]; } });
  await api.portalList(id(1), ["application", "contact-media"], null, "new", "");
  const sql = queries[0];
  for (const expression of ["public_reference", "reference_code", "discord_username", "subject", "'application'", "'interest'", "'contact'"]) {
    assert.ok(sql.includes(`CONVERT(${expression} USING utf8mb4) COLLATE utf8mb4_unicode_ci`), expression);
  }
  assert.match(sql, /LENGTH\(\?\) = 0/); assert.doesNotMatch(sql, /\? = ''/);
  assert.ok(sql.includes("CONVERT(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(meeting.state, '$.workflowStatus')), 'new') USING utf8mb4) COLLATE utf8mb4_unicode_ci = ?"));
  assert.match(sql, /END\) USING utf8mb4\) COLLATE utf8mb4_unicode_ci\s+IN/);
  await api.portalSource("XEN-APP-A7K42P");
  assert.ok(queries[1].includes("CONVERT(public_reference USING utf8mb4) COLLATE utf8mb4_unicode_ci AS reference"));
});

test("portal failures distinguish schema, query, data and connectivity without logging answers or credentials", () => {
  const api = portal(), secret = "private-answer-or-password";
  const query = api.portalFailure({ code: "ER_OPERAND_COLUMNS", sql: secret, sqlMessage: secret }, "list");
  assert.equal(query.code, "PORTAL_QUERY_FAILED"); assert.equal(query.diagnostic.databaseCode, "ER_OPERAND_COLUMNS");
  assert.equal(api.portalFailure({ code: "ER_NO_SUCH_TABLE" }, "list").code, "PORTAL_TABLE_MISSING");
  assert.equal(api.portalFailure({ code: "ER_TABLEACCESS_DENIED_ERROR" }, "list").code, "PORTAL_DATABASE_PERMISSIONS");
  assert.equal(api.portalFailure({ code: "ECONNREFUSED" }, "list").code, "PORTAL_DATABASE_CONNECTION");
  assert.equal(api.portalFailure({ code: "ER_CANT_AGGREGATE_NCOLLATIONS" }, "list").code, "PORTAL_COLLATION_MISMATCH");
  assert.equal(api.portalFailure({ code: "ER_CANT_AGGREGATE_2COLLATIONS" }, "list").code, "PORTAL_COLLATION_MISMATCH");
  assert.equal(api.portalFailure(new SyntaxError(secret), "list").code, "PORTAL_INVALID_DATA");
  assert.equal(api.portalFailure(new Error(secret), "list").code, "PORTAL_UNAVAILABLE");
  assert.equal(api.portalFailure({ code: secret }, "list").diagnostic.databaseCode, undefined);
  assert.equal(api.portalFailure({ code: "__proto__" }, "list").code, "PORTAL_UNAVAILABLE");
  assert.equal(api.portalFailure({ code: "ER_BAD_FIELD_ERROR", sqlMessage: "Unknown column 'source.created_at' in 'field list'" }, "list").diagnostic.field, "source.created_at");
  assert.equal(JSON.stringify(query).includes(secret), false);
});
test("detail denies an unrelated route before loading answers or history", async () => {
  let reads = 0;
  const api = portal({ execute: async () => { reads++; return [[{ type: "interest", subject: null }]]; } }, { revision: "r", state: { guildId: id(1), reference: "XEN-INT-A7K42P" } });
  assert.equal(await api.portalDetail("a".repeat(24), id(1), ["contact-business"]), null); assert.equal(reads, 1);
});
test("profile saves are transactional and invalidate active snapshots without clearing leases", async () => {
  const calls = []; let committed = false, released = false;
  const connection = { beginTransaction: async () => {}, execute: async (sql, params) => { calls.push([sql, params]); }, commit: async () => { committed = true; }, rollback: async () => {}, release: () => { released = true; } };
  const api = portal({ getConnection: async () => connection });
  await api.saveStaffProfile(id(1), id(3), { enabled: true, timezone: "UTC", weeklySlots: [1] });
  assert.equal(committed, true); assert.equal(released, true); assert.match(calls[1][0], /revision = UUID/); assert.doesNotMatch(calls[1][0], /lease_token\s*=|leased_until\s*=/);
});
test("portal API authenticates first and rejects forged scope/action fields", async (t) => {
  const previous = process.env.WEBSITE_BOT_TOKEN; process.env.WEBSITE_BOT_TOKEN = "portal-test";
  t.after(() => { if (previous === undefined) delete process.env.WEBSITE_BOT_TOKEN; else process.env.WEBSITE_BOT_TOKEN = previous; });
  const api = load("app/api/bot/meeting-portal/route.ts", { "@/lib/meeting-api": load("lib/meeting-api.ts"), "@/lib/meeting-contract": contract, "@/lib/meeting-outcome-contract": outcomeContract,
    "@/lib/meeting-portal": { ...portal(), portalList: async () => ({ items: [], next: null }) } });
  const body = { action: "list", guildId: id(1), actorId: id(3), allowedRoutes: ["interest"] };
  const request = (value, secret = "portal-test") => new Request("https://xenon.example/api/bot/meeting-portal", { method: "POST", headers: { Authorization: `Bearer ${secret}` }, body: JSON.stringify(value) });
  assert.equal((await api.POST(request(body, "wrong"))).status, 401);
  assert.equal((await api.POST(request({ ...body, admin: true }))).status, 400);
  assert.equal((await api.POST(request({ ...body, allowedRoutes: ["forged"] }))).status, 400);
  assert.equal((await api.POST(request(body))).status, 200);
});

test("portal API reports collation failures without blaming migration 009 or exposing driver errors", async (t) => {
  const previous = process.env.WEBSITE_BOT_TOKEN; process.env.WEBSITE_BOT_TOKEN = "portal-test";
  t.after(() => { if (previous === undefined) delete process.env.WEBSITE_BOT_TOKEN; else process.env.WEBSITE_BOT_TOKEN = previous; });
  const logs = [], original = console.error; console.error = (...values) => logs.push(values);
  t.after(() => { console.error = original; });
  const api = load("app/api/bot/meeting-portal/route.ts", { "@/lib/meeting-api": load("lib/meeting-api.ts"), "@/lib/meeting-contract": contract, "@/lib/meeting-outcome-contract": outcomeContract,
    "@/lib/meeting-portal": { ...portal(), portalList: async () => { throw Object.assign(new Error("private answer"), { code: "ER_CANT_AGGREGATE_2COLLATIONS", sql: "private SQL" }); } } });
  const response = await api.POST(new Request("https://xenon.example/api/bot/meeting-portal", { method: "POST", headers: { Authorization: "Bearer portal-test" },
    body: JSON.stringify({ action: "list", guildId: id(1), actorId: id(3), allowedRoutes: ["interest"] }) }));
  assert.equal(response.status, 503); assert.equal((await response.json()).code, "PORTAL_COLLATION_MISMATCH");
  assert.equal(logs[0][1].action, "list"); assert.equal(logs[0][1].databaseCode, "ER_CANT_AGGREGATE_2COLLATIONS");
  assert.equal(JSON.stringify(logs).includes("private"), false);
});

function meetingFixture() {
  const at = Math.ceil((Date.now() + 86400000) / contract.slotLength) * contract.slotLength;
  return { revision: "0899fdb8-5e85-45fb-b399-5d77523f8300", state: contract.meetingStateSchema.parse({
    id: "a".repeat(24), reference: "XEN-INT-A7K42P", guildId: id(1), applicantDiscord: "applicant", applicantId: id(2), windowStart: at, windowEnd: at + 14 * 86400000,
    status: "collecting", attempts: 1, failureReason: null, channelId: null, scheduledAt: null, attendeeIds: [], announcementId: null, completed: false,
    participants: [{ userId: id(2), kind: "applicant", slots: [at], responded: true, invitation: { channelId: id(20), messageId: id(21) } }, { userId: id(3), kind: "manager", slots: [at], responded: true }] }) };
}
test("closing, resending and reopening use authorized CAS writes and preserve existing channel history", async () => {
  const current = meetingFixture(), writes = [];
  const pool = { execute: async (sql, params) => {
    if (sql.startsWith("UPDATE")) { writes.push([sql, params]); return [{ affectedRows: 1 }]; }
    if (sql.includes("discord_meeting_history") || sql.includes("discord_meeting_outcomes") || sql.includes("discord_meeting_outcome_events")) return [[]];
    if (sql.includes("AS source")) return [[{ type: "interest", subject: null, created_at: new Date() }]];
    return [[{ strengths: "Editing" }]];
  } };
  const api = portal(pool, current);
  assert.equal(await api.portalMutate(current.state.id, id(1), ["interest"], id(3), current.revision, "resend"), "saved");
  let saved = JSON.parse(writes.at(-1)[1][0]);
  assert.equal(saved.participants[0].resendRequested, true); assert.equal(saved.participants[0].responded, false);
  assert.equal(saved.participants[0].resendGeneration, 1); assert.equal(saved.manualRetryRequested, true);
  assert.equal(await api.portalMutate(current.state.id, id(1), ["interest"], id(3), current.revision, "status", "closed"), "saved");
  saved = JSON.parse(writes.at(-1)[1][0]); assert.equal(saved.completed, true); assert.equal(saved.workflowStatus, "closed");
  assert.doesNotMatch(writes.at(-1)[0], /leased_until\s*=|lease_token\s*=/);
  current.state.workflowStatus = "closed";
  assert.equal(await api.portalMutate(current.state.id, id(1), ["interest"], id(3), current.revision, "resend"), "closed");
  assert.equal(await api.portalMutate(current.state.id, id(1), ["interest"], id(3), "stale", "reopen"), "conflict");
  assert.equal(await api.portalMutate(current.state.id, id(1), ["interest"], id(3), current.revision, "reopen"), "saved");
  saved = JSON.parse(writes.at(-1)[1][0]); assert.equal(saved.workflowStatus, "reviewing"); assert.equal(saved.completed, false);
  assert.equal(saved.participants[0].invitation, undefined); assert.equal(saved.participants[1].responded, false);
});

test("Discord corrections update the submission and reset the meeting atomically without clearing its lease", async () => {
  const current = meetingFixture(), writes = []; let commits = 0, rollbacks = 0, releases = 0;
  const connection = { beginTransaction: async () => {}, execute: async (sql, params) => { writes.push([sql, params]); return [{ affectedRows: 1 }]; },
    commit: async () => { commits++; }, rollback: async () => { rollbacks++; }, release: () => { releases++; } };
  const api = portal({ getConnection: async () => connection, execute: async (sql) => {
    if (sql.includes("discord_meeting_history") || sql.includes("discord_meeting_outcomes") || sql.includes("discord_meeting_outcome_events")) return [[]];
    if (sql.includes("AS source")) return [[{ type: "interest", subject: null, created_at: new Date() }]];
    return [[{ discord_username: "applicant" }]];
  } }, current);
  assert.equal(await api.portalCorrectDiscord(current.state.id, id(1), ["interest"], id(3), current.revision, "  corrected.username  "), "saved");
  const state = JSON.parse(writes[0][1][0]);
  assert.equal(state.applicantDiscord, "corrected.username"); assert.equal(state.applicantId, null);
  assert.ok(state.participants.every((person) => person.kind === "manager" && !person.responded && !person.invitation));
  assert.equal(state.manualRetryRequested, true); assert.equal(state.completed, false);
  assert.equal(state.lastAction.kind, "discord_username_updated"); assert.equal(state.lastAction.actorId, id(3));
  assert.match(writes[1][0], /UPDATE interest_submissions SET discord_username = \? WHERE reference_code = \?/);
  assert.deepEqual(writes[1][1], ["corrected.username", current.state.reference]);
  assert.doesNotMatch(writes[0][0], /lease_token\s*=|leased_until\s*=/);
  assert.equal(commits, 1); assert.equal(rollbacks, 0); assert.equal(releases, 1);
});

test("Discord correction rejects booked meetings, closed records, stale revisions and unrelated roles", async () => {
  for (const scenario of ["scheduled", "closed", "stale", "unrelated"]) {
    const current = meetingFixture();
    if (scenario === "scheduled") current.state.status = "scheduled";
    if (scenario === "closed") current.state.workflowStatus = "closed";
    const api = portal({ getConnection: async () => { throw new Error("Unexpected write"); }, execute: async (sql) => {
      if (sql.includes("discord_meeting_history") || sql.includes("discord_meeting_outcomes") || sql.includes("discord_meeting_outcome_events")) return [[]];
      if (sql.includes("AS source")) return [[{ type: "interest", subject: null, created_at: new Date() }]];
      return [[]];
    } }, current);
    const result = await api.portalCorrectDiscord(current.state.id, id(1), scenario === "unrelated" ? [] : ["interest"], id(3), scenario === "stale" ? "stale" : current.revision, "corrected");
    assert.equal(result, { scheduled: "scheduled", closed: "closed", stale: "conflict", unrelated: "missing" }[scenario]);
  }
});

test("a failed source update rolls back the meeting correction and its audit event", async () => {
  const current = meetingFixture(); let rolledBack = false, committed = false, released = false;
  const api = portal({ getConnection: async () => ({ beginTransaction: async () => {}, execute: async (sql) => {
    if (sql.includes("UPDATE interest_submissions")) throw new Error("source unavailable");
    return [{ affectedRows: 1 }];
  }, commit: async () => { committed = true; }, rollback: async () => { rolledBack = true; }, release: () => { released = true; } }), execute: async (sql) => {
    if (sql.includes("discord_meeting_history") || sql.includes("discord_meeting_outcomes") || sql.includes("discord_meeting_outcome_events")) return [[]];
    if (sql.includes("AS source")) return [[{ type: "interest", subject: null, created_at: new Date() }]];
    return [[]];
  } }, current);
  await assert.rejects(api.portalCorrectDiscord(current.state.id, id(1), ["interest"], id(3), current.revision, "corrected"), /source unavailable/);
  assert.equal(rolledBack, true); assert.equal(committed, false); assert.equal(released, true);
});

test("follow-up department access requires both current leadership and membership in the manager cohort", async () => {
  const current = meetingFixture(); current.state.roundNumber = 2; current.state.departments = ["creators"];
  const api = portal({ execute: async (sql) => {
    if (sql.includes("AS source")) return [[{ type: "interest", subject: null, created_at: new Date() }]];
    if (sql.includes("discord_meeting_outcomes")) return [[{ state: outcomeContract.outcomeSchema.parse({ privateNotes: "STAFF ONLY" }) }]];
    return [[]];
  } }, current);
  const own = { actorId: id(3), departments: ["creators"] };
  assert.equal((await api.portalDetail(current.state.id, id(1), [], null, own)).outcome.privateNotes, "STAFF ONLY");
  for (const access of [{ actorId: id(4), departments: ["creators"] }, { actorId: id(3), departments: [] }, { actorId: id(2), departments: ["creators"] }]) {
    assert.equal(await api.portalDetail(current.state.id, id(1), [], null, access), null);
  }
});

test("applicants with an existing staff role still cannot read their own private outcome notes", async () => {
  const current = meetingFixture(); let privateReads = 0;
  const api = portal({ execute: async (sql) => {
    if (sql.includes("AS source")) return [[{ type: "interest", subject: null, created_at: new Date() }]];
    if (sql.includes("discord_meeting_outcomes") || sql.includes("discord_meeting_outcome_events")) { privateReads++; throw new Error("Private data must not be loaded"); }
    return [[]];
  } }, current);
  const detail = await api.portalDetail(current.state.id, id(1), ["interest"], null, { actorId: id(2), departments: [] });
  assert.equal(detail.outcome, null); assert.deepEqual(detail.outcomeEvents, []); assert.equal(privateReads, 0);
});

test("interest-area access binds selected labels in SQL and denies unrelated interest details", async () => {
  const current = meetingFixture(), calls = [];
  const api = portal({ execute: async (sql, params) => {
    calls.push([sql, params]);
    if (sql.includes("SELECT * FROM (") && sql.includes("AS source")) return [[{ type: "interest", subject: null, interests: '["Competitive","Streaming"]', created_at: new Date() }]];
    return [[]];
  } }, current);
  await api.portalList(id(1), ["interest-competitive"], null, null, "");
  assert.match(calls[0][0], /JSON_CONTAINS\(source.interests, JSON_QUOTE\(\?\)\)/);
  assert.equal(calls[0][1].at(-1), "Competitive"); assert.equal(calls[0][0].includes("Competitive"), false);
  assert.ok(await api.portalDetail(current.state.id, id(1), ["interest-competitive"]));
  assert.equal(await api.portalDetail(current.state.id, id(1), ["interest-graphics"]), null);
});
