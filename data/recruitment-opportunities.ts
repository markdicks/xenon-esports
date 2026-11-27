import type { interestAreas } from "@/data/interest-areas";

type Opportunity = {
  id: string;
  article: string;
  title: string;
  summary: string;
  formHint: string;
  areas: readonly (typeof interestAreas)[number][];
};

export const recruitmentOpportunities = [
  {
    id: "rocket-league-roster", article: "rocket-league-main-roster-recruitment",
    title: "Rocket League main roster",
    summary: "Player evaluations are underway for Xenon’s 2027 competitive roster.",
    formHint: "Mention Rocket League and tell us about your competitive experience. Include a replay link if you have one.",
    areas: ["Competitive"],
  },
  {
    id: "valorant-roster", article: "female-valorant-roster-interest",
    title: "Female Valorant roster",
    summary: "Express interest in a team that is still taking shape. Players with different levels of experience are welcome.",
    formHint: "Mention Valorant and the agent roles you usually play. You can include your current rank if you’d like.",
    areas: ["Competitive"],
  },
  {
    id: "rocket-league-content", article: "rocket-league-content-team-development",
    title: "Rocket League Content Team",
    summary: "Help make Rocket League content through streams, gameplay footage or editing.",
    formHint: "Mention the Rocket League Content Team and tell us what you make or would like to try.",
    areas: ["Streaming", "Content creation"],
  },
  {
    id: "creators-and-production", article: "creator-casting-editing-opportunities",
    title: "Creators, casters and editors",
    summary: "Volunteer opportunities across streaming, editing, casting, graphics and events.",
    formHint: "Select the areas that fit, or choose ‘Not sure yet’. A link to your work is optional.",
    areas: [],
  },
] as const satisfies readonly Opportunity[];

export function opportunityHref(opportunity: Opportunity) {
  const params = new URLSearchParams({ opportunity: opportunity.id });
  for (const area of opportunity.areas) params.append("areas", area);
  return `/join/interest?${params}`;
}
