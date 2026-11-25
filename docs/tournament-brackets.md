# Tournament brackets and PPP artwork

## Access and setup

Open the bot workspace's **Community events → Brackets** tab. The existing server owner/administrator and event-management role rules apply, with fresh Discord checks on every read and save. The bot calls the website over authenticated HTTPS; the existing Hostinger MySQL connection stores brackets and their audit history. There are no new environment variables or bot database credentials.

Create a draft for one of the existing events, choose its format, seed count and series lengths, and enter teams in seed order. Blank seed names mean **to be confirmed**, not a bye. Higher seeds receive real byes when the chosen count is not a power of two. No historical RSC teams or results are imported.

Formats:

- Single elimination, 2–32 entrants.
- Double elimination, 2–32 entrants, with a grand-final reset if the lower finalist wins the first final.
- RSC six-seed playoffs: seeds 1–2 begin in the upper final; 3 vs 6 and 4 vs 5 begin in lower quarter-finals. Their winners meet in the lower semi-final, then face the upper-final loser in the lower final. Finals can reset. Seeds 3–6 start with one elimination loss remaining; this differs from standard double elimination. Default series are BO5 for the quarter-finals and BO7 thereafter.

Select **Enable viewing link**, then copy the direct `/brackets/<random-id>` link. Brackets are **unlisted only**: no public directory, navigation, event-page links or sitemap entries. Viewing pages and their read API use `noindex`, `nofollow`, `noarchive`, no-referrer headers and uncached responses. Anyone with an enabled link can view and share it; unlisted links are not confidential access control. Disable the link to return 404 to viewers, including polling viewers. There is no public write endpoint.

Spectators see updated scores automatically every five seconds while the tab is visible. Failed refreshes retain the last received result with an updates-delayed notice. Match cards show series lengths, feeder matches, byes, pending seeds and the champion.

## Results and corrections

Both scores must be present and exactly one must reach the series winning score before the winner advances. Partial scores can be saved. Corrections preserve unrelated matches and clear only affected later results; clearing recorded downstream scores requires an explicit confirmation. Renaming preserves results. Changing seeds, format or series lengths requires confirming a full results reset. A separate reset control preserves the bracket's seeds, link and audit history.

Every save checks the last loaded revision, so one staff member cannot silently overwrite another's edit. Failed/unconfirmed saves retain the form; reload the saved bracket before retrying. Draft creation uses a request ID so a repeated submission does not create another bracket.

## Database and deployment

Deploy the website before the bot. `sql/015_event_brackets.sql` creates `event_brackets` and `event_bracket_audit` in the existing website database. Staff API access also creates missing tables automatically if the existing database user has CREATE permission. Otherwise run this migration once using Hostinger's database tools. Public viewing never creates tables. Existing tables and event settings are not rewritten.

Changes and their old/new state are committed in the same transaction as their audit entry. Audit records include the Discord actor ID and server nickname. API failures expose safe messages and diagnostic codes, not driver errors or secrets.

The supplied artwork is stored unchanged under `public/collaborations/ppp/`: the full 1920×396 banner, crowned XP collaboration logo, and full anti-femicide poster. PPP event and collaboration components link an awareness badge to the dedicated PPP page's community-safety section. The full poster remains visible at its original aspect ratio. Rocket League is not labelled as a PPP event.

Local automated tests cover progression for every size, both final outcomes, pending seeds, score validation, downstream invalidation, request deduplication, transactional rollback, stale revisions, guild isolation, current Discord permissions, safe failures and unlisted viewing. Target-MySQL execution is a deployment check; transaction fixtures are not a live MySQL service.
