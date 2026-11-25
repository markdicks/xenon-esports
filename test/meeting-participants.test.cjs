const test = require("node:test"), assert = require("node:assert/strict"), load = require("./load-typescript.cjs");
const contract = load("lib/meeting-contract.ts"), id = (n) => String(100000000000000000n + BigInt(n));
const meetingId = "a".repeat(24), revision = "0899fdb8-5e85-45fb-b399-5d77523f8300";
function fixture() {
  const at = Math.ceil((Date.now() + 86400000) / contract.slotLength) * contract.slotLength;
  let data = { state: contract.meetingStateSchema.parse({ id: meetingId, guildId: id(1), reference: "XEN-INT-A7K42P", applicantDiscord: "person", applicantId: id(2),
    windowStart: at, windowEnd: at + 14 * 86400000, status: "scheduled", workflowStatus: "meeting", scheduledAt: at, channelId: id(10), announcementId: id(11), completed: true,
    participants: [{ userId: id(2), kind: "applicant", slots: [at], responded: true }, { userId: id(3), kind: "manager", slots: [at], responded: true }],
    attendeeIds: [id(2), id(3)], staffRoleIds: [id(20)], attempts: 1, failureReason: null }), revision }, tail = Promise.resolve();
  const queries = []; let busy = [], failSave = false;
  async function execute(target, sql, params = []) {
    queries.push(sql);
    if (sql.includes("discord_meeting_notes")) return sql.startsWith("SELECT") ? [[]] : [{ affectedRows: 0 }];
    if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
    if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }]];
    if (sql.includes("LEFT JOIN")) return [[{ ...target, created_at: new Date(), outcome_state: {} }]];
    if (sql.includes("WHERE id <>")) return [busy.map((state) => ({ state }))];
    if (sql.startsWith("SELECT state") || sql.startsWith("SELECT id")) return [[structuredClone(target)]];
    if (sql.startsWith("UPDATE")) { if (failSave) throw new Error("driver private error"); target.state = JSON.parse(params[0]); target.revision = params[1]; return [{ affectedRows: 1 }]; }
    throw new Error(sql);
  }
  const pool = { execute: (sql, params) => execute(data, sql, params), getConnection: async () => {
    let draft, release;
    return { async beginTransaction() { const previous = tail; tail = new Promise((resolve) => { release = resolve; }); await previous; draft = structuredClone(data); },
      execute: (sql, params) => execute(draft, sql, params), async commit() { data = draft; }, async rollback() {}, release() { release(); }, destroy() { release(); } };
  } };
  const overrides = { "@/lib/db": { getDbPool: () => pool } };
  const participants = load("lib/meeting-participants.ts", overrides), deletion = load("lib/meeting-deletion.ts", overrides);
  const identity = { id: meetingId, guildId: id(1) };
  const add = (change = {}) => participants.addMeetingParticipants({ ...identity, actorId: id(3), revision: data.revision, serverOwner: false, actorRoleIds: [id(20)], staffRoleIds: [id(20)], userIds: [id(4)], ...change });
  return { at, identity, participants, deletion, add, queries, publicMeeting: () => load("lib/meetings.ts", overrides).getMeeting(meetingId), data: () => data, busy: (value) => { busy = value; }, failSave: () => { failSave = true; } };
}
test("scheduled additions preserve time and original staff roles, deduplicate people and invalidate leased snapshots", async () => {
  const f = fixture(); await f.add({ userIds: [id(3), id(4), id(4)] });
  assert.equal(f.data().state.scheduledAt, f.at); assert.deepEqual(f.data().state.attendeeIds, [id(2), id(3), id(4)]);
  assert.equal(f.data().state.participants.at(-1).kind, "guest"); assert.notEqual(f.data().revision, revision);
  assert.deepEqual(f.data().state.staffRoleIds, [id(20)]); assert.equal(f.data().state.completed, false);
  assert.equal((await f.add()).added, 0);
  await assert.rejects(f.add({ actorRoleIds: [id(21)], staffRoleIds: [id(21)] }), (error) => error.status === 403);
  await f.add({ serverOwner: true, actorRoleIds: [], userIds: [id(5)] });
});
test("closed and stale additions fail; conflicting bookings and failed persistence cannot partially add people", async () => {
  const f = fixture(); await assert.rejects(f.add({ revision: "stale" }), /changed/);
  f.busy([{ ...f.data().state, id: "b".repeat(24), attendeeIds: [id(4)] }]);
  await assert.rejects(f.add(), /already booked/); assert.equal(f.data().state.participants.length, 2);
  f.busy([]); f.failSave(); await assert.rejects(f.add(), /private error/); assert.equal(f.data().state.participants.length, 2);
  const closed = fixture(); closed.data().state.workflowStatus = "closed"; await assert.rejects(closed.add(), /closed/);
});
test("unbooked guests must reply and match the actual time, without becoming staff quorum members", async () => {
  const f = fixture(); f.data().state.status = "collecting"; f.data().state.scheduledAt = null; f.data().state.attendeeIds = [];
  await f.add(); const state = f.data().state, guest = state.participants.at(-1);
  assert.equal(contract.meetingFollowUp(state, Date.now()).waitingForManagers, 1);
  assert.equal(contract.matchingSlot(state), null);
  guest.responded = true; guest.slots = [f.at + contract.slotLength];
  assert.equal(contract.matchingSlot(state), null);
  guest.slots = [f.at]; assert.deepEqual(contract.matchingSlot(state).attendeeIds, [id(2), id(3), id(4)]);
});
test("owner deletion records an immutable target and cleanup cannot finish before every channel is processed", async () => {
  const f = fixture(); await f.deletion.requestMeetingDeletion({ ...f.identity, actorId: id(9), revision });
  assert.equal(f.data().state.workflowStatus, "closed"); assert.equal(f.data().state.deletion.requestedBy, id(9));
  assert.equal(await f.publicMeeting(), null);
  await assert.rejects(f.add(), /closed/);
  await assert.rejects(f.deletion.deletionProgress({ ...f.identity, action: "complete" }), /pending/);
  await f.deletion.deletionProgress({ ...f.identity, action: "init", channelIds: [id(30), id(10)] });
  await f.deletion.deletionProgress({ ...f.identity, action: "channel-deleted" });
  await f.deletion.deletionProgress({ ...f.identity, action: "scan-progress", channelId: id(30), done: true });
  await f.deletion.deletionProgress({ ...f.identity, action: "complete" }); assert.ok(f.data().state.deletion.completedAt);
});
test("participant and deletion APIs authenticate first and reject browser-style ownership spoofing", async () => {
  const overrides = { "@/lib/meeting-api": { authorizeBot: (request) => request.headers.get("Authorization") === "Bearer test",
    meetingJson: (value, status = 200) => Response.json(value, { status }), readMeetingJson: (request) => request.json() } };
  const route = load("app/api/bot/meeting-deletion/route.ts", overrides);
  const req = (body, auth = true) => new Request("https://example.test", { method: "POST", headers: auth ? { Authorization: "Bearer test" } : {}, body: JSON.stringify(body) });
  assert.equal((await route.POST(req({}, false))).status, 401);
  assert.equal((await route.POST(req({ action: "request", id: meetingId, guildId: id(1), actorId: id(9), revision, serverOwner: false }))).status, 400);
  const participants = load("app/api/bot/meeting-participants/route.ts", overrides);
  assert.equal((await participants.POST(req({}, false))).status, 401);
  assert.equal((await participants.POST(req({ action: "add", actorId: id(9), owner: true }))).status, 400);
});
