const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const load = require("./load-typescript.cjs");
const { collaborators, getCollaborator, collaboratorsForEvent, eventOrganisers } = load("data/collaborations.ts");

test("PPP is an event-specific collaborator, not an invented wider sponsor or Rocket League partner", () => {
  const ppp = getCollaborator("powerpuff-potatoes");
  assert.equal(ppp.name, "Powerpuff Potatoes");
  assert.equal(ppp.label, "PPP Tournaments");
  assert.equal(ppp.slogan, "Where community comes first");
  assert.match(ppp.message, /No egos\. No rank shaming\./);
  assert.match(ppp.message, /All ranks are welcome/);
  assert.equal(ppp.events.length, 1); assert.equal(ppp.events[0].href, "/events/valorant");
  assert.equal(collaboratorsForEvent("valorant-december-2026")[0], ppp);
  assert.deepEqual(collaboratorsForEvent("rocket-league-december-2026"), []);
  assert.equal(getCollaborator("unapproved-company"), undefined);
  assert.equal(new Set(collaborators.map(row => row.slug)).size, collaborators.length);
});

test("collaboration assets exist locally and social links are explicit direct HTTPS destinations", () => {
  const ppp = collaborators[0];
  assert.ok(fs.statSync(path.join(__dirname, "../public", ppp.artwork)).size > 0);
  assert.match(ppp.artworkAlt, /XP.*Powerpuff.*Xenon/);
  for (const asset of [ppp.logo, ppp.awareness.poster]) assert.ok(fs.statSync(path.join(__dirname, "../public", asset)).size > 0);
  assert.match(ppp.awareness.message, /gender-based violence and femicide/);
  assert.match(ppp.awareness.message, /Enough Is Enough/);
  assert.equal(ppp.socials.find(link => link.label === "PPP Discord").url, "https://discord.gg/xcbdRqGMcg");
  assert.equal(ppp.socials.find(link => link.label === "All PPP links").url, "https://linktr.ee/powerpuffpotatoes7");
  for (const social of ppp.socials) {
    const url = new URL(social.url); assert.equal(url.protocol, "https:"); assert.equal(url.username, ""); assert.equal(url.password, "");
  }
});

test("public organiser labels append confirmed event collaborators without editing stored settings", () => {
  const current = ["Xenon Community", "Xenon Competitive"];
  assert.deepEqual(eventOrganisers("valorant-december-2026", current), [...current, "Powerpuff Potatoes (PPP)"]);
  assert.deepEqual(eventOrganisers("rocket-league-december-2026", current), current);
  assert.deepEqual(current, ["Xenon Community", "Xenon Competitive"]);
  assert.equal(eventOrganisers("valorant-december-2026", ["Powerpuff Potatoes (PPP)"]).length, 1);
});
