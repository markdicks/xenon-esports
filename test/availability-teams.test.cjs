const test = require("node:test"), assert = require("node:assert/strict"), load = require("./load-typescript.cjs");
const contract = load("lib/availability-contract.ts");
const revision = "48979db8-5e85-45fb-b399-5d77523f8300", next = "0899fdb8-5e85-45fb-b399-5d77523f8300";
const guildId = "100000000000000001", actorId = "100000000000000002", team = { roleId: "100000000000000030", name: "Alpha", color: "#4fffd8" };
function service(initial, conflict = false) {
  let state = initial; const saves = [];
  const api = load("lib/availability-teams.ts", { "@/lib/discord-management": {
    getManagementConfig: async () => structuredClone(state),
    saveManagementConfig: async (...args) => { saves.push(args); if (conflict || args[1] !== state.revision) return null; state = { revision: next, config: args[2] }; return next; },
  } });
  return { api, saves, state: () => state };
}
test("team groups are stored in the existing management document without losing pillar or channel configuration", async () => {
  const pillars = [{ key: "competitive", leadRoleId: "100000000000000005", teams: [{ name: "Existing competitive team" }], targets: [{ id: "100000000000000010" }] }];
  const f = service({ revision, config: { pillars } });
  assert.deepEqual(await f.api.getAvailabilityTeams(guildId), { revision, teams: [] });
  const result = await f.api.saveAvailabilityTeams(guildId, actorId, revision, [team]);
  assert.equal(result.revision, next); assert.deepEqual(f.state().config.pillars, pillars);
  assert.deepEqual(f.state().config.availabilityTeams, [team]); assert.equal(f.saves[0][3], actorId);
});
test("stale team edits cannot overwrite another staff member's management changes", async () => {
  const f = service({ revision: next, config: { pillars: [] } });
  await assert.rejects(f.api.saveAvailabilityTeams(guildId, actorId, revision, [team]), (error) => error.code === "AVAILABILITY_CONFLICT");
  assert.equal(f.saves.length, 0);
  const concurrent = service({ revision, config: { pillars: [] } }, true);
  await assert.rejects(concurrent.api.saveAvailabilityTeams(guildId, actorId, revision, [team]), (error) => error.code === "AVAILABILITY_CONFLICT");
});
test("first team save creates compatible management defaults, and only valid role-group fields are accepted", async () => {
  const f = service({ revision: null, config: null });
  await f.api.saveAvailabilityTeams(guildId, actorId, null, [team]);
  assert.equal(f.state().config.pillars.length, 6);
  const management = load("lib/discord-management.ts"); assert.equal(management.managementSchema.safeParse(f.state().config).success, true);
  for (const teams of [[team, team], [{ ...team, color: "#fff;background:red" }], [{ ...team, roleId: "role-name" }], [{ ...team, password: "no" }]]) {
    assert.equal(contract.availabilityTeamsSchema.safeParse(teams).success, false);
  }
});
test("team API checks authentication and leadership before storage, and rejects extra ownership fields", async () => {
  let writes = 0;
  const route = load("app/api/bot/availability/route.ts", { "@/lib/meeting-api": { authorizeBot: (request) => request.headers.get("Authorization") === "Bearer test",
    meetingJson: (value, status = 200) => Response.json(value, { status }), readMeetingJson: (request) => request.json() },
    "@/lib/availability-teams": { getAvailabilityTeams: async () => ({ revision, teams: [team] }), saveAvailabilityTeams: async () => { writes++; return { revision: next, teams: [team] }; } } });
  const identity = { guildId, actorId, member: false, viewer: true };
  const request = (body, authenticated = true) => new Request("https://example.test/api/bot/availability", { method: "POST", headers: authenticated ? { Authorization: "Bearer test" } : {}, body: JSON.stringify(body) });
  assert.equal((await route.POST(request({}, false))).status, 401);
  assert.equal((await route.POST(request({ ...identity, viewer: false, action: "save-teams", revision, teams: [team] }))).status, 403);
  assert.equal((await route.POST(request({ ...identity, action: "teams", ownerId: actorId }))).status, 400);
  assert.equal((await route.POST(request({ ...identity, action: "save-teams", revision, teams: [team] }))).status, 200);
  assert.equal(writes, 1);
});
