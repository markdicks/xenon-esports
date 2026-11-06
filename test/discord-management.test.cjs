const test = require("node:test");
const assert = require("node:assert/strict");
const loadTypeScript = require("./load-typescript.cjs");
const config = { pillars: ["content", "operations", "competitive", "creators", "community", "staff"].map((key) => ({
  key, leadRoleId: null, targets: [], permissions: [], subroles: [], pendingChannels: [],
})) };

test("management API requires the internal bot secret and validates scope documents", async (t) => {
  const previous = process.env.WEBSITE_BOT_TOKEN;
  t.after(() => { if (previous === undefined) delete process.env.WEBSITE_BOT_TOKEN; else process.env.WEBSITE_BOT_TOKEN = previous; });
  process.env.WEBSITE_BOT_TOKEN = "management-test";
  const management = loadTypeScript("lib/discord-management.ts", { "@/lib/db": { getDbPool: () => { throw new Error("Unexpected DB access"); } } });
  let writes = 0;
  const api = loadTypeScript("app/api/bot/management/route.ts", {
    "@/lib/discord-management": { ...management, getManagementConfig: async () => ({ revision: null, config: null }),
      saveManagementConfig: async () => { writes++; return writes === 1 ? "0899fdb8-5e85-45fb-b399-5d77523f8300" : null; } },
  });
  assert.equal((await api.GET(new Request("https://xenon.example/api/bot/management?guildId=111111111111111111"))).status, 401);
  const request = (body) => new Request("https://xenon.example/api/bot/management", {
    method: "PUT", headers: { Authorization: "Bearer management-test" }, body: JSON.stringify(body),
  });
  const body = { guildId: "111111111111111111", actorId: "222222222222222222", revision: null, config };
  assert.equal((await api.PUT(request(body))).status, 200);
  assert.equal((await api.PUT(request(body))).status, 409);
  const unsafe = structuredClone(body); unsafe.config.pillars[0].permissions = ["Administrator"];
  assert.equal((await api.PUT(request(unsafe))).status, 400);
  const duplicate = structuredClone(body); duplicate.config.pillars[1].key = "content";
  assert.equal((await api.PUT(request(duplicate))).status, 400);
  const missingStaff = structuredClone(body); missingStaff.config.pillars.pop();
  assert.equal((await api.PUT(request(missingStaff))).status, 400);
  const overLimit = structuredClone(body); overLimit.config.pillars[0].subroles = Array.from({ length: 6 }, () => ({ id: "333333333333333333", name: "Test", permissions: [] }));
  assert.equal((await api.PUT(request(overLimit))).status, 400);
  assert.equal(writes, 2);
});

test("legacy five-pillar settings load with Staff unassigned without changing existing access", async () => {
  const legacy = structuredClone(config); legacy.pillars.pop();
  Object.assign(legacy.pillars[0], { leadRoleId: "111111111111111111", targets: [{ id: "222222222222222222", type: "category" }],
    permissions: ["ViewChannel"], subroles: [{ id: "333333333333333333", name: "Editors", permissions: ["ViewChannel"] }] });
  const pool = { execute: async () => [[{ revision: "stored-revision", configuration: JSON.stringify(legacy) }]] };
  const management = loadTypeScript("lib/discord-management.ts", { "@/lib/db": { getDbPool: () => pool } });
  const result = await management.getManagementConfig("444444444444444444");
  assert.equal(result.revision, "stored-revision");
  assert.deepEqual(result.config.pillars.slice(0, 5), legacy.pillars);
  assert.deepEqual(result.config.pillars[5], config.pillars[5]);
});

test("saved Staff permissions survive reads and malformed legacy configurations fail closed", async () => {
  const saved = structuredClone(config);
  Object.assign(saved.pillars[5], { leadRoleId: "111111111111111111", targets: [{ id: "222222222222222222", type: "channel" }], permissions: ["ViewChannel"] });
  const pool = { execute: async () => [[{ revision: "stored-revision", configuration: saved }]] };
  const management = loadTypeScript("lib/discord-management.ts", { "@/lib/db": { getDbPool: () => pool } });
  assert.deepEqual((await management.getManagementConfig("444444444444444444")).config, saved);
  saved.pillars.pop(); saved.pillars[1].key = "content";
  await assert.rejects(management.getManagementConfig("444444444444444444"));
});

test("management storage uses parameterized SQL and revision-based compare-and-swap", async () => {
  const queries = [];
  const pool = { execute: async (sql, params) => { queries.push([sql, params]); return [{ affectedRows: queries.length === 1 ? 1 : 0 }]; } };
  const management = loadTypeScript("lib/discord-management.ts", { "@/lib/db": { getDbPool: () => pool } });
  const saved = await management.saveManagementConfig("111111111111111111", null, config, "222222222222222222");
  assert.match(saved, /^[a-f0-9-]{36}$/);
  assert.match(queries[0][0], /INSERT IGNORE.*VALUES \(\?, \?, \?, \?\)/);
  assert.equal(queries[0][1][2], JSON.stringify(config));
  assert.equal(await management.saveManagementConfig("111111111111111111", saved, config, "222222222222222222"), null);
  assert.match(queries[1][0], /WHERE guild_id = \? AND revision = \?/);
  assert.equal(queries[1][1][4], saved);
});
