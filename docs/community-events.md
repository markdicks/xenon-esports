# November / December community update

## Deployment checklist

1. Back up the existing Hostinger database. Run `sql/011_community_events.sql` against the same database used by the website. It only creates new tables and inserts missing event defaults; rerunning it does not overwrite staff settings or existing applications.
2. Deploy the website, then the matching bot update. Keep the working DB variables, `WEBSITE_BOT_TOKEN`, internal API authentication and interview configuration unchanged.
3. Public community forms need a stable server-only secret of at least 32 characters. They use `COMMUNITY_FORM_SECRET`, falling back to `WEBSITE_BOT_TOKEN`. If the existing token is shorter, add a separate random `COMMUNITY_FORM_SECRET`; do NOT rotate the working website/bot or booking token just for these forms. Never use a `NEXT_PUBLIC_` secret.
4. Verify Hostinger's trusted proxy strips or appends incoming `X-Forwarded-For` correctly. `EVENT_TRUSTED_PROXY_HOPS=1` uses the rightmost address; adjust only after verifying the actual trusted proxy chain. Missing/invalid addresses fail closed. Do not trust a client-supplied leftmost address or expose the Next.js origin around the proxy.
5. Check the Events pages and bot Admin > Community events. Both voting and pre-show registration start CLOSED. An authorised manager must explicitly tick the relevant opening checkbox and save the Valorant event. No date, final format, sponsor, prize or roster is seeded.
6. Verify role routing in the existing Roles > website notification settings. Pre-show notifications go to the union of the Competitive and Community/events interest routes. An unset specialised route inherits general-interest routing. Set the actual Discord role IDs there; no new bot token or database connection is required.
7. Validate open/closed behaviour and real MySQL persistence in staging before opening publicly. Do not use fake public applications or send real Discord notifications as a deployment smoke test.

The five approved general articles publish as part of the website deployment with a 13 November 2026 publication date. Coaching remains a draft and its URL returns 404. Publish it only after explicit approval of the wording, identity and signing status.

## Public journeys

- Discord CTAs use the shared invite configuration and default directly to `https://discord.gg/2XwuujbuNT` when unset.
- Get Involved continues to use the existing interest application.
- `/events` contains the December hub, nullable confirmed details and links.
- `/events/valorant/vote` records the two approved choices in MySQL and displays real aggregate counts. Results are indicative community preferences, not verified unique people or an automatic event decision.
- `/events/valorant/pre-show` accepts unlimited pending expressions of interest while open, subject to per-browser/identity and network abuse limits. It does not automatically select the first six. Applicants receive an inline `XEN-EVT-XXXXXX` reference and pending confirmation.
- Existing staff/contact/interest tables, references, routing, interviews and APIs are unchanged. Event registrations are separate and do not trigger an interview.

## Staff controls

Use the existing Discord login at the bot website, then Admin > Community events. Access is rechecked server-side for administrators or relevant Competitive, Community, Operations, Staff or interest-notification roles, using the existing role permissions.

The Events tab edits public descriptions, nullable date/time, format, participation, organisers, status and up to five HTTPS links. Dates are entered in the manager's local timezone and displayed publicly in SAST (UTC+2). Closing/completing an event closes its public forms. Changes use a revision check so stale saves cannot silently overwrite another manager.

The 1v1 pre-show tab has paged registrations, status filters, private answers, selection history and delivery health. Set pending, accepted, waitlisted, declined or withdrawn. A transaction locks the event before counting accepted participants: the seventh acceptance is rejected even with concurrent managers. Withdrawing/declining an accepted registration frees a place. Organisers contact selected players through Discord; selection does not silently send an acceptance DM or assign roles.

The bot sends only reference, Discord username, event, status and submission timestamp privately to routed staff. It never sends Riot IDs, availability, free-text answers or emails. Recipient receipts and short leases reduce duplicate delivery. Failed delivery retries every two minutes, up to 16 attempts (initial attempt plus 15 automatic retries), then pauses. Retry staff notification queues one manual attempt without resetting a live delivery or resending to recorded recipients. Receipt uncertainty waits for the lease before retrying. As with any external messaging service, exactly-once delivery cannot be guaranteed across an interrupted Discord send.

## Security and retention

- Existing bearer authentication protects the internal website API. Browser management uses existing Discord sessions, CSRF checks and fresh role checks. Actor/access context is injected by the bot, not accepted from the browser.
- Public writes require server-side Zod validation, same-origin checks, honeypot, a signed HttpOnly cookie and cookie-bound expiring proof. SQL values are parameterized.
- MySQL-backed hourly network limits are 3 successful votes and 8 registrations. Shared networks can reach these limits; a cookie prevents accidental duplicate submissions but is not proof of an individual. Registrations additionally deduplicate the normalised Discord + Riot identity. Clearing cookies or changing networks can evade anonymous controls, so this is not an election-grade system.
- Network addresses are HMACed; raw IPs are not stored. IPv6 uses a /64 bucket. Hashes are pseudonymous, not anonymous personal-data guarantees. Keep the secret stable while this event is running.
- Apply the organisation's retention policy to registration answers, audit records and pseudonymous vote data. Expired rate buckets can be removed periodically with `DELETE FROM community_rate_limits WHERE expires_at < NOW();`. No automatic deletion of application or registration data is introduced.
- Do not cache the event session endpoint or write responses at the CDN. Unavailable storage/secret/proxy verification disables submissions and never substitutes fake vote totals.

## News maintenance

`data/news.ts` holds typed articles: title, slug, date, summary, category, publication status and sections. Add articles there without changing page components. Only `published` entries are listed or served; draft metadata and bodies are not sent to public pages. Existing October updates retain their original month-only dates. Leadership articles load the current role holders through the existing Discord role integration rather than hard-coded names. No separate CMS was added.

## Verification boundaries

Automated tests cover validation, signed sessions, recorded counts, idempotency, rate limits, transactional selection/rollback, concurrent acceptance, internal authentication, notification leases, bot recipient routing and draft filtering. Browser QA uses intercepted local fixtures and disabled live credentials. No production submissions, votes or Discord messages are generated during these checks. The migration must still be executed and verified on the target MySQL service; the local test fixture is not a MySQL engine.
