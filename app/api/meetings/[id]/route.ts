import { z } from "zod";
import { meetingJson as json, readMeetingJson } from "@/lib/meeting-api";
import { discordId, meetingId } from "@/lib/meeting-contract";
import { getMeeting, saveAvailability, validParticipantToken } from "@/lib/meetings";
export const runtime = "nodejs";
const credentials = z.object({ userId: discordId, token: z.string().regex(/^[a-f0-9]{64}$/) });
const schema = z.union([credentials.extend({ action: z.literal("read") }).strict(), credentials.extend({
  slots: z.array(z.number().int().positive()).max(672),
  timezone: z.string().max(100).refine((value) => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }),
}).strict()]);
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim()
    || request.headers.get("host") || new URL(request.url).host;
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim().toLowerCase();
  try {
    const url = origin ? new URL(origin) : null;
    // Hostinger terminates HTTPS before forwarding to Next's internal HTTP URL.
    if (request.headers.get("sec-fetch-site") === "cross-site" || (url && (
      !["https:", "http:"].includes(url.protocol) || url.host.toLowerCase() !== host.toLowerCase()
      || url.username || url.password || url.pathname !== "/" || url.search || url.hash
      || (protocol && url.protocol !== `${protocol}:`)
    ))) return json({ error: "Invalid request origin" }, 403);
  } catch { return json({ error: "Invalid request origin" }, 403); }
  let body;
  try { body = schema.safeParse(await readMeetingJson(request, 32_000)); } catch { return json({ error: "Invalid availability" }, 400); }
  if (!meetingId.safeParse(id).success || !body.success || !validParticipantToken(id, body.data.userId, body.data.token)) return json({ error: "This private invitation is invalid" }, 403);
  try {
    if ("action" in body.data) {
      const current = await getMeeting(id);
      const person = current?.state.participants.find((row) => row.userId === body.data.userId);
      if (!current || !person) return json({ error: "Invitation not found" }, 404);
      const state = current.state;
      return json({ view: { initialSlots: person.slots, initialTimezone: person.timezone, initialResponded: person.responded,
        windowStart: state.windowStart, windowEnd: state.windowEnd, serverNow: current.serverNow, status: state.status,
        scheduledAt: state.scheduledAt, reference: state.reference, attending: state.status === "scheduled" ? state.attendeeIds.includes(person.userId) : undefined,
        proposedSlots: person.kind === "manager" ? state.participants.find((row) => row.kind === "applicant")?.slots || [] : undefined,
        channelUrl: state.channelId && state.attendeeIds.includes(person.userId) ? `https://discord.com/channels/${state.guildId}/${state.channelId}` : null } });
    }
    const result = await saveAvailability(id, body.data.userId, body.data.slots, body.data.timezone);
    if (result === "saved") return json({ success: true });
    const errors = { missing: "Invitation not found", closed: "This meeting is booked or the invitation has expired", invalid: "Some selected times have passed. Refresh and choose future times", conflict: "Availability changed while saving. Please try again" };
    return json({ error: errors[result] }, result === "missing" ? 404 : result === "invalid" ? 400 : 409);
  } catch (error) { console.error("Could not save meeting availability", error); return json({ error: "Availability could not be saved. Please try again shortly" }, 503); }
}
