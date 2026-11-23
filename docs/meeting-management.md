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
