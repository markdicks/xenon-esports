const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-typescript.cjs");
const contract = load("lib/meeting-contract.ts");
const outcomeContract = load("lib/meeting-outcome-contract.ts", { "@/lib/meeting-contract": contract });
const id = (n) => String(100000000000000000n + BigInt(n));
const meetingId = "a".repeat(24), policyRevision = "0899fdb8-5e85-45fb-b399-5d77523f8300";
function fixture(options = {}) {
  const start = Math.floor((Date.now() - 86400000) / contract.slotLength) * contract.slotLength;
  const meeting = contract.meetingStateSchema.parse({ id: meetingId, reference: "XEN-INT-A7K42P", guildId: id(1), applicantDiscord: "applicant", applicantId: id(2),
    windowStart: start, windowEnd: start + 14 * 86400000, status: "scheduled", workflowStatus: "meeting", scheduledAt: Date.now() - 1800000,
    participants: [{ userId: id(2), kind: "applicant", slots: [], responded: true }, { userId: id(3), kind: "manager", slots: [], responded: true }],
    attempts: 1, failureReason: null, channelId: id(10), attendeeIds: [id(2), id(3)], announcementId: id(11), completed: true });
  let data = { meetings: new Map([[meetingId, { state: meeting, round_number: 1 }]]), outcomes: new Map(), events: [],
    policy: { revision: policyRevision, role_ids: [id(20)] } }, tail = Promise.resolve();
  const queries = [];
  async function execute(target, sql, params = []) {
    queries.push([sql, params]);
    if (sql.includes("FROM discord_onboarding_policy")) return [[...(target.policy ? [target.policy] : [])]];
    if (sql.startsWith("INSERT INTO discord_onboarding_policy")) { target.policy = { revision: params[1], role_ids: JSON.parse(params[2]) }; return [{ affectedRows: 1 }]; }
    if (sql.includes("LEFT JOIN discord_meeting_outcomes")) {
      const values = sql.includes("WHERE meeting.id =") ? [target.meetings.get(params[0])].filter(Boolean) : [...target.meetings.values()];
      return [values.map((row) => ({ id: row.state.id, meeting_state: row.state, outcome_state: target.outcomes.get(row.state.id)?.state, revision: target.outcomes.get(row.state.id)?.revision }))];
    }
    if (sql.startsWith("SELECT state FROM discord_meetings")) return [[...(target.meetings.has(params[0]) ? [{ state: target.meetings.get(params[0]).state }] : [])]];
    if (sql.includes("FROM discord_meeting_outcomes WHERE")) return [[...(target.outcomes.has(params[0]) ? [target.outcomes.get(params[0])] : [])]];
    if (sql.startsWith("INSERT INTO discord_meeting_outcomes")) { target.outcomes.set(params[0], { revision: params[1], state: JSON.parse(params[2]) }); return [{ affectedRows: 1 }]; }
    if (sql.startsWith("INSERT INTO discord_meeting_outcome_events")) {
      if (options.failAudit) throw new Error("audit unavailable"); target.events.push({ meetingId: params[0], actorId: params[1], kind: params[2], detail: JSON.parse(params[3]) }); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("UPDATE discord_meetings")) { target.meetings.get(params[2]).state = JSON.parse(params[0]); return [{ affectedRows: 1 }]; }
    if (sql.includes("round_number = 1")) return [[{ id: meetingId }]];
    if (sql.includes("ORDER BY round_number DESC")) {
      const rows = [...target.meetings.values()].filter((row) => row.state.reference === params[0]).sort((a, b) => b.round_number - a.round_number);
      return [[{ id: rows[0].state.id, round_number: rows[0].round_number }]];
    }
    if (sql.startsWith("INSERT INTO discord_meetings")) { target.meetings.set(params[0], { state: JSON.parse(params[4]), round_number: params[5] }); return [{ affectedRows: 1 }]; }
    throw new Error(`Unexpected query ${sql}`);
  }
  const pool = { execute: (sql, params) => execute(data, sql, params), getConnection: async () => {
    let draft, release;
    return { async beginTransaction() { const previous = tail; tail = new Promise((resolve) => { release = resolve; }); await previous; draft = structuredClone(data); },
      execute: (sql, params) => execute(draft, sql, params), async commit() { data = draft; }, async rollback() {}, release() { release(); } };
  } };
  const api = load("lib/meeting-outcomes.ts", { "@/lib/db": { getDbPool: () => pool }, "@/lib/meeting-contract": contract, "@/lib/meeting-outcome-contract": outcomeContract });
  const review = () => api.requestMeetingReview(meetingId, id(1), id(3));
  const propose = (overrides = {}) => api.createMeetingProposal({ id: meetingId, guildId: id(1), actorId: id(3), version: 0,
    summary: "Join as a community contributor.", privateNotes: "PRIVATE STAFF NOTES", roleIds: [id(20)], roleNames: ["Contributor"], policyRevision, ...overrides });
  const respond = (response, overrides = {}) => api.respondToProposal({ id: meetingId, guildId: id(1), userId: id(2), version: 1, response, text: "", ...overrides });
  return { api, data: () => data, queries, review, propose, respond };
}
test("voice presence requires an attended session and a full empty-channel grace period", async (t) => {
  let now = Date.now(); t.mock.method(Date, "now", () => now);
  const f = fixture();
  await f.api.observeMeeting(meetingId, id(1), false, true);
  assert.equal(f.data().outcomes.size, 0);
  await f.api.observeMeeting(meetingId, id(1), true, false);
  await f.api.observeMeeting(meetingId, id(1), false, true);
  now += 59000; await f.api.observeMeeting(meetingId, id(1), false, true);
  assert.equal(f.data().outcomes.get(meetingId).state.status, "watching");
  now += 1000; await f.api.observeMeeting(meetingId, id(1), false, true);
  assert.equal(f.data().outcomes.get(meetingId).state.status, "review");
  assert.equal(f.data().meetings.get(meetingId).state.workflowStatus, "meeting");
});
test("rejoining cancels empty-channel detection; not-finished waits for a new session", async (t) => {
  let now = Date.now(); t.mock.method(Date, "now", () => now);
  const f = fixture(); await f.api.observeMeeting(meetingId, id(1), true, false);
  await f.api.observeMeeting(meetingId, id(1), false, true); now += 30000;
  await f.api.observeMeeting(meetingId, id(1), true, false); now += 60000;
  assert.equal(f.data().outcomes.get(meetingId).state.emptySince, undefined);
  await f.review(); await f.api.continueMeeting(meetingId, id(1), id(3));
  await f.api.observeMeeting(meetingId, id(1), false, true); now += 120000;
  await f.api.observeMeeting(meetingId, id(1), false, true);
  assert.equal(f.data().outcomes.get(meetingId).state.status, "watching");
});
test("proposals serialize by version and only the applicant may answer the latest one", async () => {
  const f = fixture(); await f.review();
  const results = await Promise.allSettled([f.propose(), f.propose()]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  await assert.rejects(f.respond("accepted", { userId: id(3) }), /Only the invited applicant/);
  await assert.rejects(f.respond("countered"), /Describe what/);
  await f.respond("countered", { text: "Could I focus on video editing?" });
  await f.propose({ version: 1, summary: "Video editing contributor" });
  await assert.rejects(f.respond("accepted"), /latest message/);
  await f.respond("accepted", { version: 2 });
  await assert.rejects(f.propose({ version: 2 }), /cannot receive/);
  assert.equal(f.data().outcomes.get(meetingId).state.proposals[0].response.kind, "countered");
});
test("policy changes or unapproved roles block the proposal before any Discord assignment", async () => {
  const f = fixture(); await f.review();
  await assert.rejects(f.propose({ roleIds: [id(99)] }), /Approved onboarding roles changed/);
  await assert.rejects(f.propose({ policyRevision: null }), /Approved onboarding roles changed/);
  assert.equal(f.data().outcomes.get(meetingId).state.proposals.length, 0);
});
test("role grants require acceptance, a unique live lease and only the proposed role IDs", async (t) => {
  let now = Date.now(); t.mock.method(Date, "now", () => now);
  const f = fixture(); await f.review(); await f.propose();
  await assert.rejects(f.api.claimOnboardingRoles(meetingId, id(1), 1), /No accepted proposal/);
  await f.respond("accepted"); const claim = await f.api.claimOnboardingRoles(meetingId, id(1), 1);
  await assert.rejects(f.api.claimOnboardingRoles(meetingId, id(1), 1), /already in progress/);
  const input = { id: meetingId, guildId: id(1), version: 1, leaseToken: claim.outcome.grant.leaseToken, appliedRoleIds: [id(99)], failed: false };
  await assert.rejects(f.api.acknowledgeOnboardingRoles(input), /unapproved role/);
  const completed = await f.api.acknowledgeOnboardingRoles({ ...input, appliedRoleIds: [id(20)] });
  assert.equal(completed.outcome.status, "onboarded");
  await assert.rejects(f.api.acknowledgeOnboardingRoles({ ...input, appliedRoleIds: [] }), /changed or its lease expired/);
});
test("delivery pauses after the initial attempt plus 15 retries and manual retry queues only one", async () => {
  const f = fixture(); await f.review();
  for (let attempt = 0; attempt < 16; attempt++) await f.api.outcomeDeliveryFailed(meetingId, id(1), "proposal");
  assert.equal(f.data().outcomes.get(meetingId).state.deliveryPaused, true);
  await f.api.retryMeetingOutcome(meetingId, id(1), id(3));
  assert.equal(f.data().outcomes.get(meetingId).state.deliveryAttempts, 15);
  await f.api.outcomeDeliveryFailed(meetingId, id(1), "proposal");
  assert.equal(f.data().outcomes.get(meetingId).state.deliveryPaused, true);
});

test("sending a manager update cannot hide a failed role assignment", async () => {
  const f = fixture(); await f.review(); await f.propose(); await f.respond("accepted");
  const claim = await f.api.claimOnboardingRoles(meetingId, id(1), 1);
  await f.api.acknowledgeOnboardingRoles({ id: meetingId, guildId: id(1), version: 1, leaseToken: claim.outcome.grant.leaseToken, appliedRoleIds: [], failed: true });
  await f.api.saveOutcomeReceipt({ id: meetingId, guildId: id(1), field: "notice", version: 1, noticeStatus: "accepted", channelId: id(10), messageId: id(11) });
  assert.equal(f.data().outcomes.get(meetingId).state.deliveryFailure, "roles");
});

test("a worker interrupted on its final role attempt becomes visibly paused after the lease expires", async (t) => {
  let now = Date.now(); t.mock.method(Date, "now", () => now);
  const f = fixture(); await f.review(); await f.propose(); await f.respond("accepted");
  for (let attempt = 0; attempt < 16; attempt++) {
    await f.api.claimOnboardingRoles(meetingId, id(1), 1); now += 120001;
  }
  const result = await f.api.claimOnboardingRoles(meetingId, id(1), 1);
  assert.equal(result.outcome.grant.paused, true); assert.equal(result.outcome.deliveryFailure, "roles");
  assert.equal(result.outcome.grant.leaseToken, undefined);
  await f.api.retryMeetingOutcome(meetingId, id(1), id(3));
  assert.equal((await f.api.claimOnboardingRoles(meetingId, id(1), 1)).outcome.grant.attempts, 16);
});

test("manual terminal status changes stop post-meeting automation and invalidate outstanding proposals", async () => {
  const f = fixture(); await f.review(); await f.propose();
  const meeting = f.data().meetings.get(meetingId).state;
  meeting.workflowStatus = "rejected"; meeting.lastAction = { actorId: id(3), kind: "status:rejected", at: Date.now() };
  await assert.rejects(f.respond("accepted"), /stopped by a submission manager/);
  assert.equal((await f.api.listMeetingOutcomes(id(1), null)).meetings.length, 0);
});

test("stale message receipts cannot hide a newer review cycle or completed onboarding", async () => {
  const f = fixture(); await f.review(); await f.api.continueMeeting(meetingId, id(1), id(3)); await f.review();
  const receipt = { id: meetingId, guildId: id(1), version: 0, channelId: id(10), messageId: id(11) };
  await assert.rejects(f.api.saveOutcomeReceipt({ ...receipt, field: "review", reviewCycle: 0 }), /review changed/);
  await f.propose(); await f.respond("accepted");
  const claim = await f.api.claimOnboardingRoles(meetingId, id(1), 1);
  await f.api.acknowledgeOnboardingRoles({ id: meetingId, guildId: id(1), version: 1, leaseToken: claim.outcome.grant.leaseToken, appliedRoleIds: [id(20)], failed: false });
  await assert.rejects(f.api.saveOutcomeReceipt({ ...receipt, field: "notice", version: 1, noticeStatus: "accepted" }), /response changed/);
  assert.equal(f.data().outcomes.get(meetingId).state.managerNoticeVersion, 0);
});
test("a follow-up creates one linked round without replacing the original meeting", async () => {
  const f = fixture(); await f.review();
  const input = { id: meetingId, guildId: id(1), actorId: id(3), departments: ["creators"], managerIds: [id(4), id(4), id(2)], privateNotes: "PRIVATE FOLLOWUP NOTES" };
  const first = await f.api.createFollowupMeeting(input), second = await f.api.createFollowupMeeting(input);
  assert.equal(first.outcome.followupId, second.outcome.followupId); assert.equal(f.data().meetings.size, 2);
  const child = f.data().meetings.get(first.outcome.followupId).state;
  assert.equal(child.parentMeetingId, meetingId); assert.equal(child.roundNumber, 2); assert.equal(child.reference, "XEN-INT-A7K42P");
  assert.deepEqual(child.departments, ["creators"]); assert.deepEqual(child.participants.filter((person) => person.kind === "manager").map((person) => person.userId), [id(4)]);
  assert.equal(child.status, "pending"); assert.equal(child.channelId, null); assert.equal(child.windowEnd - child.windowStart, 14 * 86400000);
  assert.equal(f.data().meetings.get(meetingId).state.channelId, id(10));
});
test("outcome mutations and their history roll back together", async () => {
  const f = fixture({ failAudit: true });
  await assert.rejects(f.review(), /audit unavailable/);
  assert.equal(f.data().outcomes.size, 0); assert.equal(f.data().events.length, 0);
});
test("worker polling excludes private notes and old proposals", async () => {
  const f = fixture(); await f.review(); await f.propose(); await f.respond("countered", { text: "Change scope" });
  await f.propose({ version: 1, summary: "Latest applicant-facing summary" });
  const batch = await f.api.listMeetingOutcomes(id(1), null), serialized = JSON.stringify(batch);
  assert.doesNotMatch(serialized, /PRIVATE STAFF NOTES|Join as a community contributor/);
  assert.match(serialized, /Latest applicant-facing summary/);
});
test("the follow-up API authenticates before any data access and sanitizes applicant replies", async (t) => {
  const previous = process.env.WEBSITE_BOT_TOKEN; process.env.WEBSITE_BOT_TOKEN = "post-test";
  t.after(() => { if (previous === undefined) delete process.env.WEBSITE_BOT_TOKEN; else process.env.WEBSITE_BOT_TOKEN = previous; });
  let calls = 0;
  const api = load("app/api/bot/meeting-followup/route.ts", { "@/lib/meeting-api": load("lib/meeting-api.ts"), "@/lib/meeting-contract": contract,
    "@/lib/meeting-outcome-contract": outcomeContract, "@/lib/meeting-outcomes": { respondToProposal: async () => { calls++; return { outcome: { status: "accepted", privateNotes: "PRIVATE" } }; } } });
  const body = { action: "respond", id: meetingId, guildId: id(1), userId: id(2), version: 1, response: "accepted" };
  const request = (value, token = "post-test") => new Request("https://xenon.example/api/bot/meeting-followup", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(value) });
  assert.equal((await api.POST(request(body, "wrong"))).status, 401);
  assert.equal((await api.POST(request({ ...body, roleIds: [id(99)] }))).status, 400); assert.equal(calls, 0);
  const response = await api.POST(request(body)); assert.equal(response.status, 200); assert.doesNotMatch(await response.text(), /PRIVATE/);
});
