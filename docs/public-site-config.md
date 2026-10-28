# Discord-controlled public links

The bot sends authenticated HTTPS requests to the website. Only the website
uses its existing Hostinger MySQL pool (`./lib/db.ts`). The bot needs no database
driver, database credentials, additional database or remote MySQL access.

## Deployment

1. Run `./sql/004_site_config.sql` once in the **existing website database**, using
   the same Hostinger migration/phpMyAdmin workflow as the other SQL files.
2. Set a new strong random secret as `INTERNAL_BOT_API_KEY` in the website's
   server environment and the same value as `XENON_INTERNAL_API_KEY` in Render's
   bot environment. This key is separate from `WEBSITE_BOT_TOKEN`. Set the bot's
   `XENON_API_URL=https://xenonesports.online`. Never put real keys in source or
   either `.env.example` file.
3. Keep the existing bot `DISCORD_GUILD_ID`, `WEBSITE_URL` and `WEBSITE_BOT_TOKEN`
   settings. Deploy both projects. The bot registers `/social` only in that
   configured Discord server. Its invite must include `applications.commands`.
4. Set stable role IDs for Founder, Content Lead and/or Creator Director using
   the bot's `./config/social-permissions.json`, or the existing dashboard's
   **Roles → Sync roles → manual link** for those leadership seats. Explicit IDs
   override saved links for the same seat. Automatic role-name matching alone
   does **not** authorize this feature. Empty/missing IDs grant no access.

No real keys or live database migration are supplied by this code change.

## Commands and API

Approved role holders can use these commands; replies are visible only to them:

```text
/social list
/social set platform:tiktok url:https://tiktok.com/@xenon
/social remove platform:tiktok
```

Twitch, YouTube, TikTok, Instagram and Discord are the only supported platforms.
Use public HTTPS profile/channel URLs (`youtube.com/@handle`, `/channel/id`,
`/c/name` or `/user/name` for YouTube), or `discord.gg/code` /
`discord.com/invite/code` for Discord. Credentials, unrelated hosts, query
strings and fragments are rejected. This is public display configuration only;
it never signs into social accounts or stores their credentials.

`GET /api/internal/config` returns `{ success: true, configs: { ... } }` with
only the five whitelisted keys. Both methods require the HTTP header
`Authorization: Bearer <internal API key>`; there is no browser API key or public
configuration-editing route.

`POST /api/internal/config` accepts only this JSON shape:

```json
{
  "key": "social.tiktok",
  "value": "https://tiktok.com/@xenon",
  "actor": {
    "discordId": "123456789012345678",
    "name": "Leader display name"
  }
}
```

Allowed keys are `social.twitch`, `social.youtube`, `social.tiktok`,
`social.instagram`, and `discord.invite`. Setting `value` to `null` removes a
link. The trusted bot derives the actor from a freshly fetched Discord member;
the API authenticates the bot and validates the key, value and actor. The API
does not accept arbitrary SQL, table names or other config keys.

Every successful POST, including a removal or an unchanged value, commits the
config row and an audit entry in one transaction. Per-key locking serializes
concurrent first writes so each audit records the correct previous value.
Audit failure rolls back the configuration change. Responses never expose SQL
errors. The bot records a brief change message in existing dashboard activity
and does not automatically retry writes whose response was lost. Use
`/social list` to check an uncertain result before retrying.

## Public rendering and fallbacks

The homepage's Follow the Rebuild section and Discord join buttons on Community
and Join Xenon read MySQL on the server for each request. Updates and removals
appear on the next page request without rebuilding or redeploying. Labels,
descriptions and design constants stay in `./data/social.ts`.

Unset links render as non-clickable cards. Missing invites keep the existing
internal Join/Community destinations. Database outages or a migration that has
not been applied use those same safe public fallbacks. The protected API instead
returns a generic 503, so the bot never confirms an unsuccessful change.

Verification: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.
The tests use fake databases and Discord members; they do not modify production.
