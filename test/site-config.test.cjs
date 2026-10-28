const test = require("node:test");
const assert = require("node:assert/strict");
const loadTypeScript = require("./load-typescript.cjs");

const validation = loadTypeScript("lib/site-config-validation.ts");
const actor = { discordId: "123456789012345678", name: "Test Leader" };
const goodUrl = "https://tiktok.com/@xenon";

function loadService(pool) {
  return loadTypeScript("lib/site-config.ts", {
    "server-only": {}, "@/lib/db": { getDbPool: () => pool },
    "@/lib/site-config-validation": validation,
  });
}

// Transactional fake: an INSERT/upsert acquires the same per-key lock used by
// MySQL, including when there was no row before the first concurrent write.
function database() {
  const values = new Map(), audits = [], calls = [];
  let queue = Promise.resolve(), failAudit = false;
  return {
    values, audits, calls, failAudit: () => { failAudit = true; },
    async execute(sql, params) {
      calls.push({ sql, params });
      return [[...values].filter(([key]) => params.includes(key))
        .map(([config_key, config_value]) => ({ config_key, config_value }))];
    },
    async getConnection() {
      let unlock, key, pendingValue, pendingAudit;
      const finish = () => { if (unlock) { unlock(); unlock = null; } };
      return {
        async beginTransaction() {},
        async execute(sql, params) {
          calls.push({ sql, params });
          if (sql.includes("INSERT INTO site_config")) {
            assert.match(sql, /ON DUPLICATE KEY UPDATE/);
            const before = queue;
            queue = new Promise((resolve) => { unlock = resolve; });
            await before;
            key = params[0];
            return [{}];
          }
          if (sql.includes("FOR UPDATE")) return [[{ config_key: key, config_value: values.get(key) ?? null }]];
          if (sql.includes("UPDATE site_config")) { pendingValue = params[0]; return [{}]; }
          if (sql.includes("INSERT INTO config_audit")) {
            if (failAudit) throw new Error("private database details");
            pendingAudit = params;
            return [{}];
          }
          throw new Error("Unexpected query");
        },
        async commit() { values.set(key, pendingValue); audits.push(pendingAudit); finish(); },
        async rollback() { finish(); },
        release() { finish(); },
      };
    },
  };
}

test("only public HTTPS channel/profile/invite links for the selected platform are accepted", () => {
  const urls = {
    "social.twitch": "https://www.twitch.tv/xenon",
    "social.youtube": "https://www.youtube.com/@xenon",
    "social.tiktok": goodUrl,
    "social.instagram": "https://instagram.com/xenon",
    "discord.invite": "https://discord.gg/xenon",
  };
  for (const [key, value] of Object.entries(urls)) {
    assert.equal(validation.configChangeSchema.safeParse({ key, value, actor }).success, true);
    assert.equal(validation.normalizeConfigValue(key, null), null);
  }
  for (const value of ["", "javascript:alert(1)", "http://tiktok.com/@xenon", "https://tiktok.com.evil.test/@xenon",
    "https://user:secret@tiktok.com/@xenon", "https://tiktok.com:8443/@xenon", "https://tiktok.com/@xenon?token=secret",
    "https://tiktok.com/@xenon#secret", "https://instagram.com/xenon", "https://tiktok.com/@xenon\n"]) {
    assert.equal(validation.configChangeSchema.safeParse({ key: "social.tiktok", value, actor }).success, false, value);
  }
  for (const key of ["DB_PASSWORD", "social.secret", "__proto__", "Social.tiktok"]) {
    assert.equal(validation.configChangeSchema.safeParse({ key, value: goodUrl, actor }).success, false);
  }
  assert.equal(validation.configChangeSchema.safeParse({ key: "social.tiktok", value: goodUrl, actor: { ...actor, discordId: "name" } }).success, false);
  assert.equal(validation.configChangeSchema.safeParse({ key: "social.tiktok", value: goodUrl, actor, sql: "DROP TABLE" }).success, false);
});

test("set, overwrite, removal and no-op changes each commit an accurate parameterized audit", async () => {
  const db = database(), service = loadService(db);
  const author = { ...actor, name: "O'Neil" };
  await service.setConfig("social.tiktok", goodUrl, author);
  await service.setConfig("social.tiktok", "https://tiktok.com/@newxenon", actor);
  await service.setConfig("social.tiktok", null, actor);
  await service.setConfig("social.tiktok", null, actor);
  assert.equal(db.values.get("social.tiktok"), null);
  assert.deepEqual(db.audits, [
    ["social.tiktok", null, goodUrl, author.discordId, author.name],
    ["social.tiktok", goodUrl, "https://tiktok.com/@newxenon", actor.discordId, actor.name],
    ["social.tiktok", "https://tiktok.com/@newxenon", null, actor.discordId, actor.name],
    ["social.tiktok", null, null, actor.discordId, actor.name],
  ]);
  assert.equal(db.calls.some(({ sql }) => sql.includes(goodUrl) || sql.includes(author.name)), false);
});

test("concurrent first writes serialize their previous values; audit failures roll back the configuration", async () => {
  const db = database(), service = loadService(db);
  await Promise.all([
    service.setConfig("social.tiktok", goodUrl, actor),
    service.setConfig("social.tiktok", "https://tiktok.com/@second", actor),
  ]);
  assert.deepEqual(db.audits.map((audit) => audit.slice(1, 3)), [[null, goodUrl], [goodUrl, "https://tiktok.com/@second"]]);
  db.failAudit();
  await assert.rejects(service.setConfig("social.tiktok", null, actor));
  assert.equal(db.values.get("social.tiktok"), "https://tiktok.com/@second");
  assert.equal(db.audits.length, 2);
});

test("config reads return defaults, filter prefixes and reject unsafe manually entered values", async () => {
  const db = database(), service = loadService(db);
  db.values.set("social.tiktok", goodUrl);
  db.values.set("social.twitch", "javascript:alert(1)");
  db.values.set("discord.invite", "https://discord.gg/xenon");
  const values = await service.getConfigs("social.");
  assert.equal(values["social.tiktok"], goodUrl);
  assert.equal(values["social.twitch"], null);
  assert.equal(values["social.youtube"], null);
  assert.equal(Object.hasOwn(values, "discord.invite"), false);
  assert.equal(await service.getConfig("discord.invite"), "https://discord.gg/xenon");
  assert.deepEqual(await service.getConfigs("DB_"), {});
  await assert.rejects(service.setConfig("DB_PASSWORD", "secret", actor));
});

test("public links reflect committed changes and removals on the next read", async () => {
  const db = database(), service = loadService(db);
  const publicSocials = loadTypeScript("lib/public-socials.ts", {
    "server-only": {}, "@/data/social": loadTypeScript("data/social.ts"), "@/lib/site-config": service,
  });
  const readLink = async () => (await publicSocials.getSocialLinks()).find((link) => link.configKey === "social.tiktok").href;
  assert.equal(await readLink(), null);
  await service.setConfig("social.tiktok", goodUrl, actor);
  assert.equal(await readLink(), goodUrl);
  await service.setConfig("social.tiktok", null, actor);
  assert.equal(await readLink(), null);
  await service.setConfig("discord.invite", "https://discord.gg/xenon", actor);
  assert.equal(await publicSocials.getDiscordInvite(), "https://discord.gg/xenon");
});

test("public social components keep safe fallbacks during a database outage", async () => {
  const links = loadTypeScript("data/social.ts");
  const publicSocials = loadTypeScript("lib/public-socials.ts", {
    "server-only": {}, "@/data/social": links,
    "@/lib/site-config": { getConfigs: async () => { throw new Error("unavailable"); }, getConfig: async () => null },
  });
  assert.equal((await publicSocials.getSocialLinks()).every((link) => link.href === null), true);
  assert.equal(await publicSocials.getDiscordInvite(), null);
});

test("internal API authenticates first, bounds streamed input and hides all database errors", async (t) => {
  const original = process.env.INTERNAL_BOT_API_KEY;
  t.after(() => {
    if (original === undefined) delete process.env.INTERNAL_BOT_API_KEY;
    else process.env.INTERNAL_BOT_API_KEY = original;
  });
  process.env.INTERNAL_BOT_API_KEY = "test-internal-secret";
  let writes = 0, reads = 0, fail = false;
  const route = loadTypeScript("app/api/internal/config/route.ts", {
    "@/lib/site-config-validation": validation,
    "@/lib/site-config": {
      getConfigs: async () => { reads++; if (fail) throw new Error("DB_PASSWORD=private"); return { "social.tiktok": goodUrl }; },
      setConfig: async (key, value, changedBy) => { writes++; assert.deepEqual(changedBy, actor); if (fail) throw new Error("DB_PASSWORD=private"); },
    },
  });
  const headers = { Authorization: "Bearer test-internal-secret", "Content-Type": "application/json" };
  const request = (body, custom = headers) => new Request("https://xenon.example/api/internal/config", {
    method: "POST", headers: custom, body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const change = { key: "social.tiktok", value: goodUrl, actor };
  assert.equal((await route.GET(new Request("https://xenon.example/api/internal/config"))).status, 401);
  assert.equal((await route.POST(request(change, { Authorization: "Bearer wrong" }))).status, 401);
  assert.equal(reads + writes, 0);
  assert.equal((await route.POST(request({ ...change, key: "DB_PASSWORD" }))).status, 400);
  assert.equal((await route.POST(request("{"))).status, 400);
  assert.equal((await route.POST(request("x".repeat(5000)))).status, 413);
  assert.equal((await route.POST(request(change, { Authorization: headers.Authorization, "Content-Type": "text/plain" }))).status, 415);
  assert.equal(writes, 0);
  assert.equal((await route.POST(request(change))).status, 200);
  assert.equal((await route.POST(request({ ...change, value: null }))).status, 200);
  assert.equal(writes, 2);
  const loaded = await route.GET(new Request("https://xenon.example/api/internal/config", { headers }));
  assert.equal(loaded.headers.get("cache-control"), "no-store");
  assert.equal((await loaded.json()).configs["social.tiktok"], goodUrl);
  fail = true;
  for (const response of [await route.POST(request(change)), await route.GET(new Request("https://xenon.example/api/internal/config", { headers }))]) {
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /DB_PASSWORD|private|test-internal-secret/);
  }
  delete process.env.INTERNAL_BOT_API_KEY;
  assert.equal((await route.POST(request(change))).status, 401);
});
