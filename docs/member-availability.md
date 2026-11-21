# Member availability

Deploy the website before the bot. No new SQL migration or database is needed; this extends the JSON in the existing `discord_staff_availability.weekly_slots` column from migration 009. Old recurring arrays remain readable. New saves contain a versioned document with a revision, recurring times and individual weeks. Keep the compatible website parser deployed once these documents have been saved.

The dashboard's **My availability** workspace lets members use a repeating Monday–Sunday pattern or fill individual weeks. Switching modes preserves both sets of times. Individual weeks can be saved with selected 30-minute intervals, explicitly marked unavailable, or removed to return to **Not submitted**. Unfilled weeks never inherit the recurring pattern in individual mode. Members can retain up to 52 individual weeks; old weeks are removed only through their own edits. Times and week boundaries use the member's selected timezone.

Sharing requires the current **Xenon Member** Discord role. The bot uses `XENON_MEMBER_ROLE_ID` if configured; otherwise it accepts one exact, non-integration role named `Xenon Member`. A missing/invalid configured ID or ambiguous name fails closed. An administrator does not bypass the member-role requirement for filling in their own schedule. Former role holders can still stop sharing their own saved data.

**Team availability** is limited to current leadership and server administrators. Leadership uses configured pillar/linked role IDs before unique name fallbacks; Help/notification-recipient access alone does not grant overview access. The bot refreshes current human guild membership, filters by the member role, and lists up to 50 members per page, including people without a submission. Search uses Discord nicknames, usernames or IDs. Each row shows that member's timezone, selected-week times, submission state and last update. A date column is the same local calendar date in each member's displayed timezone, not a converted shared timezone.

The bot sends authenticated HTTPS requests to `/api/bot/availability`. Only the signed-in member's profile may be changed. The browser cannot supply another actor, guild, viewer permission or member list. Website storage and meeting invalidation commit together, and revision checks reject stale saves. No database credentials move to Render. Overview responses include only the selected week, not a member's entire saved calendar.

Existing unscheduled meeting matching uses the active availability mode. It matches only saved times; unknown weeks cannot provide a match. A completely unsubmitted individual calendar still needs a meeting-specific reply. Explicit meeting-specific replies and booked meetings remain intact. Turning sharing off removes the saved availability; it does not cancel an already booked meeting.

Validate with local demo and automated mocks. Do not send dummy production meeting invitations or modify real member schedules to test this feature.
