import { updates } from "@/data/updates";

export type NewsArticle = {
  title: string; slug: string; date: string; summary: string; category: string;
  status: "draft" | "published"; content: string[]; action?: { label: string; href: string }; leadership?: boolean;
};

// Five general articles were approved for publication. Coaching stays unpublished.
export const news: NewsArticle[] = [
  {
    title: "December Community Events Are Coming", slug: "december-community-events", date: "2026-11-13", category: "Community", status: "published",
    summary: "Valorant and Rocket League community events are being prepared for December. Help shape the Valorant format, and discover the separate six-player pre-show.",
    content: [
      "Xenon is preparing its first community events for December 2026, with Valorant and Rocket League as the initial gaming titles. Dates, formats, participation requirements and event-specific rules are still being finalised.",
      "The Valorant format poll will let the community express a preference between a 2v2 Skirmish Tournament with best-of-three series and a 5v5 Standard Tournament. Voting will open after organisers enable it. Results are community preferences, not an automatic decision: interest levels, player availability and feasibility will all be reviewed.",
      "A separate Valorant 1v1 pre-show will give six selected players an opportunity to take part before the main event. Expressions of interest are not places in the showcase, and selection is not first come, first served. The pre-show's format, match order and rules will be decided by organisers later.",
      "The events hub will carry confirmed information as it becomes available. No dates, prizes, sponsors or partners are being announced at this stage.",
    ], action: { label: "Vote on the Valorant Event", href: "/events/valorant/vote" },
  },
  {
    title: "Xenon Recruitment & Interviews Are Underway", slug: "recruitment-and-interviews-underway", date: "2026-11-13", category: "Organisation", status: "published",
    summary: "Our leadership structure is established, and expressions of interest and departmental interviews are actively underway.",
    content: [
      "Xenon's core leadership structure is established across six departments as we work toward our January 2027 return. The focus is now on building the people and sustainable working relationships within those departments.",
      "Expressions of interest are being reviewed, and interviews are being conducted for positions within departments. These conversations help the relevant teams understand what someone wants to contribute, what they hope to learn and what commitments are realistic.",
      "You do not need to understand Xenon's internal roles, or know exactly where you fit, before introducing yourself. Competitive players, creators, editors, community contributors, technical people and anyone still exploring their direction can use the same short interest form.",
      "Leadership is looking at suitability, reliability, development and sustainable commitments. An introduction is the start of a conversation, not a requirement to promise more time than you can give.",
    ], action: { label: "Get Involved", href: "/join/interest" },
  },
  {
    title: "Rocket League Content Team Development", slug: "rocket-league-content-team-development", date: "2026-11-13", category: "Rocket League", status: "published",
    summary: "The Rocket League Content Team is taking shape around competitive gameplay, streaming, content creation and player development.",
    content: [
      "Formation of Xenon's Rocket League Content Team is underway. The programme brings competitive gameplay together with streaming and content creation as part of our progress toward the 2027 competitive season.",
      "The direction includes coaching support, structured development and opportunities to participate in community and competitive events. The aim is to help Rocket League creators develop both their play and their content presence with a team around them.",
      "This is confirmed programme development, not a final roster announcement. Member names, individual signings and specific competitive entries will only be shared when approved.",
      "Rocket League players and creators who are interested in contributing can introduce themselves through the existing interest form. Tell us what you enjoy making and what you would like to develop.",
    ], action: { label: "Get Involved", href: "/join/interest?areas=Competitive&areas=Content%20creation" },
  },
  {
    title: "Building Connections Beyond Xenon", slug: "building-connections-beyond-xenon", date: "2026-11-13", category: "Organisation", status: "published",
    summary: "Early conversations are exploring how future relationships could support Xenon's players, creators, community and events.",
    content: [
      "Xenon is beginning conversations with brands and organisations as we build toward the January 2027 return. We are exploring future partnerships, sponsorships, community opportunities and wider industry relationships.",
      "The intention is to build a network that can support competitive players, creators and events over time. A useful relationship should make sense for the people involved and for the community we are developing.",
      "These conversations are exploratory. They are not announcements of signed partnerships or completed sponsorship deals. Private discussions and company names will not be shared without approval.",
      "Organisations interested in discussing a suitable opportunity can use our contact page for partnerships, business or media enquiries.",
    ], action: { label: "Contact Xenon", href: "/contact" },
  },
  {
    title: "Meet the Team Behind Xenon", slug: "meet-the-team-behind-xenon", date: "2026-11-13", category: "Leadership", status: "published", leadership: true,
    summary: "Meet the six leadership pillars and the responsibilities behind Xenon's competitive, creator and community work.",
    content: [
      "Xenon's six leadership pillars connect the organisation's direction with its day-to-day work: Leadership, Content, Operations, Competitive, Creators and Community.",
      "Leadership owns direction and the foundations of the return. Content covers creative direction, editing and short-form work. Operations supports staff, communication and day-to-day coordination. Competitive builds divisions and team leadership. Creators develops the creator programme and relationships. Community keeps member communication, Discord activity and events moving.",
      "Current role holders below are retrieved through the existing Discord integration. When assignments change in Discord, the website follows that source rather than maintaining a separate hard-coded list.",
    ], action: { label: "View Leadership", href: "/leadership" },
  },
  {
    title: "Rocket League Coaching Addition", slug: "rocket-league-coaching-addition", date: "2026-11-13", category: "Rocket League", status: "draft",
    summary: "Prepared announcement about an agreement for coaching support. Not approved for public release.",
    content: [
      "An agreement has been reached to bring coaching support into Xenon's Rocket League division. This announcement must remain unpublished until the organisation explicitly approves a public announcement and confirms the status of the arrangement.",
      "The intended coaching structure supports the main competitive roster, academy development and the Rocket League Content Team. The long-term aim is to improve competitiveness, develop players and provide structured feedback.",
      "No coach identity, applicant identity, completed official signing or final roster is approved for publication in this draft.",
    ],
  },
  ...updates.map((item, index): NewsArticle => ({
    title: item.title, slug: ["xenon-returns-in-2027", "meet-the-leadership-team", "why-we-are-rebuilding-differently", "building-xenons-competitive-future"][index],
    date: "2026-10", category: item.category, status: "published", summary: item.excerpt, content: [item.excerpt], leadership: item.category === "Leadership",
  })),
];
export const publishedNews = () => news.filter((article) => article.status === "published").sort((a, b) => b.date.localeCompare(a.date));
export const publishedArticle = (slug: string) => publishedNews().find((article) => article.slug === slug);
export function newsDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", ...(value.length > 7 ? { day: "numeric" as const } : {}), timeZone: "UTC" }).format(new Date(`${value.length === 7 ? `${value}-01` : value}T12:00:00Z`));
}
