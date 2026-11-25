const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-typescript.cjs");
const contract = load("lib/meeting-contract.ts");
const id = (n) => String(100000000000000000n + BigInt(n));
const revision = "0899fdb8-5e85-45fb-b399-5d77523f8300", meetingId = "a".repeat(24);
function fixture({ people = 2, internal = false, failSave = false } = {}) {
  const start = Math.floor(Date.now() / contract.slotLength) * contract.slotLength;
  const state = contract.meetingStateSchema.parse({ id: meetingId, guildId: id(1), reference: internal ? "XEN-MTG-ABCDEF123456" : "XEN-INT-A7K42P",
    internal: internal ? { topic: "Internal plans", recipientType: "discord" } : undefined,
    applicantDiscord: "person", applicantId: id(2), windowStart: start, windowEnd: start + 14 * 86400000,
    status: "scheduled", workflowStatus: "meeting", scheduledAt: Date.now() - 1800000, channelId: id(10), announcementId: id(11), completed: true,
    participants: [{ userId: id(2), kind: "applicant", slots: [], responded: true },
      ...Array.from({ length: people - 1 }, (_, i) => ({ userId: id(i + 3), kind: "manager", slots: [], responded: true }))],
    attendeeIds: [id(2), id(3)], attempts: 1, failureReason: null });
  let data = { state, revision, outcome: {} }, tail = Promise.resolve(); const queries = [];
  async function execute(target, sql, params = []) {
    queries.push([sql, params]);
    if (sql.includes("LEFT JOIN")) return [[{ ...target, outcome_state: target.outcome }]];
    if (sql.includes("FROM discord_meetings")) return [[{ state: target.state, revision: target.revision }]];
    if (sql.includes("FROM discord_meeting_outcomes")) return [[{ state: target.outcome }]];
    if (sql.startsWith("UPDATE")) {
      if (failSave) throw new Error("private driver error");
      target.state = JSON.parse(params[0]); target.revision = params[1]; return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected query ${sql}`);
  }
  const pool = { execute: (sql, params) => execute(data, sql, params), getConnection: async () => {
    let draft, release;
    return { async beginTransaction() { const previous = tail; tail = new Promise((resolve) => { release = resolve; }); await previous; draft = structuredClone(data); },
      execute: (sql, params) => execute(draft, sql, params), async commit() { data = draft; }, async rollback() {}, release() { release(); } };
  } };
  const api = load("lib/meeting-lifecycle.ts", { "@/lib/db": { getDbPool: () => pool } });
  const identity = { id: meetingId, guildId: id(1) };
  const request = () => api.requestMeetingCancellation({ ...identity, actorId: id(3), revision: data.revision, reason: "Unavailable" });
  const confirm = (actorId = id(2), staff = false, token = data.state.lifecycle?.cancellation?.token) => api.confirmMeetingCancellation({ ...identity, actorId, staff, token });
  return { api, data: () => data, identity, request, confirm, queries };
}
test("cancellation stays pending until the other person confirms and retains both identities", async () => {
  const f = fixture(); await f.request();
  assert.equal(f.data().state.workflowStatus, "meeting"); assert.notEqual(f.data().revision, revision);
  await assert.rejects(f.confirm(id(3), true), /Someone else/);
  await assert.rejects(f.confirm(id(99), true), /other participant/);
  await f.confirm(); const cancellation = f.data().state.lifecycle.cancellation;
  assert.equal(cancellation.requestedBy, id(3)); assert.equal(cancellation.confirmedBy, id(2));
  assert.equal(f.data().state.workflowStatus, "closed"); assert.equal(f.data().state.lastAction.kind, "meeting_cancelled");
  await f.confirm(); assert.deepEqual(f.data().state.lifecycle.cancellation, cancellation);
});
test("attendance is due only after two minutes, serialized by a lease and completed once per booked time", async () => {
  const f = fixture(); f.data().state.scheduledAt = Date.now() - 120100;
  assert.equal((await f.api.dueMeetingAttendance(id(1))).meetings.length, 1);
  const input = { ...f.identity, scheduledAt: f.data().state.scheduledAt };
  const results = await Promise.allSettled([f.api.claimMeetingAttendance(input), f.api.claimMeetingAttendance(input)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const leaseToken = f.data().state.lifecycle.attendance.leaseToken;
  await f.api.completeMeetingAttendance({ ...input, leaseToken });
  assert.equal((await f.api.dueMeetingAttendance(id(1))).meetings.length, 0);
  f.data().state.scheduledAt -= 1000;
  assert.equal((await f.api.dueMeetingAttendance(id(1))).meetings.length, 1);
  await assert.rejects(f.api.completeMeetingAttendance({ ...input, leaseToken }), /changed/);
  f.data().state.workflowStatus = "closed";
  assert.equal((await f.api.dueMeetingAttendance(id(1))).meetings.length, 0);
});
test("future, finished and old meetings cannot claim attendance and expired leases cannot complete", async () => {
  const f = fixture();
  await assert.rejects(f.api.claimMeetingAttendance({ ...f.identity, scheduledAt: f.data().state.scheduledAt }), /no longer due/);
  f.data().state.scheduledAt = Date.now() + 1000;
  await assert.rejects(f.api.claimMeetingAttendance({ ...f.identity, scheduledAt: f.data().state.scheduledAt }), /no longer due/);
  f.data().state.scheduledAt = Date.now() - 120100;
  const input = { ...f.identity, scheduledAt: f.data().state.scheduledAt };
  const claimed = await f.api.claimMeetingAttendance(input);
  f.data().state.lifecycle.attendance.leaseUntil = Date.now() - 1;
  await assert.rejects(f.api.completeMeetingAttendance({ ...input, leaseToken: claimed.lifecycle.attendance.leaseToken }), /changed/);
  f.data().state.lifecycle.finishedAt = Date.now();
  await assert.rejects(f.api.claimMeetingAttendance(input), /no longer due/);
});
test("group cancellation requires another staff member, and stale or expired approvals cannot cancel", async (t) => {
  const f = fixture({ people: 3 }); await f.request();
  await assert.rejects(f.confirm(), /Another eligible staff/);
  await assert.rejects(f.confirm(id(4), true, revision), /no longer current/);
  const now = Date.now(); t.mock.method(Date, "now", () => now + 11 * 60000);
  await assert.rejects(f.confirm(id(4), true), /expired/);
  assert.equal(f.data().state.workflowStatus, "meeting");
});
test("concurrent cancellation requests serialize; a later accepted proposal invalidates pending approval", async () => {
  const f = fixture(); const results = await Promise.allSettled([f.request(), f.request()]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  f.data().outcome.status = "accepted";
  await assert.rejects(f.confirm(), /already finished/);
  assert.equal(f.data().state.lifecycle.cancellation.confirmedAt, undefined);
});
test("failed persistence rolls the cancellation back; internal completion rejects public or future meetings", async () => {
  const f = fixture({ failSave: true }); await assert.rejects(f.request(), /private driver/);
  assert.equal(f.data().state.lifecycle, undefined);
  const publicMeeting = fixture();
  await assert.rejects(publicMeeting.api.finishInternalMeeting({ ...publicMeeting.identity, actorId: id(3), revision }), /existing meeting review/);
  const internal = fixture({ internal: true });
  internal.data().state.scheduledAt = Date.now() + 3600000;
  await assert.rejects(internal.api.finishInternalMeeting({ ...internal.identity, actorId: id(3), revision }), /not started/);
  internal.data().state.scheduledAt = Date.now() - 3600000;
  await internal.api.finishInternalMeeting({ ...internal.identity, actorId: id(3), revision });
  assert.ok(internal.data().state.lifecycle.finishedAt); assert.equal(internal.data().state.workflowStatus, "closed");
});
test("historical lifecycle polling includes internal/old channels and exposes only public proposal terms", async () => {
  const f = fixture();
  f.data().outcome = { status: "onboarded", privateNotes: "NEVER SEND NOTES", proposals: [{ version: 1, authorId: id(3), at: Date.now(),
    summary: "Accepted terms", privateNotes: "NEVER SEND PROPOSAL NOTES", roleIds: [], roleNames: [], response: { kind: "accepted", userId: id(2), at: Date.now() } }] };
  const result = await f.api.listMeetingLifecycle(id(1), null);
  assert.equal(result.meetings[0].outcome.proposals[0].summary, "Accepted terms");
  assert.doesNotMatch(JSON.stringify(result), /NEVER SEND|slots|invitation/);
  assert.doesNotMatch(f.queries[0][0], /scheduledAt|XEN-MTG|finished_at/);
});
test("internal endpoint rejects unauthenticated calls and arbitrary writes before touching storage", async () => {
  let writes = 0;
  const route = load("app/api/bot/meeting-lifecycle/route.ts", { "@/lib/meeting-api": { authorizeBot: (request) => request.headers.get("Authorization") === "Bearer test",
    meetingJson: (value, status = 200) => Response.json(value, { status }), readMeetingJson: (request) => request.json() },
    "@/lib/meeting-lifecycle": { requestMeetingCancellation: async () => { writes++; } } });
  const request = (body, authenticated = true) => new Request("https://example.test/api/bot/meeting-lifecycle", { method: "POST", headers: authenticated ? { Authorization: "Bearer test" } : {}, body: JSON.stringify(body) });
  assert.equal((await route.POST(request({}, false))).status, 401);
  assert.equal((await route.POST(request({ action: "set", table: "users" }))).status, 400);
  assert.equal((await route.POST(request({ action: "request-cancel", id: meetingId, guildId: id(1), actorId: id(3), revision, staff: false, reason: "No" }))).status, 400);
  assert.equal(writes, 0);
});
