# Discord website roster

The public website does not query Discord from the browser. Instead, its server
requests a small, authenticated roster from `xenondiscordbot`. This keeps the
bot token private and prevents the full Discord member list from being exposed.

## Staff roles

The website maps these six Discord role names directly to its staff cards:

- Founder
- Content Lead
- Head of Operations
- Competitive Director
- Creator Director
- Community Manager

An assigned role is shown as **closed**. An unassigned role is **open**. The
website displays the holder's Discord server nickname, not their account
username. Multiple assigned members are displayed if a role has more than one
holder.

## Configuration

Set these server-only variables on the website host:

```text
WEBSITE_BOT_TOKEN=<the existing shared bot secret>
DISCORD_BOT_URL=https://<your-render-bot>.onrender.com
```

Set the same `WEBSITE_BOT_TOKEN` and the intended `DISCORD_GUILD_ID` on the
bot service. The bot must have Server Members Intent enabled and be connected.

## Tournaments, events and future showcases

The bot's `WEBSITE_PUBLIC_ROLE_NAMES` environment variable accepts a
comma-separated list of additional Discord roles, for example:

```text
WEBSITE_PUBLIC_ROLE_NAMES=Founder,Content Lead,Head of Operations,Competitive Director,Creator Director,Community Manager,Tournament Host,Event Host
```

The protected roster API returns only members assigned to those selected roles,
including their server nicknames. New website sections can use the shared
`getWebsiteRoster` helper in `lib/discord-roster.ts`; no new Discord login,
database copy, or browser credential is required.
