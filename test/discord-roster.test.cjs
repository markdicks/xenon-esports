const test = require("node:test");
const assert = require("node:assert/strict");
const loadTypeScript = require("./load-typescript.cjs");

const definitions = loadTypeScript("data/roles.ts");
const roster = loadTypeScript("lib/discord-roster.ts", {
  "@/data/roles": definitions,
  "next/cache": { unstable_cache: (callback) => callback },
});

test("staff role cards use Discord nicknames and role assignments as their source of truth", async (t) => {
  const originalFetch = global.fetch;
  const originalBotUrl = process.env.DISCORD_BOT_URL;
  const originalToken = process.env.WEBSITE_BOT_TOKEN;
  t.after(() => {
    global.fetch = originalFetch;
    if (originalBotUrl === undefined) delete process.env.DISCORD_BOT_URL;
    else process.env.DISCORD_BOT_URL = originalBotUrl;
    if (originalToken === undefined) delete process.env.WEBSITE_BOT_TOKEN;
    else process.env.WEBSITE_BOT_TOKEN = originalToken;
  });

  process.env.DISCORD_BOT_URL = "https://xenon-discord-bot.onrender.com";
  process.env.WEBSITE_BOT_TOKEN = "shared-secret";
  global.fetch = async (url, options) => {
    assert.equal(url.href, "https://xenon-discord-bot.onrender.com/api/website/roster");
    assert.equal(options.headers.Authorization, "Bearer shared-secret");
    return Response.json({
      guild: { id: "123", name: "Xenon HQ" },
      syncedAt: "2026-10-26T10:00:00.000Z",
      roles: [
        { id: "founder", name: "Founder", exists: true, members: [{ id: "1", nickname: "Sparky XE", username: "sparky" }] },
        { id: "content-lead", name: "Content Lead", exists: true, members: [] },
      ],
    });
  };

  const roles = await roster.getStaffRoles();
  const founder = roles.find((role) => role.id === "founder");
  const content = roles.find((role) => role.id === "content-lead");

  assert.equal(founder.status, "closed");
  assert.equal(founder.holders[0].nickname, "Sparky XE");
  assert.match(founder.description, /Held by Sparky XE/);
  assert.equal(content.status, "open");
});

test("the website roster retries a transient bot failure before marking availability unavailable", async (t) => {
  const originalFetch = global.fetch;
  const originalBotUrl = process.env.DISCORD_BOT_URL;
  const originalToken = process.env.WEBSITE_BOT_TOKEN;
  t.after(() => {
    global.fetch = originalFetch;
    if (originalBotUrl === undefined) delete process.env.DISCORD_BOT_URL;
    else process.env.DISCORD_BOT_URL = originalBotUrl;
    if (originalToken === undefined) delete process.env.WEBSITE_BOT_TOKEN;
    else process.env.WEBSITE_BOT_TOKEN = originalToken;
  });
  process.env.DISCORD_BOT_URL = "https://xenon-discord-bot.onrender.com";
  process.env.WEBSITE_BOT_TOKEN = "shared-secret";
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    if (calls === 1) return new Response(null, { status: 503 });
    return Response.json({ guild: { id: "123", name: "Xenon HQ" }, syncedAt: "2026-10-26T10:00:00.000Z", roles: [] });
  };
  const result = await roster.getWebsiteRoster();
  assert.equal(result.source, "discord");
  assert.equal(calls, 2);
});
