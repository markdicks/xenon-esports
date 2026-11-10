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
function storage(pool) { return load("lib/meetings.ts", { "@/lib/db": { getDbPool: () => pool }, "@/lib/meeting-contract": contract }); }
test("booking requires the applicant, all manager replies and two-thirds of all managers", () => {
  const value = state(); value.participants[3].slots = [];
  assert.deepEqual(contract.matchingSlot(value), { at, attendeeIds: [id(2), id(3), id(4)] });
  value.participants[3].responded = false; assert.equal(contract.matchingSlot(value), null);
  value.participants[3].responded = true; value.participants[2].slots = []; assert.equal(contract.matchingSlot(value), null);
  value.participants[2].slots = [at]; value.participants[0].slots = []; assert.equal(contract.matchingSlot(value), null);
  value.participants[0].slots = [at]; assert.equal(contract.matchingSlot(value, at - 3600000), null);
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

test("private read responses reveal only the requesting participant and applicant proposals, never other managers' times", async () => {
  const helpers = load("lib/meeting-api.ts"), value = state();
  value.participants[2].slots = [at + 1800000];
  const api = load("app/api/meetings/[id]/route.ts", { "@/lib/meeting-api": helpers, "@/lib/meeting-contract": contract,
    "@/lib/meetings": { validParticipantToken: () => true, getMeeting: async () => ({ state: value, serverNow: Date.now() }) } });
  const response = await api.POST(new Request(`https://xenon.example/api/meetings/${value.id}`, { method: "POST",
    body: JSON.stringify({ action: "read", userId: id(3), token: "a".repeat(64) }) }), { params: Promise.resolve({ id: value.id }) });
  assert.equal(response.status, 200); const body = await response.json();
  assert.deepEqual(body.view.initialSlots, [at]); assert.deepEqual(body.view.proposedSlots, [at]);
  assert.equal(body.view.participants, undefined); assert.equal(body.view.applicantDiscord, undefined);
  assert.equal(JSON.stringify(body).includes(String(at + 1800000)), false);
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
