const test = require("node:test"), assert = require("node:assert/strict"), load = require("./load-typescript.cjs");
const contract = load("lib/meeting-contract.ts");
const outcome = load("lib/meeting-outcome-contract.ts", { "@/lib/meeting-contract": contract });
const user = (n) => String(100000000000000000n + BigInt(n));
const api = (pool) => load("lib/meetings.ts", { "@/lib/db": { getDbPool: () => pool }, "@/lib/meeting-contract": contract });
const at = Date.parse("2027-02-01T10:00:00Z");
const input = { requestId: "48979db8-5e85-45fb-b399-5d77523f8300", actorId: user(2), guildId: user(1),
  requester: "Xenon person", department: "competitive", topic: "Practice schedule", managerIds: [user(3)],
  delivery: { checkedAt: at, userIds: [user(2), user(3)] } };
async function fixture(t) {
  let row; t.mock.method(Date, "now", () => at);
  const calls = [], pool = { async execute(sql, args) {
    calls.push([sql, args]);
    if (sql.startsWith("INSERT")) {
      if (row) return [{ affectedRows: 0 }];
      row = { id: args[0], revision: args[3], state: JSON.parse(args[4]) }; return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("SELECT")) return [[row]];
    row.state = JSON.parse(args[0]); row.revision = args[1]; return [{ affectedRows: 1 }];
  } };
  const meetings = api(pool), created = await meetings.createInternalMeeting(input);
  return { meetings, row, created, calls, pool };
}
test("internal requests are idempotent, scoped to a department and have no public submission row", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await f.meetings.createInternalMeeting(input), f.created);
  assert.match(f.created.reference, /^XEN-MTG-[A-F0-9]{12}$/);
  assert.deepEqual(f.row.state.participants.map((row) => row.userId), [user(2), user(3)]);
  assert.deepEqual(f.row.state.departments, ["competitive"]);
  assert.ok(f.calls.every(([sql]) => sql.includes("discord_meetings")));
});

test("manual Discord requests retain resolved participants without inventing a department", async (t) => {
  t.mock.method(Date, "now", () => at);
  const direct = { ...input, requestId: "58979db8-5e85-45fb-b399-5d77523f8300", recipientType: "discord", department: undefined };
  let saved;
  const meetings = api({ execute: async (_sql, args) => { saved = JSON.parse(args[4]); return [{ affectedRows: 1 }]; } });
  await meetings.createInternalMeeting(direct);
  assert.deepEqual(saved.departments, []); assert.equal(saved.internal.recipientType, "discord");
  assert.equal(saved.internal.deliveryCheckedAt, at); assert.deepEqual(saved.participants.map((row) => row.userId), [user(2), user(3)]);
});

test("missing, stale, future or incomplete DM checks cannot create a database record", async (t) => {
  t.mock.method(Date, "now", () => at);
  let writes = 0; const meetings = api({ execute: async () => { writes++; throw new Error("Unexpected write"); } });
  for (const delivery of [undefined, { checkedAt: at, userIds: [user(2)] }, { checkedAt: at - 120001, userIds: input.delivery.userIds },
    { checkedAt: at + 30001, userIds: input.delivery.userIds }, { checkedAt: at, userIds: [user(2), user(3), user(4)] }]) {
    await assert.rejects(meetings.createInternalMeeting({ ...input, delivery }));
  }
  assert.equal(writes, 0);
});

test("direct recipients cannot mix a department, self, duplicates or multiple people", (t) => {
  t.mock.method(Date, "now", () => at);
  assert.equal(contract.meetingRequestSchema.safeParse(input).success, true);
  for (const changes of [{ recipientType: "discord" }, { recipientType: "discord", department: undefined, managerIds: [user(3), user(4)] },
    { managerIds: [user(2)] }, { managerIds: [user(3), user(3)] }]) {
    assert.equal(contract.meetingRequestSchema.safeParse({ ...input, ...changes }).success, false);
  }
});
test("internal requests in the portal are visible to participants or explicit admin view-all, not other department staff", async (t) => {
  const f = await fixture(t), calls = [];
  const portal = load("lib/meeting-portal.ts", { "@/lib/db": { getDbPool: () => ({ execute: async (sql, args) => {
    calls.push([sql, args]); return [[]];
  } }) }, "@/lib/meetings": { getMeeting: f.meetings.getMeeting }, "@/lib/meeting-contract": contract, "@/lib/meeting-outcome-contract": outcome });
  const detail = (actorId, viewAllInternal = false) => portal.portalDetail(f.created.id, input.guildId, ["interest"], null, { actorId, departments: ["competitive"], viewAllInternal });
  assert.equal(await detail(user(4)), null); assert.equal(calls.length, 0);
  assert.equal((await detail(user(3))).answers.topic, "Practice schedule");
  assert.equal((await detail(user(4), true)).source.type, "internal");
  assert.ok(calls.every(([sql]) => sql.includes("discord_meeting_history") || sql.includes("discord_meeting_notes")));
  await portal.portalList(input.guildId, [], null, null, "", { actorId: user(2), departments: [] });
  assert.match(calls.at(-1)[0], /JSON_OBJECT\('userId', \?\)/);
  assert.deepEqual(calls.at(-1)[1].slice(-2), [false, user(2)]);
});
test("the requester alone can confirm an exact current time; skipping keeps the booking open", async (t) => {
  const f = await fixture(t), start = at + 2.5 * contract.hour;
  f.row.state.nearTerm = { at: start, confirmed: false };
  f.row.state.participants[0].slots = [start];
  assert.equal(await f.meetings.decideNearTermMeeting(f.row.id, user(3), start, true), "missing");
  assert.equal(await f.meetings.decideNearTermMeeting(f.row.id, user(2), start + contract.slotLength, true), "stale");
  assert.equal(await f.meetings.decideNearTermMeeting(f.row.id, user(2), start, false), "saved");
  assert.ok(f.row.state.notBefore > at + 3 * contract.hour);
  assert.equal(f.row.state.scheduledAt, null);
  f.row.state.nearTerm = { at: start, confirmed: false }; delete f.row.state.notBefore;
  assert.equal(await f.meetings.decideNearTermMeeting(f.row.id, user(2), start, true), "saved");
  assert.equal(f.row.state.nearTerm.confirmed, true); assert.equal(f.row.state.scheduledAt, null);
});
test("enabled weekly profiles apply to both sides of an internal meeting, not public applicants", async (t) => {
  const f = await fixture(t);
  const profiles = { execute: async (_sql, args) => [args.slice(1).map((id) => ({ user_id: id, timezone: "UTC", weekly_slots: [24] }))] };
  const portal = load("lib/meeting-portal.ts", { "@/lib/db": { getDbPool: () => profiles }, "@/lib/meetings": {},
    "@/lib/meeting-contract": contract, "@/lib/meeting-outcome-contract": outcome });
  const internal = contract.meetingStateSchema.parse(f.row.state);
  await portal.applyStandingAvailability(internal);
  assert.ok(internal.participants.every((row) => row.responded && row.source === "standing" && row.slots.length));
  const publicRecord = { ...structuredClone(f.row.state), reference: "XEN-INT-ABC123", internal: undefined };
  await portal.applyStandingAvailability(publicRecord);
  assert.equal(publicRecord.participants[0].responded, false);
});
test("meeting reminders apply only to eligible future announced bookings and do not double up after downtime", () => {
  const hour = contract.hour, when = at + 72 * hour, state = { scheduledAt: when, status: "scheduled", workflowStatus: "meeting", channelId: user(15), announcementId: user(16) };
  assert.equal(contract.dueMeetingReminder(state, at, when - 24 * hour - 1), null);
  assert.equal(contract.dueMeetingReminder(state, at, when - 24 * hour), "day");
  assert.equal(contract.dueMeetingReminder(state, when - 36 * hour, when - 24 * hour), null);
  assert.equal(contract.dueMeetingReminder(state, at, when - 6 * hour), "six");
  assert.equal(contract.dueMeetingReminder(state, when - 3 * hour, when - hour), null);
  assert.equal(contract.dueMeetingReminder({ ...state, reminders: { six: at } }, at, when - hour), null);
  assert.equal(contract.dueMeetingReminder({ ...state, workflowStatus: "closed" }, at, when - hour), null);
  assert.equal(contract.dueMeetingReminder(state, at, when), null);
});
test("reminders claim with a lease and acknowledge with compare-and-swap", async (t) => {
  const f = await fixture(t), scheduledAt = at + 6 * contract.hour;
  Object.assign(f.row.state, { status: "scheduled", workflowStatus: "meeting", scheduledAt, bookedAt: at - 72 * contract.hour, channelId: user(5), announcementId: user(6), attendeeIds: [user(2), user(3)] });
  let claimed = false; const calls = [];
  const reminderApi = api({ execute: async (sql, args) => {
    calls.push([sql, args]);
    if (sql.startsWith("SELECT")) return [[{ ...f.row, booked_at: f.row.state.bookedAt }]];
    if (sql.includes("DATE_ADD")) { if (claimed) return [{ affectedRows: 0 }]; claimed = true; }
    return [{ affectedRows: 1 }];
  } });
  const [job] = await reminderApi.listMeetingReminders(input.guildId);
  assert.deepEqual(job.attendeeIds, [user(2), user(3)]); assert.equal(job.kind, "six");
  assert.deepEqual(await reminderApi.listMeetingReminders(input.guildId), []);
  assert.equal(await reminderApi.acknowledgeMeetingReminder(job.id, input.guildId, job.revision, job.leaseToken, job.kind), true);
  assert.match(calls.at(-1)[0], /revision = \? AND lease_token = \?/);
});
