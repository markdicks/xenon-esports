const assert = require("node:assert/strict");
const test = require("node:test");
const { createElement } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const load = require("./load-typescript.cjs");

test("the six approved articles release on their scheduled dates and reuse existing article URLs", () => {
  const { editorialDrafts } = load("data/news-drafts.ts");
  const { publishedNews } = load("data/news.ts", { "@/data/news-drafts": { editorialDrafts } });
  const eventSlug = "december-community-events";
  const contentSlug = "rocket-league-content-team-development";
  const schedule = [
    ["rocket-league-main-roster-recruitment", "2026-11-27"],
    [eventSlug, "2026-11-27"],
    ["female-valorant-roster-interest", "2026-11-29"],
    [contentSlug, "2026-12-01"],
    ["strengthening-xenon-community", "2026-12-05"],
    ["creator-casting-editing-opportunities", "2026-12-07"],
  ];
  assert.equal(editorialDrafts.length, schedule.length);
  for (const [slug, date] of schedule) {
    const article = editorialDrafts.find((candidate) => candidate.slug === slug);
    assert.equal(article.status, "published");
    assert.equal(article.date, date);
    const eve = new Date(Date.parse(date) - 86400000).toISOString().slice(0, 10);
    assert.ok(!publishedNews(eve).some((candidate) => candidate === article));
    assert.deepEqual(publishedNews(date).filter((candidate) => candidate.slug === slug), [article]);
  }

  const original = publishedNews("2026-11-26");
  assert.equal(original.find(({ slug }) => slug === eventSlug).title, "December Community Events Are Coming");
  assert.equal(publishedNews("2026-11-30").find(({ slug }) => slug === contentSlug).date, "2026-11-13");
  assert.ok(!publishedNews("2026-12-31").some(({ slug }) => slug === "rocket-league-coaching-addition"));
});

test("public news and recruitment omit draft details even if a production process has the local review flag", () => {
  const previous = { NODE_ENV: process.env.NODE_ENV, XENON_EDITORIAL_REVIEW: process.env.XENON_EDITORIAL_REVIEW };
  const { editorialDrafts } = load("data/news-drafts.ts");
  const drafts = editorialDrafts.map((article) => ({ ...article, status: "draft" }));
  const news = load("data/news.ts", { "@/data/news-drafts": { editorialDrafts: drafts } });
  const { visibleOpportunities } = load("lib/recruitment-opportunities.ts", { "@/data/news": news });
  try {
    process.env.XENON_EDITORIAL_REVIEW = "1";
    process.env.NODE_ENV = "production";
    assert.equal(news.visibleArticle("female-valorant-roster-interest"), undefined);
    assert.ok(!visibleOpportunities().some(({ id }) => id === "valorant-roster"));
    assert.equal(news.visibleArticle("december-community-events").status, "published");
    process.env.NODE_ENV = "development";
    assert.equal(news.visibleArticle("female-valorant-roster-interest").status, "draft");
    assert.ok(visibleOpportunities().some(({ id }) => id === "valorant-roster"));
    assert.equal(news.visibleArticle("december-community-events").status, "draft");
    assert.equal(news.visibleArticle("rocket-league-coaching-addition"), undefined);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("roster CTAs point to the existing interest form using only supported interest values", () => {
  const { editorialDrafts } = load("data/news-drafts.ts");
  const { interestAreas } = load("data/interest-areas.ts");
  const competitive = editorialDrafts.filter(({ category }) => category === "Competitive");
  assert.equal(competitive.length, 2);
  for (const article of editorialDrafts.filter(({ action }) => action?.href.startsWith("/join"))) {
    const target = new URL(article.action.href, "https://xenonesports.online");
    assert.equal(target.pathname, "/join/interest");
    assert.ok(target.searchParams.get("opportunity"));
    assert.ok(target.searchParams.getAll("areas").every((area) => interestAreas.includes(area)));
    if (competitive.includes(article)) assert.deepEqual(target.searchParams.getAll("areas"), ["Competitive"]);
  }
});

test("Valorant news renders active links only for open actions and reports actual stored counts when closed", () => {
  const { defaultEvents, valorantEventId } = load("lib/community-contract.ts");
  const anchor = ({ href, children }) => createElement("a", { href }, children);
  const { ValorantEventActions } = load("components/events/ValorantEventActions.tsx", {
    "next/link": { default: anchor }, "@/components/ui/Button": { Button: anchor },
  });
  const event = { id: valorantEventId, available: true, settings: { ...defaultEvents[valorantEventId].settings, pollOpen: true, registrationOpen: true },
    results: { total: 13, votes: { "skirmish-2v2": 3, "standard-5v5": 10 } } };
  const html = (overrides = {}) => renderToStaticMarkup(createElement(ValorantEventActions, { event: { ...event, ...overrides }, showResults: true }));
  assert.match(html(), /href="\/events\/valorant\/vote">Vote Now/);
  assert.match(html(), /href="\/events\/valorant\/pre-show">Register Interest/);
  const closed = html({ settings: { ...event.settings, status: "closed" } });
  assert.doesNotMatch(closed, /Vote Now|Register Interest/);
  assert.match(closed, /3 votes/);
  assert.match(closed, /10 votes/);
  assert.match(closed, /href="\/events\/valorant">Event details/);
  assert.doesNotMatch(html({ available: false }), /0 votes|3 votes|10 votes|Vote Now|Register Interest/);
});
