const test = require("node:test"), assert = require("node:assert/strict"), load = require("./load-typescript.cjs");
const contract = load("lib/meeting-contract.ts"), id = (n) => String(100000000000000000n + BigInt(n)), meetingId = "a".repeat(24);
function fixture() {
  const start = Math.floor(Date.now() / 1800000) * 1800000;
  let meeting = contract.meetingStateSchema.parse({ id: meetingId, guildId: id(1), reference: "XEN-INT-A7K42P", applicantDiscord: "Member", applicantId: id(2),
    windowStart: start, windowEnd: start + 14 * 86400000, status: "scheduled", workflowStatus: "meeting", scheduledAt: start, channelId: id(10), announcementId: id(11),
    participants: [{ userId: id(2), kind: "applicant", slots: [], responded: true }, { userId: id(3), kind: "manager", slots: [], responded: true }],
    attendeeIds: [id(2), id(3)], attempts: 1, failureReason: null, completed: true });
  let records = new Map(), tail = Promise.resolve();
  async function execute(rows, sql, p = []) {
    if (sql.includes("LIMIT 0") || sql.startsWith("CREATE")) return [[]];
    if (sql.startsWith("SELECT state FROM discord_meetings")) return [[{ state: structuredClone(meeting) }]];
    if (sql.startsWith("SELECT revision, state")) return [[rows.get(p[2])].filter(Boolean).map((v) => structuredClone(v))];
    if (sql.startsWith("INSERT")) { rows.set(p[2], { revision: p[3], state: JSON.parse(p[4]), lease_token: p[6], leased_until: p[7], user_id: p[2] }); return [{}]; }
    if (sql.startsWith("SELECT user_id, state")) return [[...rows.values()].map((v) => structuredClone(v))];
    throw Error("Unexpected test query");
  }
  const pool = { execute: (sql, p) => execute(records, sql, p), getConnection: async () => {
    let rows, release;
    return { async beginTransaction() { const previous = tail; tail = new Promise((r) => { release = r; }); await previous; rows = structuredClone(records); },
      execute: (sql, p) => execute(rows, sql, p), async commit() { records = rows; }, async rollback() {}, release() { release(); } };
  } };
  const api = load("lib/meeting-notes.ts", { "@/lib/db": { getDbPool: () => pool } });
  const identity = { id: meetingId, guildId: id(1), actorId: id(2), authorName: "Stormi" };
  return { api, identity, row: (user = id(2)) => records.get(user), meeting, setMeeting: (v) => { meeting = { ...meeting, ...v }; } };
}
test("notes are per person, save for ten minutes, cancel on reopen and protect against stale editors", async () => {
  const f = fixture(), opened = await f.api.changeMeetingNote({ ...f.identity, action: "open" }), before = Date.now();
  const saved = await f.api.changeMeetingNote({ ...f.identity, action: "save", revision: opened.revision, text: "My action items" });
  assert.ok(saved.note.reminderAt >= before + 600000 && saved.note.reminderAt <= Date.now() + 600000);
  await assert.rejects(f.api.changeMeetingNote({ ...f.identity, action: "claim" }), /no longer due/);
  const other = await f.api.changeMeetingNote({ ...f.identity, actorId: id(3), authorName: "Killer", action: "open" });
  assert.equal(other.note.text, ""); assert.equal(f.row().state.text, "My action items");
  const reopened = await f.api.changeMeetingNote({ ...f.identity, action: "open" });
  assert.equal(reopened.note.text, "My action items"); assert.equal(reopened.note.reminderAt, null);
  await assert.rejects(f.api.changeMeetingNote({ ...f.identity, action: "save", revision: opened.revision, text: "old editor" }), /another editor/);
  assert.equal(f.row().state.text, "My action items");
  const visible = await f.api.meetingNoteList(meetingId, id(1));
  assert.equal(visible.length, 1); assert.equal(visible[0].userId, id(2)); assert.equal(visible[0].authorName, "Stormi");
  assert.ok(!Object.hasOwn(visible[0], "receipt"));
});
test("reminder leases fence reopen/save races and retain a successful DM receipt without repeating delivery", async () => {
  const f = fixture(), opened = await f.api.changeMeetingNote({ ...f.identity, action: "open" });
  await f.api.changeMeetingNote({ ...f.identity, action: "save", revision: opened.revision, text: "Follow up" });
  f.row().state.reminderAt = Date.now() - 100;
  const claimed = await f.api.changeMeetingNote({ ...f.identity, action: "claim" });
  await assert.rejects(f.api.changeMeetingNote({ ...f.identity, action: "claim" }), /no longer due/);
  const work = { ...f.identity, revision: claimed.revision, leaseToken: claimed.leaseToken };
  assert.equal((await f.api.changeMeetingNote({ ...work, action: "prepare" })).current, true);
  await f.api.changeMeetingNote({ ...f.identity, action: "open" });
  assert.equal((await f.api.changeMeetingNote({ ...work, action: "sent", receipt: { channelId: id(30), messageId: id(31) } })).current, false);
  assert.equal(f.row().state.reminderAt, null);
  f.setMeeting({ deletion: { requestedBy: id(2), requestedAt: Date.now(), initialized: false, channelDeleted: false, scans: [] } });
  await assert.rejects(f.api.changeMeetingNote({ ...f.identity, action: "open" }), /deleted/);
});
test("blocked DMs stop retrying without discarding notes; clearing notes schedules no copy", async () => {
  const f = fixture(), opened = await f.api.changeMeetingNote({ ...f.identity, action: "open" });
  await f.api.changeMeetingNote({ ...f.identity, action: "save", revision: opened.revision, text: "Keep this" });
  f.row().state.reminderAt = Date.now() - 100;
  const claimed = await f.api.changeMeetingNote({ ...f.identity, action: "claim" });
  const failed = await f.api.changeMeetingNote({ ...f.identity, action: "failed", revision: claimed.revision, leaseToken: claimed.leaseToken, failure: "dm-blocked" });
  assert.equal(failed.note.text, "Keep this"); assert.equal(failed.note.reminderAt, null); assert.equal(failed.note.deliveryFailure, "dm-blocked");
  const next = await f.api.changeMeetingNote({ ...f.identity, action: "open" });
  const cleared = await f.api.changeMeetingNote({ ...f.identity, action: "save", revision: next.revision, text: "  " });
  assert.equal(cleared.note.reminderAt, null); assert.deepEqual(await f.api.meetingNoteList(meetingId, id(1)), []);
});
test("meeting cleanup waits for active deliveries, includes note authors and receipts, then deletes only that meeting's notes", async () => {
  const f = fixture(), opened = await f.api.changeMeetingNote({ ...f.identity, action: "open" });
  await f.api.changeMeetingNote({ ...f.identity, action: "save", revision: opened.revision, text: "Follow up" });
  f.row().state.reminderAt = Date.now() - 1;
  const claimed = await f.api.changeMeetingNote({ ...f.identity, action: "claim" });
  await assert.rejects(f.api.noteDeletionContext(meetingId, id(1)), /finishing/);
  await f.api.changeMeetingNote({ ...f.identity, action: "sent", revision: claimed.revision, leaseToken: claimed.leaseToken, receipt: { channelId: id(30), messageId: id(31) } });
  const cleanup = await f.api.noteDeletionContext(meetingId, id(1));
  assert.deepEqual(cleanup.authors, [id(2)]); assert.deepEqual(cleanup.receipts, [{ channelId: id(30), messageId: id(31) }]);
  const queries = []; await f.api.deleteMeetingNotes({ execute: async (sql, params) => queries.push([sql, params]) }, meetingId, id(1));
  assert.match(queries[0][0], /WHERE meeting_id = \? AND guild_id = \?/); assert.deepEqual(queries[0][1], [meetingId, id(1)]);
});
test("notes API authenticates first, permits participants or existing meeting viewers, and cannot target another person's notes", async () => {
  const old = process.env.WEBSITE_BOT_TOKEN; process.env.WEBSITE_BOT_TOKEN = "test-notes-only";
  const f = fixture(), writes = []; let viewer = false, crash = false;
  const route = load("app/api/bot/meeting-notes/route.ts", { "@/lib/meetings": { getMeeting: async () => ({ state: f.meeting }) },
    "@/lib/meeting-portal": { routeKeys: ["interest"], portalDetail: async () => viewer ? {} : null },
    "@/lib/meeting-notes": { changeMeetingNote: async (v) => { if (crash) throw Error("database password"); writes.push(v); return { success: true }; } } });
  const base = { ...f.identity, action: "open", allowedRoutes: [], allowedDepartments: [], serverOwner: false, viewAllInternal: false, teamMember: false, actorStaffRoleIds: [] };
  const call = (body, auth = true) => route.POST(new Request("https://example.org/api/bot/meeting-notes", { method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer test-notes-only" } : {}) }, body: JSON.stringify(body) }));
  try {
    assert.equal((await call(base, false)).status, 401); assert.equal(writes.length, 0);
    assert.equal((await call({ ...base, userId: id(3) })).status, 400);
    assert.equal((await call({ ...base, actorId: id(99) })).status, 403);
    assert.equal((await call(base)).status, 200);
    viewer = true; assert.equal((await call({ ...base, actorId: id(99) })).status, 200);
    crash = true; const failed = await call(base); assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /password/);
  } finally { if (old === undefined) delete process.env.WEBSITE_BOT_TOKEN; else process.env.WEBSITE_BOT_TOKEN = old; }
});
