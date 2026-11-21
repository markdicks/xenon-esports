# Discord meeting archives

Deploy the website before the bot. No additional database, migration, secret or
environment variable is needed. The existing MySQL meeting JSON stores lifecycle
state and message receipts; migration 009's history trigger records staff actions.
The bot uses the authenticated `/api/bot/meeting-lifecycle` endpoint only.

Channel names use `nickname-meet-abcde-v1-scheduled`, then `-prop` when a proposal
exists, `-comp` when completed or continued in a follow-up, or `-cancelled` after
confirmed cancellation. `abcde` is the last five characters of the meeting ID.
Follow-ups keep separate channels and increment the existing meeting round to v2,
v3, etc. Earlier round chats and proposals remain intact.

Every accepted proposal is copied into its original meeting chat with its version,
terms, proposed roles, respondent and time. Other proposal responses are retained
too. Private staff notes are never copied. Reconciliation also backfills existing
channels and old proposal responses, including meetings older than 24 hours.

The bot automatically creates **Meeting Archives**, then numbered categories when
a category reaches Discord's 50-channel limit. Categories deny public visibility.
Moving a VC preserves its original participant access and chat history; category
permissions are not synced. Archived VCs deny new voice connections. Occupied VCs
wait until empty before moving. Existing chat messages are never deleted.

Use `/cancelmeeting reason:...` **inside the meeting VC's text chat**. A responsible
staff member or server administrator can request cancellation. Another responsible
staff member/admin must confirm within ten minutes; for a two-person meeting, the
other participant confirms. The requester cannot confirm their own request. Both
memberships and the requester's staff access are checked again on confirmation.
Expired requests, old buttons, and approvals for another channel are rejected.
Meetings remain booked until confirmation; confirmed cancellation releases the
reserved time and stops invitations, reminders, proposals and onboarding actions.
Already accepted/onboarded meetings cannot be cancelled through this command.

Internal meetings receive a **Complete meeting** button for responsible staff after
the start time. Applicant meetings retain their existing review/proposal flow.

Failed DMs and departed participants raise deduplicated alerts mentioning the
affected member and responsible staff in the meeting chat and the configured
private Staff chat. Before a meeting exists, failed delivery checks alert the
Staff chat and still prevent creation. Discord cannot deliver an actual ping to
someone who has already left the server; the record tells staff to contact them.

The bot needs Manage Channels, Manage Roles for channel overwrites, View Channel,
Send Messages, Embed Links and Read Message History. Keep the existing configured
Staff channel and role accessible. Inspect bot runtime warnings if channel changes
or alerts cannot be delivered; failed actions retry without erasing history.

Existing channels update automatically after both deployments. A batch of 25
meetings is reconciled every 30 seconds, including historical channels. The local
test suite uses Discord mocks and never creates test meetings in production.
