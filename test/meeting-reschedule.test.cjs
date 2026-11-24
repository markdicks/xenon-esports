const test = require("node:test"), assert = require("node:assert/strict"), load = require("./load-typescript.cjs");
const { meetingStateSchema, slotLength } = load("lib/meeting-contract.ts"), id = (n) => String(100000000000000000n + BigInt(n));
const revision = "0899fdb8-5e85-45fb-b399-5d77523f8300", key = "a".repeat(24), at = Math.ceil((Date.now() + 86400000) / slotLength) * slotLength;
function fixture() {
  let data = { state: meetingStateSchema.parse({ id: key, guildId: id(1), reference: "XEN-INT-A7K42P", applicantId: id(2), applicantDiscord: "applicant", status: "scheduled", workflowStatus: "meeting", scheduledAt: at,
    windowStart: at, windowEnd: at + 14 * 86400000, attendeeIds: [id(2), id(3)], channelId: id(30), announcementId: id(31), completed: true, attempts: 1, failureReason: null, staffRoleIds: [id(20)], bookedAt: Date.now() - 10000, reminders: { six: Date.now() },
    participants: [2, 3].map((n) => ({ userId: id(n), kind: n === 2 ? "applicant" : "manager", slots: [at, at + slotLength], responded: true, outcome: { channelId: id(n + 40), messageId: id(n + 50) } })) }), revision, leased: 0, outcome: {} }, tail = Promise.resolve(), busy = [], profiles = [], failSave = false;
  async function execute(target, sql, p = []) {
    if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]]; if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }]];
    if (sql.includes("WHERE id <>")) return [busy.map((state) => ({ state }))];
    if (sql.startsWith("SELECT state FROM discord_meeting_outcomes")) return [[{ state: target.outcome }]];
    if (sql.startsWith("SELECT state")) return [[structuredClone(target)]];
    if (sql.startsWith("UPDATE discord_meeting_outcomes")) { target.outcome = JSON.parse(p[0]); return [{}]; }
    if (sql.startsWith("UPDATE discord_meetings")) { if (failSave) throw Error("private SQL details"); target.state = JSON.parse(p[0]); target.revision = p[1]; return [{ affectedRows: 1 }]; }
    throw Error(sql);
  }
  const pool = { execute: (sql, p) => execute(data, sql, p), getConnection: async () => { let draft, release;
    return { async beginTransaction() { const old = tail; tail = new Promise((resolve) => { release = resolve; }); await old; draft = structuredClone(data); }, execute: (sql, p) => execute(draft, sql, p), async commit() { data = draft; }, async rollback() {}, release() { release(); }, destroy() { release(); } };
  } };
  const overrides = { "@/lib/db": { getDbPool: () => pool }, "@/lib/meeting-portal": { availabilityOverview: async (_g, ids) => ids.map((userId) => profiles.find((p) => p.userId === userId) || { userId, gridSlots: [], unknownSlots: Array.from({ length: 336 }, (_, i) => i), slots: null, timezone: null }) } };
  const api = load("lib/meeting-reschedule.ts", overrides), input = { id: key, guildId: id(1), actorId: id(3), revision, serverOwner: false, actorRoleIds: [id(20)], staffRoleIds: [id(20)], userIds: [], scheduledAt: at + 86400000, reason: "Team availability changed" };
  return { api, input, data: () => data, busy: (v) => { busy = v; }, profiles: (v) => { profiles = v; }, fail: () => { failSave = true; } };
}
test("staff rescheduling atomically keeps the meeting/channel, adds guests and records old DM cleanup while resetting reminders", async () => {
  const f = fixture(), old = structuredClone(f.data().state); const result = await f.api.rescheduleMeeting({ ...f.input, userIds: [id(4), id(4), id(3)] });
  assert.equal(result.added, 1); const s = f.data().state;
  assert.equal(s.id, old.id); assert.equal(s.channelId, old.channelId); assert.equal(s.roundNumber, old.roundNumber); assert.equal(s.scheduledAt, f.input.scheduledAt);
  assert.deepEqual(s.attendeeIds, [id(2), id(3), id(4)]); assert.equal(s.participants[2].kind, "guest"); assert.deepEqual(s.staffRoleIds, [id(20)]);
  assert.deepEqual(s.reminders, {}); assert.equal(s.completed, false); assert.equal(s.reschedule.fromAt, at); assert.equal(s.reschedule.cleanup.length, 2);
  assert.equal(s.reschedule.cleanup[0].receipt.messageId, old.participants[0].outcome.messageId); assert.ok(!s.participants[0].outcome); assert.notEqual(f.data().revision, revision);
});
test("owner can book an exact imminent time without replies, quorum, a live window or clash checks, including every participant", async () => {
  const f = fixture(), s = f.data().state, scheduledAt = Date.now() + 12 * 60000 + 123;
  s.status = "no_match"; s.scheduledAt = null; s.channelId = null; s.announcementId = null; s.attendeeIds = []; s.completed = true;
  s.participants.forEach((p) => { p.responded = false; p.slots = []; p.availabilityWaivedAt = Date.now(); });
  s.windowStart = at - 30 * 86400000; s.windowEnd = s.windowStart + 14 * 86400000;
  f.busy([{ ...s, status: "scheduled", id: "b".repeat(24), scheduledAt, attendeeIds: [id(2)] }]);
  await f.api.rescheduleMeeting({ ...f.input, serverOwner: true, ownerOverride: true, scheduledAt });
  const saved = f.data().state;
  assert.equal(saved.scheduledAt, scheduledAt); assert.equal(saved.status, "scheduled"); assert.equal(saved.workflowStatus, "meeting");
  assert.deepEqual(saved.attendeeIds, [id(2), id(3)]); assert.equal(saved.reschedule, undefined);
  assert.ok(saved.participants.every((p) => !p.availabilityWaivedAt)); assert.equal(saved.completed, false);
  assert.equal(saved.ownerScheduled.actorId, f.input.actorId); assert.equal(saved.lastAction.kind, "owner_meeting_time_set");
});
test("owner exact-time rescheduling keeps cleanup; non-owners, stale edits and closed meetings remain rejected", async () => {
  const f = fixture(); f.data().state.participants.push({ ...f.data().state.participants[1], userId: id(4), outcome: undefined });
  await f.api.rescheduleMeeting({ ...f.input, serverOwner: true, ownerOverride: true });
  assert.equal(f.data().state.reschedule.fromAt, at); assert.equal(f.data().state.reschedule.cleanup.length, 2);
  assert.ok(f.data().state.attendeeIds.includes(id(4))); assert.ok(f.data().state.participants[2].addedAt, "newly included attendees need private channel access");
  for (const mode of ["non-owner", "stale", "closed", "lease", "past"]) {
    const f = fixture(), input = { ...f.input, serverOwner: true, ownerOverride: true };
    if (mode === "non-owner") input.serverOwner = false;
    if (mode === "stale") input.revision = "stale";
    if (mode === "closed") f.data().state.workflowStatus = "closed";
    if (mode === "lease") f.data().leased = 1;
    if (mode === "past") input.scheduledAt = Date.now() - 1;
    await assert.rejects(f.api.rescheduleMeeting(input)); assert.equal(f.data().state.scheduledAt, at);
  }
});
test("unauthorised, stale, leased, closed and conflicting reschedules cannot partly add participants", async () => {
  for (const change of ["permission", "revision", "lease", "closed", "conflict", "outcome", "cancellation"]) {
    const f = fixture(), input = { ...f.input, userIds: [id(4)] };
    if (change === "permission") { input.actorRoleIds = [id(21)]; input.staffRoleIds = [id(21)]; }
    if (change === "revision") input.revision = "old";
    if (change === "lease") f.data().leased = 1;
    if (change === "closed") f.data().state.workflowStatus = "closed";
    if (change === "conflict") f.busy([{ ...f.data().state, id: "b".repeat(24), scheduledAt: input.scheduledAt, attendeeIds: [id(2)] }]);
    if (change === "outcome") f.data().outcome = { status: "review" };
    if (change === "cancellation") f.data().state.lifecycle = { records: {}, cancellation: { token: revision, requestedBy: id(3), requestedAt: Date.now(), expiresAt: Date.now() + 60000, reason: "Pending approval" } };
    await assert.rejects(f.api.rescheduleMeeting(input)); assert.equal(f.data().state.scheduledAt, at); assert.equal(f.data().state.participants.length, 2);
  }
});
test("invalid times, incomplete prior notifications and failed persistence do not change the booking", async () => {
  for (const scheduledAt of [Date.now(), at, at + 1, at + 100 * 86400000]) { const f = fixture(); await assert.rejects(f.api.rescheduleMeeting({ ...f.input, scheduledAt }), (e) => e.status === 400); }
  const f = fixture(); f.fail(); await assert.rejects(f.api.rescheduleMeeting(f.input)); assert.equal(f.data().state.scheduledAt, at);
  const next = fixture(); await next.api.rescheduleMeeting(next.input);
  await assert.rejects(next.api.rescheduleMeeting({ ...next.input, revision: next.data().revision, scheduledAt: at + 2 * 86400000 }), /still being processed/);
});
test("staff availability includes explicit meeting replies, per-week unknowns and other booked commitments without submission details", async () => {
  const f = fixture(), day = new Date(at + 7200000).toISOString().slice(0, 10), monday = new Date(`${day}T00:00:00Z`); monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const weekStart = monday.toISOString().slice(0, 10), start = Date.parse(`${weekStart}T00:00:00+02:00`), slot = (at - start) / slotLength;
  f.profiles([{ userId: id(3), gridSlots: [slot], unknownSlots: [] }]);
  f.busy([{ ...f.data().state, id: "b".repeat(24), scheduledAt: at, attendeeIds: [id(3)] }]);
  const result = await f.api.rescheduleAvailability({ ...f.input, weekStart, userIds: [id(4)] });
  assert.equal(result.items.length, 3); assert.ok(result.items[0].meetingGridSlots.includes(slot)); assert.ok(result.items[0].meetingKnownSlots.includes(slot));
  assert.ok(result.items[1].busySlots.includes(slot)); assert.equal(result.items[2].unknownSlots.length, 336); assert.equal(result.items[2].attending, true);
  assert.ok(!JSON.stringify(result).includes("applicantDiscord"));
  await assert.rejects(f.api.rescheduleAvailability({ ...f.input, weekStart, actorRoleIds: [] }), (e) => e.status === 403);
  f.busy([{ ...f.data().state, id: "b".repeat(24), scheduledAt: f.input.scheduledAt, workflowStatus: "closed", attendeeIds: [id(2)] }]);
  await assert.rejects(f.api.rescheduleMeeting(f.input), /already booked/);
});
test("reschedule endpoint authenticates first, requires confirmation and rejects arbitrary fields", async () => {
  const old = process.env.WEBSITE_BOT_TOKEN; process.env.WEBSITE_BOT_TOKEN = "reschedule-test";
  const route = load("app/api/bot/meeting-reschedule/route.ts", { "@/lib/meeting-reschedule": { rescheduleMeeting: async () => ({ success: true }) } });
  const input = { ...fixture().input, action: "reschedule", confirmed: true }, request = (value, auth) => new Request("https://example.org/api/bot/meeting-reschedule", { method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer reschedule-test" } : {}) }, body: JSON.stringify(value) });
  try {
    assert.equal((await route.POST(request(input))).status, 401); assert.equal((await route.POST(request(input, true))).status, 200);
    assert.equal((await route.POST(request({ ...input, confirmed: false }, true))).status, 400); assert.equal((await route.POST(request({ ...input, sql: "edit anything" }, true))).status, 400);
  } finally { if (old === undefined) delete process.env.WEBSITE_BOT_TOKEN; else process.env.WEBSITE_BOT_TOKEN = old; }
});
test("legacy workers cannot persist reschedule jobs during a rolling bot deployment", async () => {
  const f = fixture(); await f.api.rescheduleMeeting(f.input);
  const old = process.env.WEBSITE_BOT_TOKEN; process.env.WEBSITE_BOT_TOKEN = "reschedule-test"; let saves = 0;
  const route = load("app/api/bot/meetings/route.ts", { "@/lib/meetings": { saveMeetingJob: async () => { saves++; return revision; } } });
  const request = (capability) => new Request("https://example.org/api/bot/meetings", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer reschedule-test", ...(capability ? { "X-Xenon-Meeting-Capabilities": "reschedule-v1" } : {}) },
    body: JSON.stringify({ action: "save", state: f.data().state, revision, leaseToken: revision, release: true }) });
  try { assert.equal((await route.POST(request(false))).status, 409); assert.equal(saves, 0); assert.equal((await route.POST(request(true))).status, 200); assert.equal(saves, 1); }
  finally { if (old === undefined) delete process.env.WEBSITE_BOT_TOKEN; else process.env.WEBSITE_BOT_TOKEN = old; }
});
