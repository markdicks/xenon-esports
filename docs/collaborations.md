# Collaborations and PPP

Public routes:

- `/collaborations`: shared-work directory, linked from the footer.
- `/collaborations/powerpuff-potatoes`: short PPP profile, philosophy, direct social links and shared events.
- `/events/valorant`: Xenon x PPP event overview, existing poll and pre-show links, current event settings and the PPP introduction.

The directory reads event status from the existing MySQL event settings: completed events are labelled Completed only when staff marks them complete. The confirmed agreement to co-host Valorant is public; a wider sponsorship, other title collaborations, confirmed dates or completed events are not implied. Rocket League remains separate.

`data/collaborations.ts` is the shared source for collaborator details and event associations. Add another collaborator with approved details and its own artwork there; no database changes or bot API changes are needed for this content. The bot's existing event date, format, opening/closing and selection controls are unchanged.

PPP's name, slogan, philosophy and event agreement were supplied by Xenon. Direct Discord, Twitch and TikTok links were verified against `https://linktr.ee/powerpuffpotatoes7` on 17 November 2026. The PPP Discord is explicitly labelled PPP Discord; Xenon's own Join Discord CTAs still use the central Xenon invite.

## Artwork provenance

`public/collaborations/ppp/xenon-ppp-collaboration.webp` is a generated web adaptation of the supplied photographed poster, not an original vector export or an exact recovered brand master. The original export was unavailable. The built-in image generator was used to remove the photographed UI/perspective/moire and adapt the poster's joint crowned XP, PPP and XE marks, charcoal, rose/violet and hanging black ink treatment into a wide banner. It was compressed to WebP without changing its dimensions. Replace it with official artwork when available.

Prompt specification: adapt the reference into a clean 3:1 digital banner; dark charcoal left 58% for HTML text; right 42% preserves the crowned XP with the PPP and XE marks below; muted violet/rose print grain; a connected irregular black drip fringe; no dates, sponsor claims, new logos, UI, photographed-screen effects, extra headlines or glow/orbs. The negative space is for accessible HTML text rather than text baked into the artwork.

All new colours are scoped to collaboration elements or `.collab-event`. Main Xenon navigation, CTAs, forms, database and Discord/interview flows are preserved. No public poll, registration or application needs to be submitted to test the content pages.
