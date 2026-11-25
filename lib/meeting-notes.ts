import { randomUUID } from "node:crypto";
import type { RowDataPacket, PoolConnection } from "mysql2/promise";
import { z } from "zod";
import { getDbPool } from "@/lib/db";
import { meetingStateSchema } from "@/lib/meeting-contract";

export const meetingNotesTable = `CREATE TABLE IF NOT EXISTS discord_meeting_notes (
  meeting_id CHAR(24) NOT NULL, guild_id VARCHAR(20) NOT NULL, user_id VARCHAR(20) NOT NULL,
  revision CHAR(36) NOT NULL, state JSON NOT NULL, reminder_at DATETIME(3) NULL,
  lease_token CHAR(36) NULL, leased_until DATETIME(3) NULL,
  PRIMARY KEY (meeting_id, user_id), KEY note_reminders (guild_id, reminder_at, leased_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
const receipt = z.object({ channelId: z.string().regex(/^\d{17,20}$/), messageId: z.string().regex(/^\d{17,20}$/) }).strict();
export const meetingNoteSchema = z.object({ text: z.string().max(4000), authorName: z.string().min(1).max(120),
  savedAt: z.number().int().positive().nullable(), openedAt: z.number().int().positive(),
  reminderAt: z.number().int().positive().nullable(), reminderSentAt: z.number().int().positive().nullable(),
  attempts: z.number().int().min(0).max(5), deliveryFailure: z.enum(["dm-blocked", "member-left", "retrying", "unavailable"]).nullable(),
  receipt: receipt.nullable() }).strict();
type Note = z.infer<typeof meetingNoteSchema>;
type Identity = { id: string; guildId: string; actorId: string };
const parsed = (value: unknown) => typeof value === "string" ? JSON.parse(value) : value;
function fail(message: string, status = 409): never { throw Object.assign(new Error(message), { status }); }
let initialization: Promise<void> | undefined;
async function ensureTable() {
  initialization ??= (async () => {
    try { await getDbPool().execute("SELECT meeting_id FROM discord_meeting_notes LIMIT 0"); }
    catch (error) { if ((error as { code?: string }).code !== "ER_NO_SUCH_TABLE") throw error; await getDbPool().execute(meetingNotesTable); }
  })().catch((error) => { initialization = undefined; throw error; });
  await initialization;
}
export async function meetingNoteList(id: string, guildId: string) {
  await ensureTable();
  const [rows] = await getDbPool().execute<RowDataPacket[]>("SELECT user_id, state FROM discord_meeting_notes WHERE meeting_id = ? AND guild_id = ? ORDER BY user_id", [id, guildId]);
  return rows.map((row) => ({ userId: String(row.user_id), ...meetingNoteSchema.parse(parsed(row.state)) }))
    .filter((note) => note.savedAt && note.text).map(({ userId, text, authorName, savedAt, deliveryFailure }) => ({ userId, text, authorName, savedAt, deliveryFailure }));
}
export async function meetingNoteJobs(guildId: string) {
  await ensureTable();
  const [rows] = await getDbPool().execute<RowDataPacket[]>(`SELECT notes.meeting_id, notes.user_id FROM discord_meeting_notes AS notes
    JOIN discord_meetings AS meeting ON CONVERT(meeting.id USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(notes.meeting_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND CONVERT(meeting.guild_id USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(notes.guild_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
    WHERE notes.guild_id = ? AND notes.reminder_at <= NOW(3) AND (notes.leased_until IS NULL OR notes.leased_until < NOW(3))
    AND JSON_EXTRACT(meeting.state, '$.deletion') IS NULL ORDER BY notes.reminder_at LIMIT 20`, [guildId]);
  return { jobs: rows.map((row) => ({ id: String(row.meeting_id), actorId: String(row.user_id) })) };
}
export async function noteDeletionContext(id: string, guildId: string) {
  let rows: RowDataPacket[];
  try { [rows] = await getDbPool().execute<RowDataPacket[]>("SELECT user_id, state, leased_until FROM discord_meeting_notes WHERE meeting_id = ? AND guild_id = ?", [id, guildId]); }
  catch (error) { if ((error as { code?: string }).code === "ER_NO_SUCH_TABLE") return { authors: [], receipts: [] }; throw error; }
  if (rows.some((row) => row.leased_until && new Date(row.leased_until).getTime() > Date.now())) fail("A notes delivery is finishing. Meeting cleanup will retry shortly.");
  return { authors: rows.map((row) => String(row.user_id)), receipts: rows.map((row) => meetingNoteSchema.parse(parsed(row.state)).receipt).filter((value) => value !== null) };
}
export async function deleteMeetingNotes(connection: PoolConnection, id: string, guildId: string) {
  try { await connection.execute("DELETE FROM discord_meeting_notes WHERE meeting_id = ? AND guild_id = ?", [id, guildId]); }
  catch (error) { if ((error as { code?: string }).code !== "ER_NO_SUCH_TABLE") throw error; }
}
type Action = "open" | "save" | "claim" | "prepare" | "sent" | "failed";
type Input = Identity & { action: Action; authorName?: string; text?: string; revision?: string; leaseToken?: string;
  receipt?: z.infer<typeof receipt>; failure?: "dm-blocked" | "member-left" | "retrying" | "unavailable" };
export async function changeMeetingNote(input: Input) {
  await ensureTable(); const c = await getDbPool().getConnection();
  try {
    await c.beginTransaction();
    const [meetings] = await c.execute<RowDataPacket[]>("SELECT state FROM discord_meetings WHERE id = ? AND guild_id = ? FOR UPDATE", [input.id, input.guildId]);
    if (!meetings[0]) fail("Meeting not found.", 404);
    const meeting = meetingStateSchema.parse(parsed(meetings[0].state));
    if (meeting.deletion) fail("This meeting was deleted.", 404);
    const [rows] = await c.execute<RowDataPacket[]>("SELECT revision, state, lease_token, leased_until FROM discord_meeting_notes WHERE meeting_id = ? AND guild_id = ? AND user_id = ? FOR UPDATE", [input.id, input.guildId, input.actorId]);
    const row = rows[0], time = Date.now();
    let revision = row?.revision as string | undefined;
    const note: Note = row ? meetingNoteSchema.parse(parsed(row.state)) : { text: "", authorName: input.authorName || "Member", savedAt: null, openedAt: time,
      reminderAt: null, reminderSentAt: null, attempts: 0, deliveryFailure: null, receipt: null };
    let leaseToken: string | null = row?.lease_token || null, leaseUntil: Date | null = row?.leased_until ? new Date(row.leased_until) : null;
    const delivering = leaseToken && leaseUntil && leaseUntil.getTime() > time;
    if (input.action === "open") {
      // Reopening cancels this reminder, including an already claimed job.
      revision = randomUUID(); note.openedAt = time; note.reminderAt = null; leaseToken = null; leaseUntil = null;
    } else if (input.action === "save") {
      if (!row || revision !== input.revision) fail("Your notes changed in another editor. Reopen them before saving.");
      revision = randomUUID(); note.text = input.text!.trim(); note.authorName = input.authorName!; note.savedAt = time;
      note.reminderAt = note.text ? time + 10 * 60000 : null; note.reminderSentAt = null;
      note.deliveryFailure = null; note.attempts = 0; leaseToken = null; leaseUntil = null;
    } else if (input.action === "claim") {
      if (!row || !note.reminderAt || note.reminderAt > time || delivering) fail("This notes reminder is no longer due.");
      leaseToken = randomUUID(); leaseUntil = new Date(time + 120000); note.attempts = Math.min(5, note.attempts + 1);
    } else {
      if (!row || revision !== input.revision || leaseToken !== input.leaseToken || !delivering || !note.reminderAt || note.reminderAt > time) {
        await c.commit(); return { current: false };
      }
      if (input.action === "sent") { note.receipt = input.receipt!; note.reminderSentAt = time; note.reminderAt = null; note.deliveryFailure = null; leaseToken = null; leaseUntil = null; }
      if (input.action === "failed") {
        note.deliveryFailure = input.failure!; note.reminderAt = input.failure === "retrying" && note.attempts < 5 ? time + 60000 : null;
        if (!note.reminderAt && input.failure === "retrying") note.deliveryFailure = "unavailable";
        leaseToken = null; leaseUntil = null;
      }
    }
    meetingNoteSchema.parse(note);
    if (!revision) fail("Meeting notes not found.", 404);
    await c.execute(`INSERT INTO discord_meeting_notes (meeting_id, guild_id, user_id, revision, state, reminder_at, lease_token, leased_until)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE revision = VALUES(revision), state = VALUES(state), reminder_at = VALUES(reminder_at), lease_token = VALUES(lease_token), leased_until = VALUES(leased_until)`,
    [input.id, input.guildId, input.actorId, revision, JSON.stringify(note), note.reminderAt ? new Date(note.reminderAt) : null, leaseToken, leaseUntil]);
    await c.commit();
    return { current: true, note, revision, leaseToken, meeting: { id: meeting.id, reference: meeting.reference, roundNumber: meeting.roundNumber, channelId: meeting.channelId, guildId: meeting.guildId } };
  } catch (error) { await c.rollback(); throw error; } finally { c.release(); }
}
