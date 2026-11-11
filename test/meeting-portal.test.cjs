const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-typescript.cjs");
const contract = load("lib/meeting-contract.ts");
const id = (n) => String(100000000000000000n + BigInt(n));
function portal(pool = {}, meeting = null) { return load("lib/meeting-portal.ts", { "@/lib/db": { getDbPool: () => pool },
  "@/lib/meetings": { getMeeting: async () => meeting }, "@/lib/meeting-contract": contract }); }
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
  const api = load("app/api/bot/meeting-portal/route.ts", { "@/lib/meeting-api": load("lib/meeting-api.ts"), "@/lib/meeting-contract": contract,
    "@/lib/meeting-portal": { ...portal(), portalList: async () => ({ items: [], next: null }) } });
  const body = { action: "list", guildId: id(1), actorId: id(3), allowedRoutes: ["interest"] };
  const request = (value, secret = "portal-test") => new Request("https://xenon.example/api/bot/meeting-portal", { method: "POST", headers: { Authorization: `Bearer ${secret}` }, body: JSON.stringify(value) });
  assert.equal((await api.POST(request(body, "wrong"))).status, 401);
  assert.equal((await api.POST(request({ ...body, admin: true }))).status, 400);
  assert.equal((await api.POST(request({ ...body, allowedRoutes: ["forged"] }))).status, 400);
  assert.equal((await api.POST(request(body))).status, 200);
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
    if (sql.includes("discord_meeting_history")) return [[]];
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
