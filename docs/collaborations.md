# Collaborations and PPP

Public routes:

- `/collaborations`: shared-work directory, linked from the footer.
- `/collaborations/powerpuff-potatoes`: short PPP profile, philosophy, direct social links and shared events.
- `/events/valorant`: Xenon x PPP event overview, existing poll and pre-show links, current event settings and the PPP introduction.

The directory reads event status from the existing MySQL event settings: completed events are labelled Completed only when staff marks them complete. The confirmed agreement to co-host Valorant is public; a wider sponsorship, other title collaborations, confirmed dates or completed events are not implied. Rocket League remains separate.

`data/collaborations.ts` is the shared source for collaborator details and event associations. Add another collaborator with approved details and its own artwork there; no database changes or bot API changes are needed for this content. The bot's existing event date, format, opening/closing and selection controls are unchanged.

PPP's name, slogan, philosophy and event agreement were supplied by Xenon. Direct Discord, Twitch and TikTok links were verified against `https://linktr.ee/powerpuffpotatoes7` on 17 November 2026. The PPP Discord is explicitly labelled PPP Discord; Xenon's own Join Discord CTAs still use the central Xenon invite.

## Artwork provenance

Current pages use the supplied exports unchanged: `xenon-ppp-banner.png` (1920×396), `xp-collaboration-logo.png`, and `gbv-awareness-poster.png` in `public/collaborations/ppp/`. The earlier generated `xenon-ppp-collaboration.webp` is a legacy asset and is no longer the page artwork.

The collaboration profile, Valorant event and associated brackets share one hero with accessible HTML text over the banner background. Desktop artwork fills the hero and stays aligned to the right to retain the brand marks. On narrower screens the full-width artwork blends into a matching background behind the content, preserving the marks and their proportions. The directory card uses the same combined treatment. The awareness poster remains a full, uncropped image with a full-size viewing link.

All new colours are scoped to collaboration elements or `.collab-event`. Main Xenon navigation, CTAs, forms, database and Discord/interview flows are preserved. No public poll, registration or application needs to be submitted to test the content pages.
