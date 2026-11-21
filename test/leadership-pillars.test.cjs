const test = require("node:test");
const assert = require("node:assert/strict");
const { createElement } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const load = require("./load-typescript.cjs");
const { staffRoleDefinitions } = load("data/roles.ts");
const { LeadershipPillars } = load("components/leadership/LeadershipPillars.tsx");
const Link = ({ children, ...props }) => createElement("a", props, children);
const page = (getStaffRoles) => load("app/leadership/page.tsx", {
  "next/link": { default: Link, __esModule: true },
  "@/components/layout/Navbar": { Navbar: () => createElement("header", null, "Xenon") },
  "@/components/layout/Footer": { Footer: () => createElement("footer", null, "Xenon") },
  "@/components/leadership/LeadershipPillars": { LeadershipPillars },
  "@/lib/discord-roster": { getStaffRoles },
}).default;

test("pillars view never requests Discord members and contains only the public portfolios", async () => {
  let rosterReads = 0;
  const Page = page(async () => { rosterReads++; throw new Error("Discord must not be needed for pillars"); });
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ view: "pillars" }) }));
  assert.equal(rosterReads, 0);
  for (const role of staffRoleDefinitions) {
    assert.ok(html.includes(role.department)); assert.ok(html.includes(role.title));
    for (const responsibility of role.responsibilities) assert.ok(html.includes(responsibility));
  }
  assert.match(html, /download="xenon-leadership-pillars.png"/);
  assert.match(html, /href="\/leadership\/pillars.png"/);
  assert.doesNotMatch(html, /Assigned through Discord|Position currently unassigned|availability is syncing/);
});

test("the default team view retains current Discord names and status", async () => {
  let rosterReads = 0;
  const Page = page(async () => { rosterReads++; return [{ ...staffRoleDefinitions[0], holders: [{ id: "123456789012345678", nickname: "Current Founder" }], status: "closed" }]; });
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
  assert.equal(rosterReads, 1); assert.match(html, /Current Founder/); assert.match(html, /Assigned through Discord/);
  assert.match(html, /href="\/leadership\?view=pillars"/);
});

test("the export uses the same public role definitions and includes no personnel fields", () => {
  const { PillarsGraphic, pillarsGraphicSize } = load("components/leadership/PillarsGraphic.tsx");
  const html = renderToStaticMarkup(createElement(PillarsGraphic, { logo: "data:image/svg+xml;base64,PHN2Zy8+" }));
  assert.deepEqual(pillarsGraphicSize, { width: 1080, height: 1350 });
  for (const role of staffRoleDefinitions) assert.ok(html.includes(role.title));
  assert.match(html, /#d8ff3d/); assert.match(html, /xenonesports.online/);
  assert.doesNotMatch(html, /holders|nickname|username|Assigned through Discord|unassigned|syncing/);
});
