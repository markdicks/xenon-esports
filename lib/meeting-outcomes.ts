import { randomBytes, randomUUID } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db";
import { meetingStateSchema, slotLength, type MeetingState } from "@/lib/meeting-contract";
import { outcomeSchema, rolePolicySchema, type MeetingOutcome } from "@/lib/meeting-outcome-contract";

const parsed = (value: unknown) => typeof value === "string" ? JSON.parse(value) : value;
const manuallyStopped = (meeting: MeetingState) => ["accepted", "rejected", "closed"].includes(meeting.workflowStatus)
  && Boolean(meeting.lastAction?.kind.startsWith("status:"));
function fail(message: string, status = 409): never { throw Object.assign(new Error(message), { status }); }
type Context = { meeting: MeetingState; outcome: MeetingOutcome; revision: string | null };
export async function onboardingPolicy(guildId: string, connection: Pool | PoolConnection = getDbPool()) {
  const [rows] = await connection.execute<RowDataPacket[]>("SELECT revision, role_ids FROM discord_onboarding_policy WHERE guild_id = ?", [guildId]);
  return { revision: rows[0]?.revision as string | undefined || null, roleIds: rows[0] ? rolePolicySchema.parse({ roleIds: parsed(rows[0].role_ids) }).roleIds : [] };
}
export async function saveOnboardingPolicy(guildId: string, actorId: string, revision: string | null, roleIds: string[]) {
  const connection = await getDbPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<RowDataPacket[]>("SELECT revision FROM discord_onboarding_policy WHERE guild_id = ? FOR UPDATE", [guildId]);
    if ((rows[0]?.revision || null) !== revision) fail("Onboarding settings changed. Reload before saving.");
    const next = randomUUID();
    await connection.execute(`INSERT INTO discord_onboarding_policy (guild_id, revision, role_ids, updated_by) VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE revision = VALUES(revision), role_ids = VALUES(role_ids), updated_by = VALUES(updated_by)`, [guildId, next, JSON.stringify(roleIds), actorId]);
    await connection.commit(); return { revision: next, roleIds };
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}
export async function readMeetingOutcome(id: string, guildId: string) {
  const [rows] = await getDbPool().execute<RowDataPacket[]>(`SELECT meeting.state AS meeting_state, outcome.state AS outcome_state, outcome.revision
    FROM discord_meetings AS meeting LEFT JOIN discord_meeting_outcomes AS outcome ON outcome.meeting_id = meeting.id
    WHERE meeting.id = ? AND meeting.guild_id = ?`, [id, guildId]);
  if (!rows[0]) fail("Meeting not found.", 404);
  const meeting = meetingStateSchema.parse(parsed(rows[0].meeting_state));
  let route = meeting.reference.startsWith("XEN-APP-") ? "application" : "interest";
  if (meeting.reference.startsWith("XEN-CON-")) {
    const [source] = await getDbPool().execute<RowDataPacket[]>("SELECT subject FROM contact_submissions WHERE public_reference = ?", [meeting.reference]);
    const category = String(source[0]?.subject || "").trim().toLowerCase();
    route = `contact-${["partnerships", "business", "media"].includes(category) ? category : "general-enquiry"}`;
  }
  return { meeting, outcome: outcomeSchema.parse(parsed(rows[0].outcome_state) || {}), revision: rows[0].revision || null, route };
}
export async function listMeetingOutcomes(guildId: string, after: string | null) {
  const [rows] = await getDbPool().execute<RowDataPacket[]>(`SELECT meeting.id, meeting.state AS meeting_state, outcome.state AS outcome_state
    FROM discord_meetings AS meeting LEFT JOIN discord_meeting_outcomes AS outcome ON outcome.meeting_id = meeting.id
    WHERE meeting.guild_id = ? AND (? IS NULL OR meeting.id > ?)
      AND CONVERT(JSON_UNQUOTE(JSON_EXTRACT(meeting.state, '$.status')) USING utf8mb4) COLLATE utf8mb4_unicode_ci = 'scheduled'
      AND (CAST(JSON_UNQUOTE(JSON_EXTRACT(meeting.state, '$.scheduledAt')) AS UNSIGNED) >= ?
        OR CONVERT(JSON_UNQUOTE(JSON_EXTRACT(outcome.state, '$.status')) USING utf8mb4) COLLATE utf8mb4_unicode_ci IN ('review','offered','countered','declined','accepted')
        OR (CONVERT(JSON_UNQUOTE(JSON_EXTRACT(outcome.state, '$.status')) USING utf8mb4) COLLATE utf8mb4_unicode_ci = 'onboarded'
          AND CAST(JSON_EXTRACT(outcome.state, '$.managerNoticeVersion') AS UNSIGNED) = 0))
    ORDER BY meeting.id LIMIT 50`, [guildId, after, after, Date.now() - 24 * 3600000]);
  return { meetings: rows.map((row) => {
    const meeting = meetingStateSchema.parse(parsed(row.meeting_state)), outcome = outcomeSchema.parse(parsed(row.outcome_state) || {});
    const proposal = outcome.proposals.at(-1);
    // Workers never need private staff notes or older proposals in their polling payload.
    return { meeting: { id: meeting.id, guildId, reference: meeting.reference, applicantId: meeting.applicantId, applicantDiscord: meeting.applicantDiscord,
      scheduledAt: meeting.scheduledAt, channelId: meeting.channelId, attendeeIds: meeting.attendeeIds, workflowStatus: meeting.workflowStatus, automationStopped: manuallyStopped(meeting),
      managerIds: meeting.participants.filter((person) => person.kind === "manager").map((person) => person.userId) },
      outcome: { ...outcome, privateNotes: undefined, proposals: proposal ? [{ ...proposal, privateNotes: undefined }] : [] } };
  }).filter((row) => row.meeting.channelId && !row.meeting.automationStopped && row.meeting.workflowStatus !== "closed" && !["followup", "closed"].includes(row.outcome.status)),
    next: rows.length === 50 ? rows.at(-1)!.id as string : null };
}
async function changeOutcome(id: string, guildId: string, actorId: string | null, kind: string,
  operation: (context: Context, connection: PoolConnection) => Promise<void> | void) {
  const connection = await getDbPool().getConnection();
  try {
    await connection.beginTransaction();
    const [meetings] = await connection.execute<RowDataPacket[]>("SELECT state FROM discord_meetings WHERE id = ? AND guild_id = ? FOR UPDATE", [id, guildId]);
    if (!meetings[0]) fail("Meeting not found.", 404);
    const meeting = meetingStateSchema.parse(parsed(meetings[0].state));
    if (meeting.status !== "scheduled" || !meeting.channelId || !meeting.applicantId) fail("This meeting is not ready for follow-up.");
    if (meeting.workflowStatus === "closed") fail("This submission is closed.");
    if (manuallyStopped(meeting)) fail("Automated follow-up was stopped by a submission manager.");
    const [rows] = await connection.execute<RowDataPacket[]>("SELECT state, revision FROM discord_meeting_outcomes WHERE meeting_id = ? FOR UPDATE", [id]);
    const context: Context = { meeting, outcome: outcomeSchema.parse(parsed(rows[0]?.state) || {}), revision: rows[0]?.revision || null };
    const before = JSON.stringify(context.outcome), originalMeeting = JSON.stringify(meeting);
    await operation(context, connection);
    context.outcome = outcomeSchema.parse(context.outcome);
    if (JSON.stringify(context.outcome) !== before) {
      context.revision = randomUUID();
      await connection.execute(`INSERT INTO discord_meeting_outcomes (meeting_id, revision, state) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE revision = VALUES(revision), state = VALUES(state)`, [id, context.revision, JSON.stringify(context.outcome)]);
      await connection.execute("INSERT INTO discord_meeting_outcome_events (meeting_id, actor_id, event_type, detail) VALUES (?, ?, ?, ?)",
        [id, actorId, kind, JSON.stringify({ status: context.outcome.status, proposalVersion: context.outcome.proposals.at(-1)?.version || 0, followupId: context.outcome.followupId })]);
    }
    if (JSON.stringify(meeting) !== originalMeeting) {
      if (actorId) meeting.lastAction = { actorId, kind, at: Date.now() };
      await connection.execute("UPDATE discord_meetings SET state = ?, revision = ? WHERE id = ? AND guild_id = ?", [JSON.stringify(meeting), randomUUID(), id, guildId]);
    }
    await connection.commit(); return context;
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}
export async function observeMeeting(id: string, guildId: string, qualified: boolean, empty: boolean) {
  return changeOutcome(id, guildId, null, "voice_presence", ({ meeting, outcome }) => {
    if (outcome.status !== "watching") return;
    const now = Date.now();
    if (now < meeting.scheduledAt! - 15 * 60000 || (!outcome.qualifiedAt && now > meeting.scheduledAt! + 24 * 3600000)) return;
    if (qualified && !outcome.qualifiedAt) outcome.qualifiedAt = now;
    if (empty && outcome.qualifiedAt) outcome.emptySince ??= now;
    else if (!empty) delete outcome.emptySince;
    if (empty && outcome.emptySince && now - outcome.emptySince >= 60000) outcome.status = "review";
  });
}
export async function requestMeetingReview(id: string, guildId: string, actorId: string) {
  return changeOutcome(id, guildId, actorId, "meeting_review_requested", ({ meeting, outcome }) => {
    if (Date.now() < meeting.scheduledAt!) fail("The scheduled meeting has not started yet.");
    if (outcome.status === "watching") outcome.status = "review";
  });
}
export async function continueMeeting(id: string, guildId: string, actorId: string) {
  return changeOutcome(id, guildId, actorId, "meeting_not_finished", ({ outcome }) => {
    if (outcome.status !== "review") fail("This meeting is no longer awaiting confirmation.");
    outcome.status = "watching"; outcome.reviewCycle++;
    delete outcome.qualifiedAt; delete outcome.emptySince; delete outcome.reviewMessage;
  });
}
export async function createMeetingProposal(input: { id: string; guildId: string; actorId: string; version: number; summary: string; privateNotes: string; roleIds: string[]; roleNames: string[]; policyRevision: string | null }) {
  return changeOutcome(input.id, input.guildId, input.actorId, "proposal_sent", async ({ meeting, outcome }, connection) => {
    if (!["review", "offered", "countered", "declined"].includes(outcome.status)) fail("This meeting cannot receive a new proposal.");
    const latest = outcome.proposals.at(-1)?.version || 0;
    if (input.version !== latest || latest >= 20) fail("The proposal changed. Review the latest version first.");
    const policy = await onboardingPolicy(input.guildId, connection);
    if (input.roleIds.length !== input.roleNames.length || new Set(input.roleIds).size !== input.roleIds.length) fail("Choose unique approved roles.", 400);
    if (input.roleIds.length && (policy.revision !== input.policyRevision || input.roleIds.some((id) => !policy.roleIds.includes(id)))) fail("Approved onboarding roles changed. Review the role selection again.");
    outcome.privateNotes = input.privateNotes;
    outcome.proposals.push({ version: latest + 1, authorId: input.actorId, at: Date.now(), summary: input.summary,
      privateNotes: input.privateNotes, roleIds: input.roleIds, roleNames: input.roleNames });
    outcome.status = "offered"; outcome.deliveryAttempts = 0; outcome.deliveryPaused = false; delete outcome.deliveryFailure;
    delete outcome.nextDeliveryAt;
    outcome.managerNoticeVersion = 0;
    outcome.grant = { appliedRoleIds: [], attempts: 0, paused: false }; meeting.workflowStatus = "meeting";
  });
}
export async function respondToProposal(input: { id: string; guildId: string; userId: string; version: number; response: "accepted" | "declined" | "countered"; text: string }) {
  return changeOutcome(input.id, input.guildId, input.userId, `proposal_${input.response}`, ({ meeting, outcome }) => {
    if (meeting.applicantId !== input.userId) fail("Only the invited applicant can respond.", 403);
    const proposal = outcome.proposals.at(-1);
    if (!proposal || proposal.version !== input.version || outcome.status !== "offered") fail("This proposal is no longer awaiting a response. Use the latest message.");
    if (input.response === "countered" && !input.text.trim()) fail("Describe what you would like to change.", 400);
    proposal.response = { kind: input.response, userId: input.userId, text: input.text, at: Date.now() };
    outcome.status = input.response; outcome.deliveryAttempts = 0; outcome.deliveryPaused = false; delete outcome.deliveryFailure;
    delete outcome.nextDeliveryAt;
    outcome.managerNoticeVersion = 0;
    if (input.response === "accepted") meeting.workflowStatus = "accepted";
    if (input.response === "declined") meeting.workflowStatus = "rejected";
  });
}
export async function saveOutcomeReceipt(input: { id: string; guildId: string; field: "review" | "proposal" | "notice"; version: number; channelId: string; messageId: string;
  reviewCycle?: number; noticeStatus?: "accepted" | "countered" | "declined" | "onboarded" }) {
  return changeOutcome(input.id, input.guildId, null, "outcome_message_delivered", ({ outcome }) => {
    if (input.field === "review") {
      if (outcome.status !== "review" || outcome.reviewCycle !== input.reviewCycle) fail("Meeting review changed.");
      outcome.reviewMessage = { channelId: input.channelId, messageId: input.messageId };
    } else if (input.field === "notice") {
      if (outcome.status !== input.noticeStatus || outcome.proposals.at(-1)?.version !== input.version) fail("Proposal response changed.");
      outcome.managerNoticeVersion = input.version;
    }
    else {
      const proposal = outcome.proposals.at(-1);
      if (!proposal || proposal.version !== input.version) fail("Proposal changed.");
      proposal.message = { channelId: input.channelId, messageId: input.messageId };
    }
    const delivered = { review: "review", proposal: "proposal", notice: "notification" }[input.field];
    if (!outcome.deliveryFailure || outcome.deliveryFailure === delivered) {
      outcome.deliveryAttempts = 0; delete outcome.deliveryFailure; outcome.deliveryPaused = false; delete outcome.nextDeliveryAt;
    }
  });
}
export async function outcomeDeliveryFailed(id: string, guildId: string, field: "review" | "proposal" | "roles" | "notification") {
  return changeOutcome(id, guildId, null, "outcome_delivery_failed", ({ outcome }) => {
    outcome.deliveryAttempts = Math.min(16, outcome.deliveryAttempts + 1); outcome.deliveryFailure = field;
    outcome.nextDeliveryAt = Date.now() + 120000;
    if (outcome.deliveryAttempts >= 16) outcome.deliveryPaused = true;
  });
}
export async function retryMeetingOutcome(id: string, guildId: string, actorId: string) {
  return changeOutcome(id, guildId, actorId, "outcome_manual_retry", ({ outcome }) => {
    if ((outcome.grant.leaseUntil || 0) > Date.now()) fail("Role assignment is already in progress.");
    outcome.deliveryAttempts = 15; outcome.deliveryPaused = false;
    if (outcome.status === "accepted") { outcome.grant.attempts = 15; outcome.grant.paused = false; outcome.grant.nextAttemptAt = Date.now(); }
    outcome.nextDeliveryAt = Date.now();
  });
}
export async function claimOnboardingRoles(id: string, guildId: string, version: number) {
  const context = await changeOutcome(id, guildId, null, "onboarding_role_attempt", ({ outcome }) => {
    const proposal = outcome.proposals.at(-1), now = Date.now();
    if (!proposal || proposal.version !== version || outcome.status !== "accepted" || proposal.response?.kind !== "accepted") fail("No accepted proposal is awaiting onboarding.");
    if ((outcome.grant.leaseUntil || 0) > now || (outcome.grant.nextAttemptAt || 0) > now) fail("Role assignment is paused, waiting or already in progress.");
    if (outcome.grant.attempts >= 16 && !outcome.grant.paused) {
      outcome.grant.paused = true; outcome.deliveryFailure = "roles";
      delete outcome.grant.leaseToken; delete outcome.grant.leaseUntil; return;
    }
    if (outcome.grant.paused) fail("Role assignment is paused, waiting or already in progress.");
    outcome.grant.attempts++; outcome.grant.leaseToken = randomUUID(); outcome.grant.leaseUntil = now + 120000; outcome.grant.nextAttemptAt = now + 120000;
  });
  return context;
}
export async function acknowledgeOnboardingRoles(input: { id: string; guildId: string; version: number; leaseToken: string; appliedRoleIds: string[]; failed: boolean }) {
  return changeOutcome(input.id, input.guildId, null, input.failed ? "onboarding_roles_failed" : "onboarding_roles_applied", ({ outcome }) => {
    const proposal = outcome.proposals.at(-1);
    if (outcome.status !== "accepted" || proposal?.version !== input.version || outcome.grant.leaseToken !== input.leaseToken || (outcome.grant.leaseUntil || 0) <= Date.now()) fail("Role assignment changed or its lease expired.");
    if (input.appliedRoleIds.some((id) => !proposal.roleIds.includes(id))) fail("An unapproved role was returned.", 400);
    outcome.grant.appliedRoleIds = Array.from(new Set([...outcome.grant.appliedRoleIds, ...input.appliedRoleIds]));
    delete outcome.grant.leaseToken; delete outcome.grant.leaseUntil;
    if (input.failed) { outcome.deliveryFailure = "roles"; outcome.grant.paused = outcome.grant.attempts >= 16; }
    else if (proposal.roleIds.every((id) => outcome.grant.appliedRoleIds.includes(id))) { outcome.status = "onboarded"; outcome.managerNoticeVersion = 0; delete outcome.deliveryFailure; }
  });
}
export async function createFollowupMeeting(input: { id: string; guildId: string; actorId: string; departments: string[]; managerIds: string[]; privateNotes: string }) {
  return changeOutcome(input.id, input.guildId, input.actorId, "followup_meeting_requested", async ({ meeting, outcome }, connection) => {
    if (outcome.followupId) return;
    if (!["review", "offered", "countered", "declined"].includes(outcome.status)) fail("This meeting cannot be followed up yet.");
    await connection.execute("SELECT id FROM discord_meetings WHERE public_reference = ? AND round_number = 1 FOR UPDATE", [meeting.reference]);
    const [rounds] = await connection.execute<RowDataPacket[]>("SELECT id, round_number FROM discord_meetings WHERE public_reference = ? ORDER BY round_number DESC LIMIT 1", [meeting.reference]);
    if (rounds[0]?.id !== meeting.id || rounds[0].round_number >= 100) fail("A newer meeting already exists for this submission.");
    const managerIds = Array.from(new Set(input.managerIds)).filter((id) => id !== meeting.applicantId);
    if (!managerIds.length) fail("The selected departments have no available managers.", 400);
    const start = Math.ceil((Date.now() + 7200000) / slotLength) * slotLength;
    const child = meetingStateSchema.parse({ ...meeting, id: randomBytes(12).toString("hex"), roundNumber: rounds[0].round_number + 1,
      parentMeetingId: meeting.id, departments: input.departments, windowStart: start, windowEnd: start + 14 * 86400000,
      participants: [...managerIds.map((userId) => ({ userId, kind: "manager", slots: [], responded: false })),
        { userId: meeting.applicantId, kind: "applicant", slots: [], responded: false }],
      status: "pending", workflowStatus: "new", attempts: 0, automaticRetries: 0, retryPaused: false, manualRetryRequested: false,
      failureReason: null, channelId: null, scheduledAt: null, attendeeIds: [], announcementId: null, completed: false,
      lastAction: { actorId: input.actorId, kind: "followup_created", at: Date.now() } });
    await connection.execute("INSERT INTO discord_meetings (id, public_reference, guild_id, revision, state, round_number, parent_meeting_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [child.id, child.reference, child.guildId, randomUUID(), JSON.stringify(child), child.roundNumber, meeting.id]);
    outcome.followupId = child.id; outcome.privateNotes = input.privateNotes; outcome.status = "followup"; meeting.workflowStatus = "reviewing";
  });
}
export async function outcomeHistory(id: string) {
  const [rows] = await getDbPool().execute<RowDataPacket[]>("SELECT actor_id, event_type, created_at, detail FROM discord_meeting_outcome_events WHERE meeting_id = ? ORDER BY id DESC LIMIT 25", [id]);
  return rows.map((row) => ({ actorId: row.actor_id, kind: row.event_type, at: new Date(row.created_at).toISOString(), detail: parsed(row.detail) }));
}
