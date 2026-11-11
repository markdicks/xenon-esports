const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-typescript.cjs");
const contract = load("lib/meeting-contract.ts");
const id = (n) => String(100000000000000000n + BigInt(n));
const at = Math.ceil((Date.now() + 86400000) / contract.slotLength) * contract.slotLength;
function state() {
  return { id: "abcdef123456abcdef123456", reference: "XEN-INT-A7K42P", guildId: id(1), applicantDiscord: "applicant", applicantId: id(2),
    windowStart: at, windowEnd: at + 14 * 86400000, status: "collecting", attempts: 1, failureReason: null,
    participants: [2, 3, 4, 5].map((n) => ({ userId: id(n), kind: n === 2 ? "applicant" : "manager", slots: [at], responded: true, timezone: "UTC" })),
    channelId: null, scheduledAt: null, attendeeIds: [], announcementId: null, completed: false };
}
function storage(pool) { return load("lib/meetings.ts", { "@/lib/db": { getDbPool: () => pool }, "@/lib/meeting-contract": contract,
  "@/lib/meeting-portal": { applyStandingAvailability: async () => {} } }); }
test("booking requires the applicant, all manager replies and two-thirds of all managers", () => {
  const value = state(); value.participants[3].slots = [];
  assert.deepEqual(contract.matchingSlot(value), { at, attendeeIds: [id(2), id(3), id(4)] });
  value.participants[3].responded = false; assert.equal(contract.matchingSlot(value), null);
  value.participants[3].responded = true; value.participants[2].slots = []; assert.equal(contract.matchingSlot(value), null);
  value.participants[2].slots = [at]; value.participants[0].slots = []; assert.equal(contract.matchingSlot(value), null);
  value.participants[0].slots = [at]; assert.equal(contract.matchingSlot(value, at - 3600000), null);
});

test("follow-up age flags reach four weeks even after the availability window expires", () => {
  const value = state(), now = at + 30 * 86400000;
  value.status = "expired"; value.participants[0].responded = false;
  for (const [days, expected] of [[6, null], [7, 1], [14, 2], [28, 4], [60, 4]]) {
    const result = contract.meetingFollowUp(value, now - days * 86400000, now);
    assert.equal(result.overdueWeeks, expected); assert.equal(result.waitingForApplicant, true);
  }
  value.status = "scheduled";
  assert.equal(contract.meetingFollowUp(value, now - 60 * 86400000, now).overdueWeeks, null);
});

test("availability mismatch is separate from pending responses and uses the existing quorum", () => {
  const value = state(); value.participants[2].slots = []; value.participants[3].slots = [];
  let result = contract.meetingFollowUp(value, at - 86400000, at - 12 * 3600000);
  assert.equal(result.availabilityMismatch, true); assert.equal(result.waitingForManagers, 0);
  value.participants[3].responded = false;
  result = contract.meetingFollowUp(value, at - 86400000, at - 12 * 3600000);
  assert.equal(result.availabilityMismatch, false); assert.equal(result.waitingForManagers, 1);
  value.participants[3].responded = true; value.participants[2].slots = [at];
  assert.equal(contract.meetingFollowUp(value, at - 86400000, at - 12 * 3600000).availabilityMismatch, false);
});
test("meeting state rejects duplicate people and times outside the fixed window", () => {
  const value = state(); assert.equal(contract.meetingStateSchema.safeParse(value).success, true);
  value.participants.push(value.participants[1]); assert.equal(contract.meetingStateSchema.safeParse(value).success, false);
  value.participants.pop(); value.participants[0].slots = [at + 1]; assert.equal(contract.meetingStateSchema.safeParse(value).success, false);
});
test("private tokens are bound to both the meeting and participant and fail closed without a secret", (t) => {
  const previous = process.env.WEBSITE_BOT_TOKEN;
  t.after(() => { if (previous === undefined) delete process.env.WEBSITE_BOT_TOKEN; else process.env.WEBSITE_BOT_TOKEN = previous; });
  process.env.WEBSITE_BOT_TOKEN = "test-only-meeting-secret";
  const api = storage({}); const token = api.participantToken(state().id, id(2));
  assert.equal(api.validParticipantToken(state().id, id(2), token), true);
  assert.equal(api.validParticipantToken(state().id, id(3), token), false);
  assert.equal(api.validParticipantToken("0".repeat(24), id(2), token), false);
  delete process.env.WEBSITE_BOT_TOKEN; assert.equal(api.validParticipantToken(state().id, id(2), token), false);
});
test("availability uses CAS, de-duplicates slots and never overwrites a frozen booking", async () => {
  const queries = []; const value = state(); let conflict = true;
  const api = storage({ execute: async (sql, params) => {
    queries.push([sql, params]);
    if (sql.startsWith("SELECT")) return [[{ id: value.id, revision: "stored-revision", state: value }]];
    if (conflict) { conflict = false; return [{ affectedRows: 0 }]; }
    return [{ affectedRows: 1 }];
  } });
  assert.equal(await api.saveAvailability(value.id, id(2), [at, at], "Africa/Johannesburg"), "saved");
  assert.equal(queries.filter(([sql]) => sql.startsWith("UPDATE")).length, 2);
  const saved = JSON.parse(queries.at(-1)[1][0]); assert.deepEqual(saved.participants[0].slots, [at]);
  assert.match(queries.at(-1)[0], /WHERE id = \? AND revision = \?/);
  value.status = "scheduled"; assert.equal(await api.saveAvailability(value.id, id(2), [], "UTC"), "closed");
  value.status = "collecting"; assert.equal(await api.saveAvailability(value.id, id(99), [], "UTC"), "missing");
  assert.equal(await api.saveAvailability(value.id, id(2), [at + 1], "UTC"), "invalid");
});
test("job saves need revision and unexpired lease; ensure is idempotent and reads Discord from the original form", async () => {
  const queries = [];
  const api = storage({ execute: async (sql, params) => {
    queries.push([sql, params]); return sql.startsWith("SELECT") ? [[{ discord_username: "exact.username" }]] : [{ affectedRows: 1 }];
  } });
  await api.ensureMeeting("XEN-CON-A7K42P", id(1), [id(3), id(3)]);
  assert.match(queries[0][0], /contact_submissions WHERE public_reference = \?/);
  assert.match(queries[1][0], /INSERT IGNORE/);
  const saved = JSON.parse(queries[1][1][4]); assert.equal(saved.applicantDiscord, "exact.username"); assert.equal(saved.participants.length, 1);
  const revision = await api.saveMeetingJob({ state: state(), revision: "old", leaseToken: "lease", release: false });
  assert.match(revision, /^[a-f0-9-]{36}$/);
  assert.match(queries.at(-1)[0], /revision = \? AND lease_token = \? AND leased_until > NOW\(\)/);
});

test("historical booking creation is explicit, uses a new window, and retains reference deduplication", async () => {
  const queries = [];
  const api = storage({ execute: async (sql, params) => {
    queries.push([sql, params]); return sql.startsWith("SELECT") ? [[{ discord_username: "existing.member" }]] : [{ affectedRows: 1 }];
  } });
  await api.ensureMeeting("XEN-APP-A7K42P", id(1), [id(3)], true);
  assert.match(queries[0][0], /applications WHERE public_reference = \?/);
  assert.doesNotMatch(queries[0][0], /DATE_SUB/);
  assert.match(queries[1][0], /INSERT IGNORE/);
  const saved = JSON.parse(queries[1][1][4]);
  assert.ok(saved.windowStart >= Date.now() + 3600000);
  assert.equal(saved.windowEnd - saved.windowStart, 14 * 86400000);
  queries.length = 0;
  await api.ensureMeeting("XEN-INT-A7K42P", id(1), [id(3)]);
  assert.match(queries[0][0], /interest_submissions WHERE reference_code = \? AND created_at >= DATE_SUB/);
});

test("historical candidates cover all three forms without returning personal answers or existing meetings", async () => {
  const queries = [];
  const api = storage({ execute: async (sql, params) => {
    queries.push([sql, params]); return [[{ reference: "XEN-CON-A7K42P", submission_type: "contact", subject: "Business", status: null }]];
  } });
  const result = await api.listHistoricalMeetingCandidates("XEN-APP-A7K42P");
  assert.deepEqual(result, [{ reference: "XEN-CON-A7K42P", type: "contact", subject: "Business", status: null }]);
  assert.match(queries[0][0], /FROM applications/); assert.match(queries[0][0], /FROM interest_submissions/);
  assert.match(queries[0][0], /FROM contact_submissions/); assert.match(queries[0][0], /meeting.public_reference IS NULL/);
  assert.match(queries[0][0], /TRIM\(pending.discord_username\) <> ''/);
  assert.deepEqual(queries[0][1], ["XEN-APP-A7K42P", "XEN-APP-A7K42P"]);
  assert.equal(result[0].discord_username, undefined);
});

test("historical candidate listing requires bot authentication and a valid cursor", async (t) => {
  const previous = process.env.WEBSITE_BOT_TOKEN;
  t.after(() => { if (previous === undefined) delete process.env.WEBSITE_BOT_TOKEN; else process.env.WEBSITE_BOT_TOKEN = previous; });
  process.env.WEBSITE_BOT_TOKEN = "backfill-test"; let calls = 0;
  const api = load("app/api/bot/meetings/route.ts", { "@/lib/meeting-api": load("lib/meeting-api.ts"), "@/lib/meeting-contract": contract,
    "@/lib/meetings": { listHistoricalMeetingCandidates: async () => { calls++; return []; } } });
  const url = `https://xenon.example/api/bot/meetings?guildId=${id(1)}&view=backfill`;
  assert.equal((await api.GET(new Request(url))).status, 401);
  const headers = { Authorization: "Bearer backfill-test" };
  assert.equal((await api.GET(new Request(`${url}&after=invalid`, { headers }))).status, 400);
  assert.equal((await api.GET(new Request(url, { headers }))).status, 200);
  assert.equal(calls, 1);
});
test("bot meeting API authenticates before DB access and validates manager lists", async (t) => {
  const previous = process.env.WEBSITE_BOT_TOKEN;
  t.after(() => { if (previous === undefined) delete process.env.WEBSITE_BOT_TOKEN; else process.env.WEBSITE_BOT_TOKEN = previous; });
  process.env.WEBSITE_BOT_TOKEN = "internal-test";
  const helpers = load("lib/meeting-api.ts"); let writes = 0;
  const api = load("app/api/bot/meetings/route.ts", { "@/lib/meeting-api": helpers, "@/lib/meeting-contract": contract,
    "@/lib/meetings": { ensureMeeting: async () => { writes++; return true; }, claimMeetings: async () => [], saveMeetingJob: async () => null } });
  const request = (body, token = "internal-test") => new Request("https://xenon.example/api/bot/meetings", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const body = { action: "ensure", reference: "XEN-APP-A7K42P", guildId: id(1), managerIds: [id(3)] };
  assert.equal((await api.POST(request(body, "wrong"))).status, 401);
  assert.equal((await api.POST(request({ ...body, managerIds: [] }))).status, 400);
  assert.equal((await api.POST(request(body))).status, 200); assert.equal(writes, 1);
});
test("public availability verifies signatures and origin, bounds bodies and validates timezones", async () => {
  const helpers = load("lib/meeting-api.ts"); let writes = 0;
  const api = load("app/api/meetings/[id]/route.ts", { "@/lib/meeting-api": helpers, "@/lib/meeting-contract": contract,
    "@/lib/meetings": { validParticipantToken: (_id, _user, token) => token === "a".repeat(64), saveAvailability: async () => { writes++; return "saved"; } } });
  const body = { userId: id(2), token: "a".repeat(64), slots: [at], timezone: "Africa/Johannesburg" };
  const context = { params: Promise.resolve({ id: state().id }) };
  const request = (value, origin = "https://xenon.example") => new Request(`https://xenon.example/api/meetings/${state().id}`, { method: "POST", headers: { Origin: origin }, body: JSON.stringify(value) });
  assert.equal((await api.POST(request(body, "https://evil.example"), context)).status, 403);
  assert.equal((await api.POST(request({ ...body, token: "b".repeat(64) }), context)).status, 403);
  assert.equal((await api.POST(request({ ...body, timezone: "Invalid/Zone" }), context)).status, 403);
  assert.equal((await api.POST(request(body), context)).status, 200); assert.equal(writes, 1);
  await assert.rejects(helpers.readMeetingJson(new Request("https://xenon.example", { method: "POST", body: "x".repeat(40000) }), 32000), /too large/);
});

test("private read responses share only this meeting's participants and times, without raw identity or delivery metadata", async () => {
  const helpers = load("lib/meeting-api.ts"), value = state();
  value.participants[2].slots = [at + 1800000];
  const api = load("app/api/meetings/[id]/route.ts", { "@/lib/meeting-api": helpers, "@/lib/meeting-contract": contract,
    "@/lib/meetings": { validParticipantToken: () => true, getMeeting: async () => ({ state: value, serverNow: Date.now() }) } });
  const response = await api.POST(new Request(`https://xenon.example/api/meetings/${value.id}`, { method: "POST",
    body: JSON.stringify({ action: "read", userId: id(3), token: "a".repeat(64) }) }), { params: Promise.resolve({ id: value.id }) });
  assert.equal(response.status, 200); const body = await response.json();
  assert.deepEqual(body.view.initialSlots, [at]); assert.equal(body.view.sharedParticipants.length, 4);
  assert.equal(body.view.participants, undefined); assert.equal(body.view.applicantDiscord, undefined);
  assert.equal(JSON.stringify(body).includes(String(at + 1800000)), true);
  assert.equal(body.view.sharedParticipants[0].userId, undefined); assert.equal(body.view.sharedParticipants[0].invitation, undefined);
});

test("booking reads and saves accept the public Hostinger origin behind an internal HTTP proxy", async () => {
  const helpers = load("lib/meeting-api.ts"), value = state(); let reads = 0, writes = 0;
  const api = load("app/api/meetings/[id]/route.ts", { "@/lib/meeting-api": helpers, "@/lib/meeting-contract": contract,
    "@/lib/meetings": { validParticipantToken: (_id, _user, token) => token === "a".repeat(64),
      getMeeting: async () => { reads++; return { state: value, serverNow: Date.now() }; },
      saveAvailability: async () => { writes++; return "saved"; } } });
  const context = { params: Promise.resolve({ id: value.id }) };
  const read = { action: "read", userId: id(2), token: "a".repeat(64) };
  const save = { userId: id(2), token: "a".repeat(64), slots: [at], timezone: "Africa/Johannesburg" };
  const request = (body, extra = {}) => new Request(`http://0.0.0.0:3000/api/meetings/${value.id}`, {
    method: "POST", headers: { Origin: "https://xenonesports.online", Host: "localhost:3000",
      "X-Forwarded-Host": "xenonesports.online", "X-Forwarded-Proto": "https", "Sec-Fetch-Site": "same-origin", ...extra }, body: JSON.stringify(body),
  });
  assert.equal((await api.POST(request(read), context)).status, 200);
  assert.equal((await api.POST(request(save), context)).status, 200);
  assert.equal((await api.POST(request(read, { "X-Forwarded-Host": "xenonesports.online, internal.proxy", "X-Forwarded-Proto": "https, http" }), context)).status, 200);
  assert.equal((await api.POST(request(read, { "X-Forwarded-Host": "", Host: "xenonesports.online" }), context)).status, 200);
  assert.equal((await api.POST(request(read, { "X-Forwarded-Proto": "" }), context)).status, 200);
  for (const extra of [{ Origin: "https://evil.example" }, { Origin: "null" }, { Origin: "http://xenonesports.online" },
    { Origin: "https://xenonesports.online:444" }, { Origin: "https://xenonesports.online/path" }, { "Sec-Fetch-Site": "cross-site" }]) {
    assert.equal((await api.POST(request(save, extra), context)).status, 403);
  }
  assert.equal((await api.POST(request({ ...read, token: "b".repeat(64) }), context)).status, 403);
  assert.equal(reads, 4); assert.equal(writes, 1);
});

test("booking message button metadata is backwards compatible and only accepts the current version", () => {
  const value = state();
  value.participants[0].invitation = { channelId: id(20), messageId: id(21) };
  assert.equal(contract.meetingStateSchema.safeParse(value).success, true);
  value.participants[0].invitation.buttonVersion = 1;
  assert.equal(contract.meetingStateSchema.safeParse(value).success, true);
  value.participants[0].invitation.buttonVersion = 2;
  assert.equal(contract.meetingStateSchema.safeParse(value).success, false);
});

test("paused invitations are excluded from automatic claims unless one manual retry is queued", async () => {
  const queries = [], value = state();
  const api = storage({ execute: async (sql, params) => {
    queries.push([sql, params]);
    return sql.startsWith("SELECT") ? [[{ id: value.id, revision: "stored", state: value }]] : [{ affectedRows: 1 }];
  } });
  assert.equal((await api.claimMeetings(id(1))).length, 1);
  for (const [sql] of queries) {
    assert.match(sql, /JSON_EXTRACT\(state, '\$\.retryPaused'\)/);
    assert.match(sql, /JSON_EXTRACT\(state, '\$\.manualRetryRequested'\)/);
  }
});

test("manual retry queues one attempt with CAS and never clears pause or the active lease", async () => {
  const value = state(); value.retryPaused = true; value.automaticRetries = 15;
  const queries = [];
  const api = storage({ execute: async (sql, params) => {
    queries.push([sql, params]);
    if (sql.startsWith("SELECT")) return [[{ id: value.id, revision: "stored", state: value }]];
    return [{ affectedRows: 1 }];
  } });
  assert.equal(await api.requestManualMeetingRetry(value.id, id(1)), "queued");
  const update = queries.at(-1), queued = JSON.parse(update[1][0]);
  assert.equal(queued.manualRetryRequested, true); assert.equal(queued.retryPaused, true); assert.equal(queued.automaticRetries, 15);
  assert.match(update[0], /WHERE id = \? AND guild_id = \? AND revision = \?/); assert.doesNotMatch(update[0], /lease_token\s*=|leased_until\s*=/);
  assert.equal(await api.requestManualMeetingRetry(value.id, id(99)), "missing");
  value.retryPaused = false; assert.equal(await api.requestManualMeetingRetry(value.id, id(1)), "closed");
  value.retryPaused = true; value.windowEnd = Date.now() - 1; value.windowStart = value.windowEnd - 14 * 86400000;
  value.participants.forEach((person) => { person.slots = []; });
  assert.equal(await api.requestManualMeetingRetry(value.id, id(1)), "closed");
});

test("paused listing contains only references and safe diagnostics, while legacy retry counts are bounded", async () => {
  const value = state(); value.applicantDiscord = "PRIVATE-DISCORD-HANDLE"; value.attempts = 50;
  const api = storage({ execute: async () => [[{ id: value.id, revision: "stored", state: value }]] });
  const [row] = await api.listPausedMeetings(id(1));
  assert.equal(row.reference, value.reference); assert.equal(row.automaticRetries, 15);
  assert.equal(JSON.stringify(row).includes("PRIVATE-DISCORD-HANDLE"), false); assert.equal(row.participants, undefined);
  const parsed = contract.meetingStateSchema.parse(value);
  assert.equal(parsed.retryPaused, false); assert.equal(parsed.manualRetryRequested, false); assert.equal(parsed.automaticRetries, 15);
});

test("bot retry controls require the internal secret and cannot claim through the read-only list", async (t) => {
  const previous = process.env.WEBSITE_BOT_TOKEN;
  t.after(() => { if (previous === undefined) delete process.env.WEBSITE_BOT_TOKEN; else process.env.WEBSITE_BOT_TOKEN = previous; });
  process.env.WEBSITE_BOT_TOKEN = "retry-test";
  let claims = 0, lists = 0, retries = 0;
  const api = load("app/api/bot/meetings/route.ts", { "@/lib/meeting-api": load("lib/meeting-api.ts"), "@/lib/meeting-contract": contract,
    "@/lib/meetings": { claimMeetings: async () => { claims++; return []; }, listPausedMeetings: async () => { lists++; return []; }, requestManualMeetingRetry: async () => { retries++; return "queued"; } } });
  const url = `https://xenon.example/api/bot/meetings?guildId=${id(1)}&view=paused`;
  assert.equal((await api.GET(new Request(url))).status, 401);
  assert.equal((await api.GET(new Request(url, { headers: { Authorization: "Bearer retry-test" } }))).status, 200);
  const body = { action: "retry", id: state().id, guildId: id(1) };
  const request = (token) => new Request("https://xenon.example/api/bot/meetings", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  assert.equal((await api.POST(request("wrong"))).status, 401);
  assert.equal((await api.POST(request("retry-test"))).status, 200);
  assert.equal(claims, 0); assert.equal(lists, 1); assert.equal(retries, 1);
});
