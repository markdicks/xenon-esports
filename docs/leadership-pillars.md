# Leadership pillars

- `/leadership` keeps the existing Discord-backed leadership team view.
- `/leadership?view=pillars` shows the six portfolios and responsibilities without loading Discord members, staffing status or personal names.
- `/leadership/pillars.png` provides a 1080 × 1350 PNG. The page includes download and preview links.

Both the page and graphic use `data/roles.ts`. Update the public definitions there and rebuild/deploy to regenerate the graphic. The PNG is generated during the Next.js build using the existing Xenon logo, lime green and locally bundled Space Grotesk fonts; no external image/font service is contacted during generation. Font licensing is included under `assets/fonts/space-grotesk`.

No bot, database, environment or Hostinger configuration change is required. The normal team, About and recruitment role integrations remain in place.
