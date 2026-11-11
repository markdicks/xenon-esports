const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-typescript.cjs");
const contract = load("lib/meeting-contract.ts");
const id = (n) => String(100000000000000000n + BigInt(n));
const at = Math.ceil((Date.now() + 86400000) / contract.slotLength) * contract.slotLength;
function meeting(n, slots = [at, at + contract.slotLength]) {
  return { id: n.toString(16).padStart(24, "0"), revision: `revision-${n}`, leaseToken: `lease-${n}`, validLease: true,
    state: contract.meetingStateSchema.parse({ id: n.toString(16).padStart(24, "0"), reference: `XEN-INT-${String(n).padStart(6, "0")}`,
      guildId: id(1), applicantDiscord: `applicant${n}`, applicantId: id(n + 10), windowStart: at, windowEnd: at + 14 * 86400000,
      status: "collecting", attempts: 1, failureReason: null, channelId: null, scheduledAt: null, attendeeIds: [], announcementId: null, completed: false,
      participants: [{ userId: id(n + 10), kind: "applicant", slots, responded: true }, { userId: id(3), kind: "manager", slots, responded: true }] }) };
}
function fixture(values, options = {}) {
  const rows = new Map(values.map((row) => [row.id, structuredClone(row)])), calls = [];
  let tail = Promise.resolve(), destroyed = 0, released = 0, rollbacks = 0;
  const connection = () => {
    let unlock, pending = new Map();
    return {
      async execute(sql, params) {
        calls.push(sql);
        if (sql.includes("GET_LOCK")) {
          if (options.lockError) throw new Error("lock connection failed");
          if (options.lockTimeout) return [[{ acquired: 0 }]];
          const previous = tail; tail = new Promise((resolve) => { unlock = resolve; }); await previous;
          return [[{ acquired: 1 }]];
        }
        if (sql.includes("RELEASE_LOCK")) {
          if (options.releaseError) throw new Error("release failed");
          unlock(); unlock = null; return [[{ released: 1 }]];
        }
        if (sql.includes("FOR UPDATE")) {
          const row = rows.get(params[0]);
          return [[...(row && row.state.guildId === params[1] && row.revision === params[2] && row.leaseToken === params[3] && row.validLease ? [structuredClone(row)] : [])]];
        }
        if (sql.startsWith("SELECT state")) {
          if (options.calendarError) throw new Error("calendar unavailable");
          return [[...rows.values()].filter((row) => row.id !== params[0] && row.state.scheduledAt > params[1] && row.state.scheduledAt < params[2]).map((row) => ({ state: structuredClone(row.state) }))];
        }
        if (sql.startsWith("UPDATE discord_meetings")) {
          const row = rows.get(params[5]), state = JSON.parse(params[0]);
          if (!row || row.revision !== params[6] || row.leaseToken !== params[7] || !row.validLease) return [{ affectedRows: 0 }];
          pending.set(row.id, { ...row, state, revision: params[1] }); return [{ affectedRows: 1 }];
        }
        throw new Error(`Unexpected query: ${sql}`);
      },
      async beginTransaction() {},
      async commit() { for (const [key, value] of pending) rows.set(key, value); pending.clear(); },
      async rollback() { rollbacks++; pending.clear(); },
      release() { released++; },
      destroy() { destroyed++; if (unlock) unlock(); },
    };
  };
  const api = load("lib/meetings.ts", { "@/lib/db": { getDbPool: () => ({ getConnection: async () => connection() }) },
    "@/lib/meeting-contract": contract, "@/lib/meeting-portal": {} });
  const identity = (row) => ({ id: row.id, guildId: row.state.guildId, revision: row.revision, leaseToken: row.leaseToken });
  return { api, rows, calls, identity, stats: () => ({ destroyed, released, rollbacks }) };
}
test("simultaneous bookings serialize and cannot double-book a shared manager", async () => {
  const values = [meeting(1), meeting(2), meeting(3)], f = fixture(values);
  const results = await Promise.all(values.map((row) => f.api.bookMeetingJob(f.identity(row))));
  assert.deepEqual(results.map((result) => result.state.status), ["scheduled", "scheduled", "no_match"]);
  assert.deepEqual(results.slice(0, 2).map((result) => result.state.scheduledAt), [at, at + contract.slotLength]);
  assert.equal(f.stats().released, 3); assert.equal(f.stats().destroyed, 0);
  assert.equal(f.calls.filter((sql) => sql.includes("GET_LOCK")).length, 3);
});
test("bookings respect earlier saved meetings, including another guild and a closed submission", async () => {
  const previous = meeting(1); previous.state.status = "scheduled"; previous.state.workflowStatus = "closed";
  previous.state.guildId = id(999); previous.state.scheduledAt = at; previous.state.attendeeIds = [id(3)];
  const next = meeting(2), f = fixture([previous, next]);
  const result = await f.api.bookMeetingJob(f.identity(next));
  assert.equal(result.state.scheduledAt, at + contract.slotLength);
});
test("expired leases and stale revisions cannot reserve a time", async () => {
  const row = meeting(1), f = fixture([row]);
  assert.equal(await f.api.bookMeetingJob({ ...f.identity(row), revision: "stale" }), null);
  f.rows.get(row.id).validLease = false;
  assert.equal(await f.api.bookMeetingJob(f.identity(row)), null);
  assert.equal(f.rows.get(row.id).state.status, "collecting");
});
test("the legacy save path cannot bypass conflicts or move an existing reservation", async () => {
  const first = meeting(1), next = meeting(2), f = fixture([first, next]);
  const result = await f.api.bookMeetingJob(f.identity(first));
  const attempted = { ...next.state, status: "scheduled", scheduledAt: at, attendeeIds: [next.state.applicantId, id(3)] };
  assert.equal(await f.api.saveMeetingJob({ state: attempted, revision: next.revision, leaseToken: next.leaseToken, release: false }), null);
  assert.equal(await f.api.saveMeetingJob({ state: { ...result.state, scheduledAt: at + contract.slotLength }, revision: result.revision, leaseToken: first.leaseToken, release: false }), null);
  assert.ok(await f.api.saveMeetingJob({ state: result.state, revision: result.revision, leaseToken: first.leaseToken, release: true }));
});
test("booking failures fail closed, release locks, and discard uncertain connections", async () => {
  const row = meeting(1);
  for (const options of [{ lockTimeout: true }, { lockError: true }, { calendarError: true }]) {
    const f = fixture([row], options);
    await assert.rejects(f.api.bookMeetingJob(f.identity(row)));
    assert.equal(f.rows.get(row.id).state.status, "collecting");
    if (options.lockError) assert.equal(f.stats().destroyed, 1);
    else assert.equal(f.stats().released, 1);
  }
  const f = fixture([row], { releaseError: true });
  assert.equal((await f.api.bookMeetingJob(f.identity(row))).state.status, "scheduled");
  assert.equal(f.stats().destroyed, 1); assert.equal(f.stats().released, 0);
});
