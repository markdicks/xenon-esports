# Discord submission delivery

The bot polls the website's protected `/api/bot/submissions` endpoint every 30
seconds. Staff applications and short interest notifications are privately sent
to members with **Founder** or **Head of Operations** in the configured server.
Contact enquiries go to members with **Help**. Interest notifications contain
only the reference, Discord username, selected interests and availability. They
never include email, portfolio links or long-form answers. Applicant text cannot
trigger Discord mentions.

## Setup

1. Run `sql/002_discord_deliveries.sql`, `sql/003_discord_role_links.sql`,
   `sql/005_interest_submissions.sql`, and `sql/006_discord_submission_routes.sql`
   once against the existing Hostinger database, after `sql/001_initial.sql`.
   Existing submissions are marked as historical so enabling the integration
   does not send old personal data. Role links persist manual Discord role
   selections made in the bot dashboard.
2. Set `WEBSITE_BOT_TOKEN` on the website to a strong randomly generated secret.
3. In the bot service, set the same `WEBSITE_BOT_TOKEN`, `WEBSITE_URL` to the
   website's HTTPS origin, and `DISCORD_GUILD_ID` to the intended Xenon server ID.
   These are server-side variables, never `NEXT_PUBLIC_` variables. The bot does
   not need the website's MySQL credentials.
4. Enable Server Members Intent for the bot. Give it Manage Roles and place its
   role above the Xenon roles. Assign Founder / Head of Operations / Help to the
   recipients in the bot dashboard. Missing roles are created when assigned,
   with no extra Discord permissions.
5. Recipients must allow direct messages from server members. Submit one new
   application, interest form and contact enquiry, then verify the DMs and
   delivery activity in the bot logs. The website returns each reference inline.
6. In the bot's Roles view, open Website notifications to choose one or more
   recipient roles for staff applications, general interest, and each contact
   category. New installs retain Founder / Head of Operations and Help defaults
   until custom routes are saved.

## Delivery behavior

The existing MySQL submissions are the source of truth. Website form submission
does not wait for Discord and continues working when the bot is offline. Only
requests authenticated with the shared token can read pending submissions or
acknowledge delivery. No applicant data is exposed to the browser dashboard.

Delivery receipts are stored in MySQL per public reference and recipient.
Failed DMs and missing recipients retry with backoff from one minute up to one
hour. Successful recipients are skipped on retries, including after a bot
restart. Ten-minute leases protect against overlapping polls. If the bot crashes
after sending a DM but before saving its receipt, that DM can be sent again;
delivery is at least once, not exactly once. No recipients means the submission
stays pending until the relevant roles are assigned. Completed submissions are
not sent to members added to a role later.

Bot logs identify the public reference, recipient ID and Discord error code,
without logging form contents or secrets. A 503 from the website usually means
the migration is missing or its database is unavailable. A 401 means the shared
tokens are missing or different. Public form validation and honeypot behavior
remain the same; honeypot submissions never enter the database or Discord queue.

## Pillar Management Storage

The bot dashboard's Discord-login and scoped-pillar rework additionally requires
`sql/007_discord_management.sql`. The protected `/api/bot/management` endpoint
reuses `WEBSITE_BOT_TOKEN` and the existing MySQL pool. It stores six pillar
scopes, bot-owned subroles and pending-creation reservations with revision-based
compare-and-swap updates. No MySQL settings or public website forms change.
Configure Discord OAuth and administrator role IDs in the bot service; never
put OAuth secrets or the bot integration token in `NEXT_PUBLIC_` variables.
Existing five-pillar records load with Staff unassigned and retain all saved
role, category and channel restrictions. No extra SQL migration is required.
The configuration also records prior lead-role channel overwrite values and
pending permission syncs. Saving access in the bot grants the selected ordinary
channel permissions to the linked lead role; removing access restores only
dashboard-managed changes. Deploy the website API before the matching bot fix,
then resave existing pillar access to apply previously stored ceilings.

Per-area mod/custom permission settings and shared categories are supported by
the JSON schema. Deploy this website schema before the updated bot; there is no
additional pillar SQL migration. Revoking one pillar preserves other heads'
access to a shared category.

## Automatic Meeting Availability

Apply `sql/008_discord_meetings.sql` before enabling the bot's
`WEBSITE_MEETINGS_CATEGORY_ID`. Bookings reuse the existing pool and internal
`WEBSITE_BOT_TOKEN`; no new public credentials or MySQL settings are required.
Contact submissions now require a Discord username or user ID, as staff and
interest forms already did. Successful form inserts remain independent of bot
availability.

The bot selects managers through the same per-form/per-contact-category routing,
then creates a durable, idempotent booking through `/api/bot/meetings`. Participants
receive signed private `/meet/<id>` links. Availability POSTs validate the signature,
participant, timezone, future 30-minute slots and the 14-day booking window.
Past selections and slots inside the existing two-hour notice period are ignored.
A positive availability response must retain at least three distinct future slots;
duplicates do not count. An explicit No suitable times response still records
unavailability, but stale-only input is rejected rather than becoming that response.
The form updates its clock while open, counts only bookable selections and uses
the server's returned filtered slots after saving. No migration or new environment
variables are required.
Managers see the applicant's proposed slots, but never other managers' calendars,
emails or form answers. Manager invitations are sent after the applicant selects
times, and include those proposed times using Discord's local-time display.

The private booking API validates the browser origin against the forwarded
public host (or Host header), not Next's internal proxy URL. Forwarded protocols
are checked when supplied, and cross-site requests remain blocked. Signed
participant tokens are still required for both reads and availability saves.

Booking messages use Discord link buttons rather than printing private URLs.
Optional button-version metadata in existing message records lets the bot
upgrade pending invitations in place. Deploy this website schema before the
matching bot update; no new SQL migration or environment variables are needed.

Applicant invitation delivery permits one initial attempt and up to 15 automatic
retries. Exhausted invitations are excluded from automatic claims. Administrators
can queue one manual attempt from the bot's Roles > Meeting invitations section;
a failed manual attempt remains paused instead of opening another automatic
cycle. Retry metadata is backwards compatible in the existing JSON document.
The protected paused-list view never leases deliveries and returns references
and safe diagnostics only. Manual retries use revision-based compare-and-swap
without clearing existing leases. No database migration is required.

## Admin Portal Rework

### Post-Meeting Outcomes

Migration `010_meeting_outcomes.sql` adds private, versioned meeting outcomes and
an administrator-approved onboarding-role policy. Follow-up meetings receive
numbered rows under the same submission reference while retaining the original
meeting/channel. The authenticated `/api/bot/meeting-followup` endpoint supports
voice-presence confirmation, proposals, applicant responses, delivery receipts,
role-assignment leases and follow-up creation. Public availability responses never
contain private staff notes. Department-scoped inbox access requires a current
selected-department role and membership in that meeting's manager cohort.

Apply 010 before deploying the matching bot. Existing form inserts and basic
availability work independently of outcome processing; migration 010 is not
automatically executed by the application. See the bot repository's
`docs/post-meeting-onboarding.md` for deployment and live smoke-test steps.

The full meeting portal requires `sql/009_meeting_portal.sql` after migration 008.
It adds per-user weekly staff availability and an audit table with atomic MySQL
triggers. Deploy this website before the matching bot. The database user must be
able to create triggers. Earlier actions are represented by an imported starting
state, not fabricated history. Existing MySQL configuration is unchanged.

The bot supplies freshly verified role scopes to `/api/bot/meeting-portal` using
the existing internal bearer secret. Owners and administrators default to their
assigned notification-role categories; a server-checked View all toggle is explicit.
All details, history and writes are scoped, not only the list. The old global retry
view is retired. The portal supports status changes, closure, resends, reopening,
delivery counts, 1/2/4-week flags and mismatch warnings.

Private availability links now intentionally share submitted times among the
participants of that application. They never expose another application's answers
or a staff member's entire weekly pattern. Recurring profiles are editable only
through the signed-in bot portal. Standing times apply to unscheduled meetings;
per-meeting overrides are preserved and profile edits invalidate stale booking
snapshots. See the bot's `docs/admin-meeting-portal.md` for full behavior.

After migrating, enable `WEBSITE_MEETING_BACKFILL_ENABLED=true` on the bot to
process historical applications, interests and contacts without existing meetings.
This flag defaults off so deployment does not unexpectedly initiate bulk DMs.
The catch-up reads minimal routing fields, retains original submission records,
opens a fresh booking window and never replays full personal-data notifications.

Every manager must respond, and the applicant plus two-thirds of all invited
managers must match a future slot. The bot creates a private voice channel and
posts meeting instructions, conduct and confidentiality rules in its chat.
Failed applicant DMs notify all routed managers; automatic retries update those
notices, then delete them after recovery. See the bot's
`docs/meeting-bookings.md` for setup, retry behavior and operational limitations.
