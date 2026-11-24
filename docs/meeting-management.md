# Meeting participants, deletion and private logs

Deploy the website before the bot. This extends the existing meeting JSON and
existing MySQL database; no migration, new secret or remote MySQL access is needed.

In **Meetings & submissions**, open a meeting and choose **Add participants**.
Select existing configured staff roles, individual current Discord members, or
both. Role selections expand to current human members, existing participants are
deduplicated, and the total remains at most 101. Bots and departed members cannot
be invited. The bot checks current membership and roles again when saving.

Only roles already represented by the responsible staff cohort, or the actual
Discord server owner, may add participants. Neither a configured dashboard admin
role nor native Administrator permission bypasses this rule. The original staff
role IDs are retained with the meeting. New invitees are separate guest
participants: inviting someone does not give them staff or onboarding authority.

Booked meetings keep their existing time. Added people receive a booking DM and
private access to that meeting VC and its chat. The bot posts a short addition
notice there. Conflicting booked commitments are rejected. For unbooked meetings,
new people submit availability through their own signed links; they must match the
chosen slot, while the original staff quorum remains unchanged. Closed, cancelled,
completed and deleting meetings cannot receive participants.

**Pillars** appears only for the actual Discord server owner. Its HTTP endpoints
also enforce ownership. Ordinary accounts default to their own availability view.
Owner identity comes from the guild's owner ID, never a username or a role name.

Closed meeting rows show just **Closed**, **Completed** or **Cancelled**, as
appropriate. Old delivery, retry, overdue, confirmation and round tags are hidden.
Historical records are preserved for reference.

The owner can right-click a meeting, or open its actions button, and select
**Delete meeting**. The confirmation names the target and explains the cleanup.
Deletion hides that one round immediately and stops further meeting automation.
A durable job removes its meeting VC and identified bot messages in DMs and log
channels. Cleanup uses exact round IDs/markers and bot authorship; it preserves
other rounds, other meetings, user-authored DMs and the original submission.
Failed Discord cleanup remains queued and retries after restarts. A hidden
database record and deletion audit remain so cleanup cannot be lost midway.
Older delivery-check DMs without meeting markers/receipts cannot be safely tied to
one request and are left untouched; new checks include an attributable marker.

The bot automatically creates a text channel named **meeting-logs** with explicit
permissions, outside any public category. Everyone is denied View Channel. The bot,
configured leadership and Staff roles can view it; the server owner/administrators
retain Discord's normal privileged access. The bot reconciles its managed channel
overwrites, removing unrelated grants. Normal invitations and confirmations stay
in DMs. Delivery failures (including closed DMs), missing members, processing and
cleanup errors appear in private meeting logs, and in the meeting chat when one
exists. Logs never include API keys, tokens, raw SQL or private staff notes.

`WEBSITE_MEETING_LOG_CHANNEL_ID` is an optional dedicated-channel override. Leave
it blank for automatic creation. Do not point it at a general community channel:
the bot manages the chosen channel's private permissions. Keep Manage Channels,
Manage Roles for overwrites, View Channel, Send Messages, Embed Links and Read
Message History available to the bot.

Automated tests and the local disposable demo verify permissions and UI flows.
Never delete real meetings or send production test DMs solely for validation.

## Staff rescheduling

Open an active booked meeting and choose **Reschedule meeting**. Responsible staff
roles already managing that meeting, and the actual server owner, can do this.
Applicants, guests and unrelated administrators cannot reschedule it. Staff choose
the new time directly and can select additional staff roles and individuals in the
same atomic action. Current booked attendees remain included; new people are guests
and gain no management authority. The channel, reference, round and history remain.

The comparison lists existing participants and newly selected people by Discord
nickname, with daily available ranges and their status at the proposed time. Its
week grid uses **SAST (UTC+02:00)**; the date/time input explicitly shows the staff
browser's timezone. Explicit meeting replies take priority inside their original
14-day window. Other dates use the saved recurring/per-week availability. Missing
weeks remain **Not provided**, distinct from **Unavailable**. Other booked Xenon
commitments are shown as busy and always prevent a conflicting booking. Staff must
refresh the comparison after changing people, review it and explicitly confirm.
Role expansion is checked again at confirmation so changed membership cannot add
people who were absent from the comparison.

New times use 30-minute slots, at least two hours' notice and at most 90 days ahead.
Closed/cancelled meetings, pending cancellations, and meetings with attendance,
review or proposal activity cannot be rescheduled; use the existing follow-up flow.
The database booking lock and revision checks prevent concurrent bookings or partial
participant additions. Active notification leases briefly block rescheduling.

Rescheduling queues persistent cleanup of old booking/reminder DMs for that meeting
and old time, checking bot authorship and meeting markers. Other meetings and user
messages remain untouched. Each person's old notices are removed before a new
**Xenon meeting rescheduled** DM is sent with the old/new time and existing join
link. The channel's announcement is updated and a reschedule record is posted in
its chat. New participants get private access. Discord failures raise private staff
alerts and remain retryable across restarts. A second reschedule waits for the first
notification job to finish. Reminder state is reset and stale reminder leases cannot
send an old-time reminder. Follow-up rounds start without inherited reschedule state.

This extends the existing JSON state and authenticated website API. No new
database, migration, secret or environment variable is required. Deploy the
website before the bot.

## Owner availability controls

On an open, unbooked meeting, the Discord server owner can choose **Manage
availability** for any participant. **Enter times** saves one or more confirmed
30-minute slots within the current 14-day window, with at least two hours' notice.
These times are labelled as owner-entered. A participant's own response replaces
that entry. Their recurring or per-week profile is not changed.

**Ignore their times; keep them attending** bypasses that person's availability
constraints and unanswered response, but includes them in the booking and its
Discord notifications. Existing booked Xenon meetings still count as busy, including
for ignored staff. **Use their saved availability again** removes the ignore and
restores the saved constraints. Saving a personal response does not silently clear
an owner ignore. New windows and follow-up rounds do not inherit these overrides.

The bot checks current server ownership, and the authenticated website endpoint
checks the owner attestation, participant, revision, window, booking lock and active
lease before saving. Existing history records owner actions and participant
snapshots. Closed/booked meetings cannot be changed here; use **Reschedule meeting**
for a booked time. The existing MySQL JSON state stores the change. No migration
or environment change is needed. Old workers cannot claim meetings with overrides
during deployment; deploy the website before the bot.

Private invitation pages include the recipient in the shared roster with a **You**
label and stable numbered markers. Owner entries and ignored times are disclosed.

For an immediate booking, the owner can instead choose **Set exact time · owner
override** on any active meeting. This books every participant at a future time
within 90 days, bypassing availability, missing replies, quorum, clashes and the
normal two-hour notice. It works before the first booking and for an existing
booking. Existing bookings retain their channel and use the reschedule DM cleanup
and replacement flow. Closed meetings, stale edits, active worker leases and
post-meeting activity remain protected. The action is recorded in meeting history.
