# Discord submission delivery

The bot polls the website's protected `/api/bot/submissions` endpoint every 30
seconds. Staff applications are privately sent to members with **Founder** or
**Head of Operations** in the configured server. Contact enquiries go to members
with **Help**. A member holding both application roles receives one message.
All submitted fields are included in a UTF-8 text attachment with the public
reference. Applicant text cannot trigger Discord mentions.

## Setup

1. Run `sql/002_discord_deliveries.sql` and `sql/003_discord_role_links.sql`
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
   application and contact enquiry, then verify the DMs and delivery activity
   in the bot logs. The website continues to return the reference inline.

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
