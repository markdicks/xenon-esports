const test = require("node:test"), assert = require("node:assert/strict"), load = require("./load-typescript.cjs");
const contract = load("lib/availability-contract.ts");
const id = (n) => String(100000000000000000n + BigInt(n));
const revision = "48979db8-5e85-45fb-b399-5d77523f8300";
const week = "2026-11-23";
const profile = () => contract.profileSchema.parse({ timezone: "Africa/Johannesburg", weeklySlots: [18, 19], mode: "individual", weeks: [{ weekStart: week, slots: [0, 1] }] });
const portal = (pool) => load("lib/meeting-portal.ts", { "@/lib/db": { getDbPool: () => pool }, "@/lib/meetings": {} });

test("legacy recurring schedules survive versioned storage and mode changes preserve both sets of times", () => {
  const legacy = contract.readAvailabilityProfile({ timezone: "UTC", weekly_slots: "[18,19]" });
  assert.equal(legacy.mode, "recurring"); assert.equal(legacy.revision, null); assert.deepEqual(legacy.weeks, []);
  const saved = profile(), encoded = contract.writeAvailabilityProfile(saved, revision);
  const decoded = contract.readAvailabilityProfile({ timezone: saved.timezone, weekly_slots: encoded });
  assert.equal(decoded.revision, revision); assert.deepEqual(decoded.weeklySlots, [18, 19]);
  assert.deepEqual(contract.slotsForWeek(decoded, week), [0, 1]);
  decoded.mode = "recurring"; assert.deepEqual(contract.slotsForWeek(decoded, "2027-01-04"), [18, 19]);
  decoded.mode = "individual"; assert.deepEqual(contract.slotsForWeek(decoded, week), [0, 1]);
});

test("not submitted is distinct from an explicitly unavailable week and does not inherit recurring times", () => {
  const value = profile(); assert.equal(contract.slotsForWeek(value, "2026-11-30"), null);
  value.weeks.push({ weekStart: "2026-11-30", slots: [] }); assert.deepEqual(contract.slotsForWeek(value, "2026-11-30"), []);
  const start = Date.parse("2026-11-29T22:00:00Z"), end = start + 3600000;
  assert.deepEqual(contract.expandProfileAvailability(value, start, end), { slots: [], complete: true });
  value.weeks.pop(); assert.deepEqual(contract.expandProfileAvailability(value, start, end), { slots: [], complete: false });
});

test("individual weeks use the member timezone at Monday boundaries and repeated DST hours", () => {
  const value = profile(), start = Date.parse("2026-11-22T22:00:00Z");
  assert.deepEqual(contract.expandProfileAvailability(value, start, start + 3600000), { slots: [start, start + 1800000], complete: true });
  const dst = contract.profileSchema.parse({ timezone: "America/New_York", weeklySlots: [], mode: "individual", weeks: [{ weekStart: "2026-10-26", slots: [6 * 48 + 2] }] });
  const before = Date.parse("2026-11-01T05:00:00Z");
  assert.deepEqual(contract.expandProfileAvailability(dst, before, before + 7200000).slots, [before, before + 3600000]);
  assert.equal(contract.mondayOf("2027-01-01"), "2026-12-28");
});

test("SAST comparisons convert the same actual hour across timezones and preserve unknown adjacent weeks", () => {
  const local = contract.profileSchema.parse({ timezone: "Africa/Johannesburg", weeklySlots: [40, 41] });
  const london = contract.profileSchema.parse({ timezone: "Europe/London", weeklySlots: [36, 37] });
  assert.deepEqual(contract.projectAvailabilityWeek(local, week).gridSlots, [40, 41]);
  assert.deepEqual(contract.projectAvailabilityWeek(london, week).gridSlots, [40, 41]);
  const individual = contract.profileSchema.parse({ timezone: "America/New_York", weeklySlots: [], mode: "individual", weeks: [{ weekStart: week, slots: [0, 1] }] });
  const projection = contract.projectAvailabilityWeek(individual, week);
  assert.deepEqual(projection.gridSlots, [14, 15]); assert.ok(projection.unknownSlots.includes(0));
  assert.equal(projection.unknownSlots.includes(14), false);
  const dst = contract.profileSchema.parse({ timezone: "America/New_York", weeklySlots: [6 * 48 + 2] });
  const repeated = contract.projectAvailabilityWeek(dst, "2026-10-26");
  assert.ok(repeated.gridSlots.includes(6 * 48 + 14)); assert.ok(repeated.gridSlots.includes(6 * 48 + 16));
});

test("invalid dates, weekdays, duplicate weeks, invalid timezones and oversized calendars are rejected", () => {
  for (const date of ["2026-02-30", "2026-11-24", "not-a-date"]) assert.equal(contract.weekSchema.safeParse(date).success, false);
  for (const change of [{ timezone: "Invalid/Zone" }, { weeks: [{ weekStart: week, slots: [336] }] },
    { weeks: [{ weekStart: week, slots: [] }, { weekStart: week, slots: [] }] }, { weeks: Array.from({ length: 53 }, () => ({ weekStart: week, slots: [] })) }]) {
    assert.equal(contract.profileSchema.safeParse({ ...profile(), ...change }).success, false);
  }
  assert.throws(() => contract.readAvailabilityProfile({ timezone: "UTC", weekly_slots: { version: 999 } }));
});

function storage(initial = null) {
  let row = initial, releaseLock = null, queue = Promise.resolve(); const calls = [];
  const pool = { getConnection: async () => {
    let snapshot;
    return { beginTransaction: async () => { const previous = queue; queue = new Promise((resolve) => { releaseLock = resolve; }); const ownRelease = releaseLock; await previous; snapshot = structuredClone(row); releaseLock = ownRelease; },
      execute: async (sql, args) => { calls.push([sql, args]);
        if (sql.startsWith("SELECT")) return [row ? [row] : []];
        if (sql.startsWith("INSERT")) row = { timezone: args[2], weekly_slots: args[3] };
        if (sql.startsWith("DELETE")) row = null;
        return [{ affectedRows: 1 }]; },
      commit: async () => {}, rollback: async () => { row = snapshot; }, release: () => { releaseLock(); } };
  } };
  return { pool, calls, row: () => row };
}

test("concurrent profile edits serialize and reject the stale revision without losing another week's data", async () => {
  const store = storage(), api = portal(store.pool);
  const first = await api.saveStaffProfile(id(1), id(2), profile());
  const [a, b] = await Promise.allSettled([
    api.saveStaffProfile(id(1), id(2), { ...first, weeks: [...first.weeks, { weekStart: "2026-11-30", slots: [48] }] }),
    api.saveStaffProfile(id(1), id(2), { ...first, weeklySlots: [100] }),
  ]);
  assert.equal(a.status, "fulfilled"); assert.equal(b.status, "rejected"); assert.equal(b.reason.code, "AVAILABILITY_CONFLICT");
  const saved = contract.readAvailabilityProfile(store.row());
  assert.deepEqual(saved.weeks.find((value) => value.weekStart === "2026-11-30").slots, [48]); assert.deepEqual(saved.weeklySlots, [18, 19]);
  const updates = store.calls.filter(([sql]) => sql.startsWith("UPDATE discord_meetings"));
  assert.equal(updates.length, 2); assert.doesNotMatch(updates[0][0], /leased_until\s*=|lease_token\s*=/);
});

test("overview reads only requested current members in the guild and returns only the selected week", async () => {
  let bound;
  const value = profile(); value.weeks.push({ weekStart: "2026-11-30", slots: [90] });
  const api = portal({ execute: async (sql, args) => { bound = [sql, args]; return [[{ user_id: id(2), timezone: value.timezone, weekly_slots: contract.writeAvailabilityProfile(value, revision), updated_at: "2026-11-21T10:00:00Z" }]]; } });
  const rows = await api.availabilityOverview(id(1), [id(2), id(3)], week);
  assert.deepEqual(bound[1], [id(1), id(2), id(3)]); assert.match(bound[0], /guild_id = \? AND user_id IN \(\?,\?\)/);
  assert.deepEqual(rows[0].slots, [0, 1]); assert.equal(rows[1].slots, null);
  assert.equal(rows[0].weeks, undefined); assert.equal(rows[0].revision, undefined); assert.equal(rows[0].weeklySlots, undefined);
});

test("availability API authenticates first, enforces member/viewer scope and never accepts a different profile owner", async (t) => {
  const previous = process.env.WEBSITE_BOT_TOKEN; process.env.WEBSITE_BOT_TOKEN = "availability-test";
  t.after(() => { if (previous === undefined) delete process.env.WEBSITE_BOT_TOKEN; else process.env.WEBSITE_BOT_TOKEN = previous; });
  const calls = [];
  const api = load("app/api/bot/availability/route.ts", { "@/lib/meeting-portal": {
    getStaffProfile: async (...args) => { calls.push(args); return null; }, saveStaffProfile: async (...args) => { calls.push(args); return null; },
    availabilityOverview: async (...args) => { calls.push(args); return []; },
  } });
  const identity = { guildId: id(1), actorId: id(2), member: true, viewer: false };
  const request = (body, token = "availability-test") => new Request("https://xenon.example/api/bot/availability", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...identity, ...body }) });
  assert.equal((await api.POST(request({ action: "profile" }, "wrong"))).status, 401);
  assert.equal((await api.POST(request({ action: "save-profile", member: false, profile: profile() }))).status, 403);
  assert.equal((await api.POST(request({ action: "overview", weekStart: week, userIds: [id(3)] }))).status, 403);
  assert.equal((await api.POST(request({ action: "save-profile", userId: id(3), profile: profile() }))).status, 400);
  assert.equal(calls.length, 0);
  assert.equal((await api.POST(request({ action: "save-profile", profile: profile() }))).status, 200); assert.deepEqual(calls[0].slice(0, 2), [id(1), id(2)]);
  assert.equal((await api.POST(request({ action: "save-profile", member: false, profile: { ...profile(), enabled: false } }))).status, 200);
  assert.equal((await api.POST(request({ action: "overview", viewer: true, weekStart: week, userIds: [id(3)] }))).status, 200);
});
