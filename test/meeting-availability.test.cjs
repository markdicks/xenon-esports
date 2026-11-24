const test = require("node:test"), assert = require("node:assert/strict"), load = require("./load-typescript.cjs");
const c = load("lib/meeting-contract.ts"), id = (n) => String(100000000000000000n + BigInt(n));
const revision = "0899fdb8-5e85-45fb-b399-5d77523f8300";
function fixture() {
  const at = Math.ceil((Date.now() + 86400000) / c.slotLength) * c.slotLength;
  let data = { revision, leased: 0, state: c.meetingStateSchema.parse({ id: "a".repeat(24), reference: "XEN-INT-A7K42P", guildId: id(1),
    applicantId: id(2), applicantDiscord: "Stormi", windowStart: at, windowEnd: at + 14 * 86400000, status: "collecting",
    attempts: 1, failureReason: null, channelId: null, scheduledAt: null, attendeeIds: [], announcementId: null, completed: false,
    participants: [{ userId: id(2), kind: "applicant", slots: [at], responded: true }, { userId: id(3), kind: "manager", slots: [at], responded: true },
      { userId: id(4), kind: "guest", slots: [], responded: false }] }) };
  const writes = []; let failSave = false;
  const execute = (draft, sql, params = []) => {
    if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
    if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }]];
    if (sql.startsWith("SELECT")) return [[structuredClone(draft)]];
    if (sql.startsWith("UPDATE")) { if (failSave) throw new Error("private driver error"); writes.push({ sql, params }); draft.state = JSON.parse(params[0]); draft.revision = params[1]; return [{ affectedRows: 1 }]; }
    throw new Error(sql);
  };
  const pool = { execute: async (sql, params) => execute(data, sql, params), getConnection: async () => {
    let draft;
    return { beginTransaction: async () => { draft = structuredClone(data); }, execute: async (sql, params) => execute(draft, sql, params),
      commit: async () => { data = draft; }, rollback: async () => {}, release() {}, destroy() {} };
  } };
  const overrides = { "@/lib/db": { getDbPool: () => pool } }, service = load("lib/meeting-availability.ts", overrides);
  const input = { id: data.state.id, guildId: id(1), actorId: id(9), serverOwner: true, revision, participantId: id(4), mode: "ignored" };
  const save = (change = {}) => service.setMeetingAvailability({ ...input, revision: data.revision, ...change });
  return { at, input, save, data: () => data, writes, overrides, failSave: () => { failSave = true; } };
}
test("owner ignores preserve saved times and attendance, invalidate snapshots and can be reversed", async () => {
  const f = fixture(); const person = f.data().state.participants[2]; person.slots = [f.at + c.slotLength]; person.responded = true;
  await f.save(); const saved = f.data();
  assert.notEqual(saved.revision, revision); assert.equal(saved.state.availabilityControlVersion, 1);
  assert.deepEqual(saved.state.participants[2].slots, [f.at + c.slotLength]);
  assert.deepEqual(c.matchingSlot(saved.state).attendeeIds, [id(2), id(3), id(4)]);
  assert.equal(saved.state.participants[2].availabilityOverride.actorId, id(9)); assert.equal(saved.state.lastAction.kind, "owner_availability_ignored");
  assert.equal(c.meetingFollowUp(saved.state, Date.now()).waitingForManagers, 0);
  await f.save({ mode: "restore" }); assert.equal(f.data().state.participants[2].availabilityOverride, undefined);
  assert.equal(c.matchingSlot(f.data().state), null);
});
test("owner-entered times accept a confirmed single time, clear automatic exclusions and never update weekly profiles", async () => {
  const f = fixture(); f.data().state.participants[2].availabilityWaivedAt = Date.now();
  await f.save({ mode: "entered", slots: [f.at], timezone: "Africa/Johannesburg" });
  const person = f.data().state.participants[2];
  assert.equal(person.responded, true); assert.equal(person.source, "meeting"); assert.equal(person.timezone, "Africa/Johannesburg");
  assert.equal(person.availabilityWaivedAt, undefined); assert.equal(person.availabilityOverride.mode, "entered");
  assert.ok(c.matchingSlot(f.data().state)); assert.equal(f.writes.length, 1); assert.match(f.writes[0].sql, /^UPDATE discord_meetings /);
  const original = structuredClone(person.availabilityOverride);
  await f.save(); await f.save({ mode: "restore" });
  assert.deepEqual(f.data().state.participants[2].availabilityOverride, original, "restoring times must preserve who entered them");
  let profileReads = 0;
  const portal = load("lib/meeting-portal.ts", { "@/lib/db": { getDbPool: () => ({ execute: async () => { profileReads++; return [[]]; } }) } });
  f.data().state.participants.forEach((p) => { p.availabilityOverride = { mode: "ignored", actorId: id(9), at: Date.now() }; });
  await portal.applyStandingAvailability(f.data().state); assert.equal(profileReads, 0);
});
test("only owner attestation, current revision and an idle open meeting can change availability", async () => {
  for (const [change, pattern] of [[{ serverOwner: false }, /owner/], [{ revision: "stale" }, /changed/], [{ participantId: id(99) }, /participant/]]) {
    const f = fixture(); await assert.rejects(f.save(change), pattern); assert.equal(f.writes.length, 0);
  }
  for (const patch of [{ leased: 1 }, { state: { status: "scheduled" } }, { state: { workflowStatus: "closed" } }, { state: { deletion: { requestedBy: id(9), requestedAt: Date.now() } } }]) {
    const f = fixture();
    if (patch.state) Object.assign(f.data().state, patch.state); else Object.assign(f.data(), patch);
    await assert.rejects(f.save(), /processing|open, unbooked/); assert.equal(f.writes.length, 0);
  }
  const expired = fixture(); expired.data().state.participants.forEach((p) => { p.slots = []; });
  expired.data().state.windowStart = expired.at - 16 * 86400000; expired.data().state.windowEnd = expired.at - 2 * 86400000;
  await assert.rejects(expired.save(), /open, unbooked/);
});
test("owner time validation rejects past, out-of-window, duplicate and non-slot times without partial saves", async () => {
  const f = fixture();
  for (const slots of [[], [f.at, f.at], [f.at + 1], [f.at - c.slotLength], [f.data().state.windowEnd], [NaN], [Math.floor(Date.now() / c.slotLength) * c.slotLength]]) {
    await assert.rejects(f.save({ mode: "entered", slots, timezone: "UTC" }), /future 30-minute/); assert.equal(f.writes.length, 0);
  }
  await assert.rejects(f.save({ mode: "entered", slots: [f.at], timezone: "Invalid/timezone" }), /timezone/);
  f.failSave(); await assert.rejects(f.save(), /private driver error/);
  assert.equal(f.data().revision, revision); assert.equal(f.data().state.participants[2].availabilityOverride, undefined);
});
test("ignoring any participant retains them in attendance, including an ignored requester with no slots", async () => {
  const f = fixture(); await f.save(); await f.save({ participantId: id(2) }); await f.save({ participantId: id(3) });
  const state = f.data().state; state.participants.forEach((p) => { p.responded = false; p.slots = []; });
  assert.deepEqual(c.matchingSlot(state), { at: f.at, attendeeIds: [id(2), id(3), id(4)] });
  for (const user of [2, 3, 4]) {
    const busy = [{ scheduledAt: f.at, attendeeIds: [id(user)] }];
    assert.equal(c.matchingSlot(state, Date.now(), busy).at, f.at + c.slotLength);
  }
  // Ignored managers are compulsory attendees even when the normal quorum is satisfied by others.
  const manager = state.participants[1];
  state.participants.push(...[5, 6].map((n) => ({ ...manager, userId: id(n), availabilityOverride: undefined, slots: [f.at], responded: true })));
  assert.equal(c.matchingSlot(state, Date.now(), [{ scheduledAt: f.at, attendeeIds: [manager.userId] }]), null);
});
test("a person's reply replaces owner-entered times but cannot silently clear an explicit ignore", async () => {
  for (const mode of ["entered", "ignored"]) {
    const f = fixture(); await f.save({ mode, ...(mode === "entered" ? { slots: [f.at], timezone: "UTC" } : {}) });
    const service = load("lib/meetings.ts", { ...f.overrides, "@/lib/meeting-contract": c });
    const slots = [f.at, f.at + c.slotLength, f.at + 86400000];
    assert.equal((await service.saveAvailability(f.input.id, id(4), slots, "UTC")).status, "saved");
    assert.equal(f.data().state.participants[2].availabilityOverride?.mode, mode === "ignored" ? "ignored" : undefined);
  }
});
test("owner availability API authenticates before reads, rejects spoofed scope and hides driver errors", async () => {
  const helper = load("lib/meeting-api.ts"); let calls = 0;
  const api = load("app/api/bot/meeting-availability/route.ts", { "@/lib/meeting-api": { ...helper, authorizeBot: (r) => r.headers.get("authorization") === "Bearer test-only" },
    "@/lib/meeting-availability": { setMeetingAvailability: async () => { calls++; throw new Error("secret SQL or driver text"); } } });
  const f = fixture(), request = (body, auth = "Bearer test-only") => new Request("https://example.com/api/bot/meeting-availability", { method: "POST", headers: { authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await api.POST(request(f.input, ""))).status, 401); assert.equal(calls, 0);
  for (const invalid of [{ ...f.input, serverOwner: false }, { ...f.input, userIds: [id(4)] }, { ...f.input, mode: "arbitrary" }, { ...f.input, mode: "ignored", slots: [] }]) {
    assert.equal((await api.POST(request(invalid))).status, 400);
  }
  assert.equal(calls, 0); const response = await api.POST(request(f.input)); assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret|SQL|driver/);
});
test("old workers cannot claim or save an availability override during deployment", async () => {
  const helper = load("lib/meeting-api.ts"), f = fixture(); await f.save();
  const queries = [], api = load("lib/meetings.ts", { "@/lib/db": { getDbPool: () => ({ execute: async (sql) => { queries.push(sql); return [[]]; } }) } });
  await api.claimMeetings(id(1), true); assert.match(queries[0], /availabilityControlVersion.*IS NULL/);
  queries.length = 0; await api.claimMeetings(id(1), true, true); assert.doesNotMatch(queries[0], /availabilityControlVersion.*IS NULL/);
  let writes = 0;
  const route = load("app/api/bot/meetings/route.ts", { "@/lib/meeting-api": { ...helper, authorizeBot: () => true }, "@/lib/meetings": { saveMeetingJob: async () => { writes++; return revision; } } });
  const request = (capabilities) => new Request("https://example.com/api/bot/meetings", { method: "POST", headers: { "Content-Type": "application/json", "x-xenon-meeting-capabilities": capabilities },
    body: JSON.stringify({ action: "save", state: f.data().state, revision, leaseToken: revision, release: true }) });
  assert.equal((await route.POST(request("reschedule-v1"))).status, 409); assert.equal(writes, 0);
  assert.equal((await route.POST(request("reschedule-v1,availability-control-v1"))).status, 200); assert.equal(writes, 1);
});
