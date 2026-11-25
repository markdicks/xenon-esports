import type { EventId } from "@/lib/community-contract";

export type Collaborator = {
  slug: string;
  name: string;
  shortName: string;
  label: string;
  slogan: string;
  message: string;
  focus: string;
  philosophy: string;
  artwork: string;
  artworkAlt: string;
  logo: string;
  awareness?: { poster: string; posterAlt: string; headline: string; message: string };
  socials: { label: string; url: string }[];
  events: { id: EventId; href: string; name: string; contribution: string }[];
};

export const collaborators: Collaborator[] = [
  {
    slug: "powerpuff-potatoes",
    name: "Powerpuff Potatoes",
    shortName: "PPP",
    label: "PPP Tournaments",
    slogan: "Where community comes first",
    message: "No egos. No rank shaming. Just fun, unserious tournaments, friendly banter, and unforgettable moments. All ranks are welcome.",
    focus: "South African gaming tournaments and community-building.",
    philosophy: "An open, community-first organisation that accommodates different ranks, games, organisations and playstyles.",
    artwork: "/collaborations/ppp/xenon-ppp-banner.png",
    artworkAlt: "Crowned XP collaboration mark, Powerpuff Potatoes tournament logo and Xenon XE logo on violet and rose artwork with black ink drips",
    logo: "/collaborations/ppp/xp-collaboration-logo.png",
    awareness: { poster: "/collaborations/ppp/gbv-awareness-poster.png", posterAlt: "PPP's purple anti-femicide awareness poster with handprints, the PPP logo and the message: Where community comes first, safety must come first too. We stand against femicide and violence against women.",
      headline: "Where community comes first, safety must come first too.", message: "PPP stands against gender-based violence and femicide, and stands in solidarity with the Enough Is Enough movement. Respect, dignity and safety belong in every gaming community." },
    socials: [
      { label: "PPP Discord", url: "https://discord.gg/xcbdRqGMcg" },
      { label: "Twitch", url: "https://www.twitch.tv/powerpuffpotatoes_za" },
      { label: "TikTok", url: "https://www.tiktok.com/@powerpuff.potatoes" },
      { label: "All PPP links", url: "https://linktr.ee/powerpuffpotatoes7" },
    ],
    events: [{
      id: "valorant-december-2026",
      href: "/events/valorant",
      name: "December Valorant Community Event",
      contribution: "Xenon and PPP have agreed to run the Valorant event together, bringing both communities into the same event.",
    }],
  },
];

export const getCollaborator = (slug: string) => collaborators.find((partner) => partner.slug === slug);
export const collaboratorsForEvent = (id: EventId) => collaborators.filter((partner) => partner.events.some((event) => event.id === id));
export const eventOrganisers = (id: EventId, configured: string[]) => Array.from(new Set([
  ...configured, ...collaboratorsForEvent(id).map((partner) => `${partner.name} (${partner.shortName})`),
]));
