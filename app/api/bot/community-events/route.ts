import { z } from "zod";
import { authorizeBot, meetingJson, readMeetingJson } from "@/lib/meeting-api";
import { eventIdSchema, eventSettingsSchema, registrationStatusSchema } from "@/lib/community-contract";
import { safeCommunityFailure } from "@/lib/community-security";
import { acknowledgeCommunityNotification, adminCommunityEvents, claimCommunityNotifications, configureCommunityEvent, listPreShowRegistrations, preShowDetail, retryCommunityNotification, selectPreShow } from "@/lib/community-events";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reference = z.string().regex(/^XEN-EVT-[A-Z0-9]{6}$/), id = z.string().regex(/^\d{17,20}$/);
const staff = { actorId: id, access: z.literal(true) };
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list"), ...staff }).strict(),
  z.object({ action: z.literal("configure"), ...staff, eventId: eventIdSchema, revision: z.string().uuid(), settings: eventSettingsSchema }).strict(),
  z.object({ action: z.literal("registrations"), ...staff, status: registrationStatusSchema.nullable().default(null), before: z.number().int().positive().nullable().default(null) }).strict(),
  z.object({ action: z.literal("detail"), ...staff, reference }).strict(),
  z.object({ action: z.literal("select"), ...staff, reference, revision: z.string().uuid(), status: registrationStatusSchema }).strict(),
  z.object({ action: z.literal("retry"), ...staff, reference }).strict(),
  z.object({ action: z.literal("deliveries") }).strict(),
  z.object({ action: z.literal("receipt"), reference, leaseToken: z.string().uuid(), deliveredUserIds: z.array(id).max(250), complete: z.boolean(), release: z.boolean() }).strict(),
]);
export async function POST(request: Request) {
  if (!authorizeBot(request)) return meetingJson({ error: "Unauthorized" }, 401);
  let parsed;
  try { parsed = schema.safeParse(await readMeetingJson(request, 32000)); } catch { return meetingJson({ error: "Invalid community management request." }, 400); }
  if (!parsed.success) return meetingJson({ error: "Check the event fields, status and reference. Related links must be public HTTPS URLs without credentials or query strings." }, 400);
  const input = parsed.data;
  try {
    switch (input.action) {
      case "list": return meetingJson(await adminCommunityEvents());
      case "configure": return meetingJson(await configureCommunityEvent(input.eventId, input.revision, input.settings, input.actorId));
      case "registrations": return meetingJson(await listPreShowRegistrations(input.status, input.before));
      case "detail": return meetingJson(await preShowDetail(input.reference));
      case "select": return meetingJson(await selectPreShow(input.reference, input.revision, input.status, input.actorId));
      case "retry": return meetingJson(await retryCommunityNotification(input.reference, input.actorId));
      case "deliveries": return meetingJson(await claimCommunityNotifications());
      case "receipt": return meetingJson(await acknowledgeCommunityNotification(input));
    }
  } catch (error) { const failure = safeCommunityFailure(error); return meetingJson({ error: failure.error }, failure.status); }
}
