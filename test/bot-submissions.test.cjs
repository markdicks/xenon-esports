const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function loadTypeScript(file, overrides) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  const resolve = (name) => Object.hasOwn(overrides, name) ? overrides[name] : require(name);
  new Function("require", "module", "exports", compiled)(resolve, loaded, loaded.exports);
  return loaded.exports;
}

test("overlapping bot polls claim one lease and return all application fields", async () => {
  let claimed = false;
  const reference = "XEN-APP-A7K42P";
  const pool = {
    query: async () => [[{ public_reference: reference, submission_type: "application" }]],
    execute: async (sql, params) => {
      if (sql.includes("INSERT IGNORE")) return [{ affectedRows: 0 }];
      if (sql.includes("UPDATE")) {
        const affectedRows = claimed ? 0 : 1;
        claimed = true;
        assert.equal(params[1], reference);
        return [{ affectedRows }];
      }
      return [[{ public_reference: reference, discord_username: "applicant",
        unpaid_volunteer_acknowledgement: 1, delivered_user_ids: '["111111111111111111"]' }]];
    },
  };
  const { claimBotSubmissions } = loadTypeScript("lib/bot-submissions.ts", { "@/lib/db": { getDbPool: () => pool } });
  const batches = await Promise.all([claimBotSubmissions(), claimBotSubmissions()]);
  const submissions = batches.flat();
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].fields.length, 13);
  assert.equal(submissions[0].fields.find((field) => field.label === "Email").value, "Not provided");
  assert.equal(submissions[0].fields.find((field) => field.label === "Unpaid volunteer acknowledgement").value, "Yes");
  assert.deepEqual(submissions[0].deliveredUserIds, ["111111111111111111"]);
  assert.match(submissions[0].leaseToken, /^[a-f0-9-]{36}$/);
});

test("contact submissions expose only contact fields", async () => {
  const pool = {
    query: async () => [[{ public_reference: "XEN-CON-A7K42P", submission_type: "contact" }]],
    execute: async (sql) => sql.includes("SELECT")
      ? [[{ name: "Enquirer", message: "Contact message", delivered_user_ids: null }]]
      : [{ affectedRows: 1 }],
  };
  const { claimBotSubmissions } = loadTypeScript("lib/bot-submissions.ts", { "@/lib/db": { getDbPool: () => pool } });
  const [submission] = await claimBotSubmissions();
  assert.deepEqual(submission.fields.map((field) => field.label), ["Name", "Discord username", "Email", "Subject", "Message"]);
  assert.deepEqual(submission.deliveredUserIds, []);
});

test("bot API rejects missing or incorrect secrets without loading submissions", async (t) => {
  const original = process.env.WEBSITE_BOT_TOKEN;
  t.after(() => { if (original === undefined) delete process.env.WEBSITE_BOT_TOKEN; else process.env.WEBSITE_BOT_TOKEN = original; });
  let calls = 0;
  const api = loadTypeScript("app/api/bot/submissions/route.ts", {
    "@/lib/bot-submissions": { claimBotSubmissions: async () => { calls++; return []; } },
  });
  delete process.env.WEBSITE_BOT_TOKEN;
  assert.equal((await api.GET(new Request("https://xenon.example/api/bot/submissions"))).status, 401);
  process.env.WEBSITE_BOT_TOKEN = "test-secret";
  const unauthorized = await api.GET(new Request("https://xenon.example/api/bot/submissions", {
    headers: { Authorization: "Bearer wrong-secret" },
  }));
  assert.equal(unauthorized.status, 401);
  assert.equal(calls, 0);
  const authorized = await api.GET(new Request("https://xenon.example/api/bot/submissions", {
    headers: { Authorization: "Bearer test-secret" },
  }));
  assert.equal(authorized.status, 200);
  assert.equal(authorized.headers.get("cache-control"), "no-store");
  assert.equal(calls, 1);
});

test("delivery acknowledgements validate input and reject stale leases", async (t) => {
  const original = process.env.WEBSITE_BOT_TOKEN;
  t.after(() => { if (original === undefined) delete process.env.WEBSITE_BOT_TOKEN; else process.env.WEBSITE_BOT_TOKEN = original; });
  process.env.WEBSITE_BOT_TOKEN = "test-secret";
  const receipts = [];
  const api = loadTypeScript("app/api/bot/submissions/route.ts", {
    "@/lib/bot-submissions": { recordBotDelivery: async (value) => { receipts.push(value); return false; } },
  });
  const request = (body) => new Request("https://xenon.example/api/bot/submissions", {
    method: "POST", headers: { Authorization: "Bearer test-secret", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal((await api.POST(request({ reference: "invalid" }))).status, 400);
  assert.equal(receipts.length, 0);
  const receipt = { reference: "XEN-CON-A7K42P", leaseToken: "a072081d-98ef-4c23-ac98-5599813db806",
    deliveredUserIds: ["111111111111111111"], complete: false, release: false };
  assert.equal((await api.POST(request(receipt))).status, 409);
  assert.deepEqual(receipts[0], receipt);
  assert.equal((await api.POST(request({ ...receipt, complete: true, release: false }))).status, 400);
});

test("delivery receipt query binds references and retains the lease for progress updates", async () => {
  let recorded;
  const { recordBotDelivery } = loadTypeScript("lib/bot-submissions.ts", {
    "@/lib/db": { getDbPool: () => ({ execute: async (sql, params) => {
      recorded = { sql, params };
      return [{ affectedRows: 1 }];
    } }) },
  });
  const result = await recordBotDelivery({ reference: "XEN-APP-A7K42P", leaseToken: "lease-token",
    deliveredUserIds: ["111111111111111111", "111111111111111111"], complete: false, release: false });
  assert.equal(result, true);
  assert.equal(recorded.sql.includes("XEN-APP"), false);
  assert.match(recorded.sql, /lease_token = IF\(\?, NULL, lease_token\)/);
  assert.deepEqual(recorded.params, ['["111111111111111111"]', false, false, false, false, "XEN-APP-A7K42P", "lease-token"]);
});
