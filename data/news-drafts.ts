import { collaborators } from "@/data/collaborations";
import type { NewsArticle } from "@/data/news";
import { opportunityHref, recruitmentOpportunities } from "@/data/recruitment-opportunities";
import { DISCORD_INVITE_URL } from "@/lib/public-links";

const [rocketLeagueRoster, valorantRoster, rocketLeagueContent, creators] = recruitmentOpportunities;
const ppp = collaborators[0];

// Sparky approves each article separately. Set its release date before changing its status to published.
// Drafts with an existing slug replace the previous version only once approved and due.
export const editorialDrafts: NewsArticle[] = [
  {
    title: "Xenon Esports Begins Rocket League Main Roster Recruitment",
    slug: rocketLeagueRoster.article, date: "2026-11-27", category: "Competitive", status: "draft",
    summary: "Player evaluations are underway as Xenon builds its main Rocket League roster for the 2027 season.",
    content: [
      "Xenon’s Competitive department has started assessing players for the main Rocket League roster. The aim is to put together a team that can train consistently and represent Xenon in Sub-Saharan African competition.",
      "Recent competitive experience and mechanics are part of the assessment. So are the things that come out in a series: how players communicate, adapt to their teammates and respond after a difficult game. Consistency and room to develop matter alongside current ability.",
      "Assessments are ongoing. If you’re interested, tell us what you’ve competed in, how you like to play and what you’re working on. We’ll share roster news once decisions are final.",
    ],
    action: { label: "Express Competitive Interest", href: opportunityHref(rocketLeagueRoster) },
    related: [rocketLeagueContent.article, "building-xenons-competitive-future"],
  },
  {
    title: "Expressions of Interest Open for Xenon’s Female Valorant Roster",
    slug: valorantRoster.article, date: "2026-11-29", category: "Competitive", status: "draft",
    summary: "Xenon is inviting players to put their names forward for a female Valorant team that is still in development.",
    content: [
      "Expressions of interest are open for Xenon’s female Valorant roster. We’re looking for players who want to practise together, communicate clearly in matches and keep improving as a team.",
      "Players with different levels of experience are welcome. In your introduction, tell us which roles you play, what you’ve learned from playing with a team and how often you can practise. We’ll look at commitment, teamwork and how players fit together when evaluating the roster.",
      "The lineup is still being built. We’ll share the next steps publicly as they’re confirmed.",
    ],
    action: { label: "Apply for Valorant", href: opportunityHref(valorantRoster) },
    related: ["recruitment-and-interviews-underway", "december-community-events"],
  },
  {
    title: "Xenon’s Rocket League Content Programme Takes Shape",
    slug: rocketLeagueContent.article, date: "2026-12-01", category: "Content", status: "draft",
    summary: "The Rocket League Content Team is developing a programme around gameplay, streaming and player improvement.",
    content: [
      "The Rocket League Content Team is taking shape around what players already do well: play matches, review their games and share the moments worth watching. We’re working out how streams, coaching and edits can fit into a programme that helps people improve at the game and get better at making content.",
      "That could mean capturing gameplay for a highlight edit, working with the Content team on a stream or taking part in a community event. We’re still working through what the team can support and how contributors will work together.",
      "If you play Rocket League and want to help with any of that, tell us what you enjoy doing and what you’d like to learn. A clip or channel link is welcome if you have one.",
    ],
    action: { label: "Get Involved", href: opportunityHref(rocketLeagueContent) },
    related: [rocketLeagueRoster.article, creators.article],
  },
  {
    title: "Xenon x Powerpuff Potatoes – December Valorant Event",
    slug: "december-community-events", date: "2026-11-27", category: "Events", status: "draft",
    summary: "Xenon and Powerpuff Potatoes are planning a December Valorant event with a community format vote and a separate six-player 1v1 pre-show.",
    content: [
      "Xenon Esports and Powerpuff Potatoes are bringing their communities together for a Valorant event in December. The format vote gives players a choice between a 2v2 Skirmish played as best-of-three series and a standard 5v5 tournament. The organisers will use the result alongside player availability and what they can run on the day.",
      "Six selected players will take part in a separate 1v1 pre-show. Where registration is open, anyone interested can put their name forward for selection. The organisers will confirm the final format and participation details on the event page.",
      "A Rocket League community event is also in planning. Its details will be shared through the events hub once confirmed.",
    ],
    image: { src: ppp.artwork, alt: ppp.artworkAlt, width: 1920, height: 396 },
    event: "valorant",
    related: ["strengthening-xenon-community", "building-connections-beyond-xenon"],
  },
  {
    title: "Strengthening Xenon’s Community Experience",
    slug: "strengthening-xenon-community", date: "2026-12-05", category: "Community", status: "draft",
    summary: "The Community team is reviewing how Discord is organised and how members find their way to games, events and help.",
    content: [
      "A new member should be able to join the Xenon Discord, find the right channels and see how to get involved. That’s the work the Community team is focusing on before the January relaunch.",
      "We’re reviewing which channels and categories are useful, where information is hard to find and how to keep moderation standards clear. The team is also looking at what members take part in and listening to feedback about what would make it easier to join in.",
      "Whether you’re looking for people to play with, following the teams or interested in helping with an event, Discord is the best place to get involved. If something in the server is hard to find, tell us.",
    ],
    action: { label: "Join Our Discord", href: DISCORD_INVITE_URL },
    related: ["december-community-events", "meet-the-team-behind-xenon"],
  },
  {
    title: "Xenon Expands Creator, Casting and Editing Opportunities",
    slug: creators.article, date: "2026-12-07", category: "Recruitment / Content", status: "draft",
    summary: "Interviews are continuing for people interested in making content, covering matches and helping run community events.",
    content: [
      "Xenon is continuing to review expressions of interest and speak with people who want to help make things for the organisation. That includes streamers and creators, short- and long-form editors, graphic designers, Valorant and Rocket League casters, and people interested in helping with community events.",
      "If you’ve made something you’re proud of, send a link so we can see it. If you’re still learning or you’re interested in more than one area, tell us what you’d like to try. You can use the same form even if you haven’t settled on a role.",
      "These positions are voluntary and unpaid unless we say otherwise for a specific opportunity. The focus is on giving contributors a chance to work together and build experience at a pace they can sustain.",
    ],
    image: { src: "/branding/socials-banner.webp", alt: "Xenon’s neon XE creator artwork with two wolves", width: 2172, height: 724 },
    action: { label: "Get Involved", href: opportunityHref(creators) },
    related: [rocketLeagueContent.article, "recruitment-and-interviews-underway"],
  },
];
