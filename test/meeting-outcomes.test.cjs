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
function manualFixture() {
  const f = fixture(), meeting = f.data().meetings.get(meetingId).state;
  meeting.reference = "XEN-MTG-AAAAAAAAAAAA"; meeting.internal = { topic: "Content discussion", recipientType: "discord" };
  meeting.staffRoleIds = [id(50)]; meeting.participants[1].displayName = "Stormi";
  return { ...f, meeting, proposal: (change = {}) => f.propose({ actorId: id(2), recipientId: id(3), ...change }) };
}
test("an internal voice session records real attendance without changing the proposal workflow", async (t) => {
  let now = Date.now(); t.mock.method(Date, "now", () => now);
  const f = manualFixture();
  const observe = (qualified, empty) => f.api.observeMeeting(meetingId, id(1), qualified, empty);
  const listed = await f.api.listMeetingOutcomes(id(1), null);
  assert.equal(listed.meetings[0].meeting.internal, true);
  await observe(false, true);
  assert.equal(f.data().outcomes.size, 0);
  await observe(true, false);
  await observe(false, true);
  now += 60000;
  const session = (await observe(false, true)).outcome;
  assert.equal(session.status, "watching");
  assert.deepEqual(session.voiceSession, { scheduledAt: f.meeting.scheduledAt, emptySince: now - 60000 });
  assert.equal((await observe(false, false)).outcome.voiceSession.emptySince, undefined);
  assert.equal((await f.review()).outcome.status, "review");
  assert.equal((await f.proposal()).outcome.status, "offered");
});
test("a manual proposal addresses the chosen participant without rewriting the meeting requester or requiring a website form", async () => {
  const f = manualFixture(); await f.proposal();
  const saved = f.data().outcomes.get(meetingId).state;
  assert.equal(saved.recipientId, id(3)); assert.equal(saved.status, "offered");
  assert.equal(f.data().meetings.get(meetingId).state.applicantId, id(2));
  const bundle = await f.api.readMeetingOutcome(meetingId, id(1));
  assert.equal(bundle.meeting.applicantId, id(3)); assert.equal(bundle.meeting.applicantDiscord, "Stormi"); assert.equal(bundle.route, "internal");
  const batch = await f.api.listMeetingOutcomes(id(1), null);
  assert.equal(batch.meetings[0].meeting.applicantId, id(3)); assert.deepEqual(batch.meetings[0].meeting.managerIds, [id(2)]);
  assert.doesNotMatch(JSON.stringify(batch), /PRIVATE STAFF NOTES/);
  await assert.rejects(f.respond("accepted", { userId: id(2) }), /recipient/);
  await f.respond("accepted", { userId: id(3) });
  const claimed = await f.api.claimOnboardingRoles(meetingId, id(1), 1);
  assert.equal(claimed.meeting.applicantId, id(3));
  await f.api.acknowledgeOnboardingRoles({ id: meetingId, guildId: id(1), version: 1, leaseToken: claimed.outcome.grant.leaseToken, appliedRoleIds: [id(20)], failed: false });
  assert.equal(f.data().outcomes.get(meetingId).state.status, "onboarded");
});
test("manual proposal versions cannot retarget, bypass role policy, self-approve, or revive cancelled/deleted meetings", async () => {
  for (const changes of [{ recipientId: id(99) }, { recipientId: id(2) }, { roleIds: [id(99)] }]) {
    const f = manualFixture(); await assert.rejects(f.proposal(changes)); assert.equal(f.data().outcomes.size, 0);
  }
  const f = manualFixture(); await f.proposal();
  await assert.rejects(f.proposal({ recipientId: id(2), actorId: id(4), version: 1 }), /different participant/);
  await assert.rejects(f.proposal(), /changed/);
  for (const field of ["cancelled", "deleted", "future"]) {
    const f = manualFixture();
    if (field === "cancelled") f.meeting.lifecycle = { records: {}, cancellation: { token: policyRevision, requestedBy: id(2), requestedAt: Date.now(), expiresAt: Date.now() + 60000, reason: "Cancelled", confirmedAt: Date.now(), confirmedBy: id(3) } };
    if (field === "deleted") f.meeting.deletion = { requestedBy: id(2), requestedAt: Date.now() };
    if (field === "future") f.meeting.scheduledAt = Date.now() + 3600000;
    await assert.rejects(f.proposal()); assert.equal(f.data().outcomes.size, 0);
  }
});
test("a completed manual meeting can receive a proposal while retaining its archive and original requester", async () => {
  const f = manualFixture(); f.meeting.lifecycle = { finishedAt: Date.now(), records: {} }; f.meeting.workflowStatus = "closed";
  await f.proposal({ roleIds: [], roleNames: [], policyRevision: null });
  assert.ok(f.data().meetings.get(meetingId).state.lifecycle.finishedAt);
  assert.equal(f.data().meetings.get(meetingId).state.applicantId, id(2));
  await f.respond("countered", { userId: id(3), text: "Can we change the schedule?" });
  await f.proposal({ version: 1, roleIds: [], roleNames: [], policyRevision: null, summary: "Updated terms" });
  assert.equal(f.data().outcomes.get(meetingId).state.proposals.length, 2);
});
test("a manual follow-up carries the proposal recipient into the next round as its requester", async () => {
  const f = manualFixture(); await f.proposal();
  const result = await f.api.createFollowupMeeting({ id: meetingId, guildId: id(1), actorId: id(2), departments: ["content"], managerIds: [id(4), id(3)], privateNotes: "Staff only" });
  const child = f.data().meetings.get(result.outcome.followupId).state;
  assert.equal(child.applicantId, id(3)); assert.equal(child.internal.recipientType, "department");
  assert.deepEqual(child.participants.map((p) => [p.userId, p.kind]), [[id(4), "manager"], [id(3), "applicant"]]);
  assert.equal(child.lifecycle, undefined); assert.equal(child.ownerScheduled, undefined);
});
test("manual proposal notes in the workspace are visible only to the owner/responsible staff and never to the recipient", async () => {
  const f = manualFixture(); await f.proposal();
  const portal = load("lib/meeting-portal.ts", { "@/lib/meetings": { getMeeting: async () => ({ state: f.data().meetings.get(meetingId).state, revision: policyRevision }) },
    "@/lib/db": { getDbPool: () => ({ execute: async (sql) => {
      if (sql.includes("discord_meeting_history")) return [[]];
      if (sql.includes("discord_meeting_outcome_events")) return [[{ actor_id: id(2), event_type: "proposal_sent", created_at: new Date() }]];
      if (sql.includes("discord_meeting_outcomes")) return [[{ state: f.data().outcomes.get(meetingId).state }]];
      throw Error(sql);
    } }) } });
  const read = (actorId, change = {}) => portal.portalDetail(meetingId, id(1), [], null, { actorId, departments: [], actorStaffRoleIds: [id(50)], participantAccess: true, ...change });
  const owner = await read(id(2), { serverOwner: true }); assert.equal(owner.outcome.privateNotes, "PRIVATE STAFF NOTES");
  const recipient = await read(id(3)); assert.equal(recipient.outcome, null); assert.deepEqual(recipient.outcomeEvents, []); assert.doesNotMatch(JSON.stringify(recipient), /PRIVATE STAFF NOTES/);
  const unrelated = await read(id(4), { actorStaffRoleIds: [] }); assert.equal(unrelated.outcome, null);
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
  assert.ok(f.data().meetings.get(meetingId).state.lifecycle.finishedAt);
  assert.equal(child.lifecycle, undefined);
});
test("a follow-up carries only future saved times on later days for its actual participants", async () => {
  const f = fixture(); await f.review();
  const parent = f.data().meetings.get(meetingId).state;
  const sameDay = contract.followupWindowStart(parent.scheduledAt, "UTC", Date.now() - 86400000) - contract.slotLength;
  const later = contract.followupWindowStart(parent.scheduledAt, "UTC", Date.now()) + contract.slotLength;
  for (const person of parent.participants) person.slots = [sameDay, later].filter((slot) => slot >= parent.windowStart && slot < parent.windowEnd);
  const result = await f.api.createFollowupMeeting({ id: meetingId, guildId: id(1), actorId: id(3), departments: ["founder"], managerIds: [id(3), id(4)], privateNotes: "" });
  const child = f.data().meetings.get(result.outcome.followupId).state;
  assert.equal(child.reuseAvailability, true);
  assert.deepEqual(child.departments, ["founder"]);
  assert.deepEqual(child.participants.map((person) => [person.userId, person.slots, person.responded]), [[id(3), [later], true], [id(4), [], false], [id(2), [later], true]]);
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
