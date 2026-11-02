const test = require("node:test");
const assert = require("node:assert/strict");
const loadTypeScript = require("./load-typescript.cjs");

const key = "NEXT_PUBLIC_DISCORD_URL";
const original = process.env[key];
test.after(() => {
  if (original === undefined) delete process.env[key];
  else process.env[key] = original;
});

function loadInvite(value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  return loadTypeScript("lib/public-links.ts").DISCORD_INVITE_URL;
}

test("the shared Discord invite accepts only public Discord invite URLs", () => {
  assert.equal(loadInvite("https://discord.gg/2XwuujbuNT"), "https://discord.gg/2XwuujbuNT");
  assert.equal(loadInvite("https://discord.com/invite/xenon"), "https://discord.com/invite/xenon");
  assert.equal(loadInvite("javascript:alert(1)"), "https://discord.gg/2XwuujbuNT");
  assert.equal(loadInvite("https://example.com/invite/xenon"), "https://discord.gg/2XwuujbuNT");
  assert.equal(loadInvite(undefined), "https://discord.gg/2XwuujbuNT");
});
