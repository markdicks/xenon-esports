const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-typescript.cjs");
const api = load("lib/bot-api-errors.ts");
const ref = "0899fdb8-5e85-45fb-b399-5d77523f8300", secret = "private-password-and-SQL";
const request = () => new Request("https://xenon.example/api/bot/role-links", { headers: { "X-Xenon-Request-Id": ref } });

test("storage errors distinguish schema, permissions, connection and data failures without exposing SQL or secrets", () => {
  for (const [raw, code] of [["ER_NO_SUCH_TABLE", "BOT_SCHEMA_MISMATCH"], ["ER_BAD_FIELD_ERROR", "BOT_SCHEMA_MISMATCH"],
    ["ER_TABLEACCESS_DENIED_ERROR", "BOT_DATABASE_PERMISSIONS"], ["ECONNREFUSED", "BOT_DATABASE_CONNECTION"],
    ["ER_PARSE_ERROR", "BOT_DATABASE_QUERY"], [secret, "BOT_STORAGE_UNAVAILABLE"], ["__proto__", "BOT_STORAGE_UNAVAILABLE"]]) {
    const failure = api.botStorageFailure(Object.assign(Error(secret), { code: raw, sql: secret, sqlMessage: secret }), "role-links", "read", request());
    assert.equal(failure.body.code, code); assert.equal(failure.body.requestId, ref);
    assert.equal(failure.diagnostic.requestId, ref); assert.ok(!JSON.stringify(failure).includes(secret));
    if (code === "BOT_STORAGE_UNAVAILABLE") assert.equal(failure.diagnostic.databaseCode, undefined);
  }
  assert.equal(api.botStorageFailure(new SyntaxError(secret), "availability", "profile", request()).body.code, "BOT_SAVED_DATA_INVALID");
  assert.equal(api.botStorageFailure(Error(secret), "availability", secret, request()).diagnostic.action, "unknown");
});

test("only a valid request UUID is used for log correlation", () => {
  const invalid = new Request("https://xenon.example", { headers: { "X-Xenon-Request-Id": secret } });
  assert.match(api.botRequestId(invalid), /^[a-f0-9-]{36}$/);
  assert.equal(api.botRequestId(request()), ref);
});

test("role-link failures are authenticated, correlated and sanitized before returning or logging", async (t) => {
  const prior = process.env.WEBSITE_BOT_TOKEN; process.env.WEBSITE_BOT_TOKEN = "test-token";
  t.after(() => { if (prior === undefined) delete process.env.WEBSITE_BOT_TOKEN; else process.env.WEBSITE_BOT_TOKEN = prior; });
  const logs = []; t.mock.method(console, "error", (...args) => logs.push(args));
  let reads = 0;
  const route = load("app/api/bot/role-links/route.ts", { "@/lib/discord-role-links": {
    getDiscordRoleLinks: async () => { reads++; throw Object.assign(Error(secret), { code: "ER_NO_SUCH_TABLE", sql: secret }); },
  } });
  const make = (token) => new Request("https://xenon.example/api/bot/role-links?guildId=123456789012345678", { headers: { Authorization: `Bearer ${token}`, "X-Xenon-Request-Id": ref } });
  assert.equal((await route.GET(make("wrong"))).status, 401); assert.equal(reads, 0); assert.equal(logs.length, 0);
  const response = await route.GET(make("test-token")), body = await response.json();
  assert.equal(response.status, 503); assert.equal(body.code, "BOT_SCHEMA_MISMATCH"); assert.equal(body.requestId, ref);
  assert.equal(logs[0][1].requestId, ref); assert.ok(!JSON.stringify([body, logs]).includes(secret));
});
