const test = require("node:test"), assert = require("node:assert/strict"), React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
const load = require("./load-typescript.cjs");
const { AvailabilityForm } = load("app/meet/[id]/AvailabilityForm.tsx");
const now = Math.floor(Date.now() / 1800000) * 1800000, at = now + 86400000;
const names = ["Killer", "Stormi", "Sparky"];
function render(viewer, own = {}) {
  return renderToStaticMarkup(React.createElement(AvailabilityForm, { id: "a".repeat(24), userId: String(100000000000000000n + BigInt(viewer)), token: "private-token-must-not-render",
    initialSlots: [], initialTimezone: "UTC", initialResponded: false, windowStart: now, windowEnd: now + 14 * 86400000, serverNow: now, status: "collecting", scheduledAt: null, channelUrl: null,
    sharedParticipants: names.map((name,index) => ({ key: `person-${index}`, name, own: viewer === index, responded: true, slots: [at] })), ...own }));
}
const legend = (html) => html.match(/<ul aria-label="Participant availability legend"[^>]*>(.*?)<\/ul>/s)[1];
test("an invited person sees themselves in the full roster with a clear You label", () => {
  const html = render(1), list = legend(html);
  for (const name of names) assert.ok(list.includes(name), `${name} should be listed for Stormi`);
  assert.match(list, /Stormi \(You\)/); assert.match(html, /Responding as/);
  assert.ok(!html.includes("private-token-must-not-render"));
});
test("everyone sees the same numbered participant markers regardless of whose private invitation they open", () => {
  const markers = names.map((_, viewer) => [...legend(render(viewer)).matchAll(/<li[^>]*>(.*?)<\/li>/gs)].map(([,row]) => ({ color: row.match(/background-color:([^";]+)/)[1], number: row.match(/>(\d+)<\/span>/)[1] })));
  for (const view of markers) assert.deepEqual(view, markers[0]);
  assert.deepEqual(markers[0].map((p) => p.number), ["1","2","3"]);
});
test("the viewer's legend reflects their own saved response instead of another participant's state", () => {
  assert.match(legend(render(1,{initialResponded:true})), /Stormi \(You\).*No suitable times/);
  assert.match(legend(render(1,{initialResponded:true,initialSlots:[at]})), /Stormi \(You\).*Availability saved/);
});
test("owner overrides are disclosed without presenting an ignored person as excluded", () => {
  for (const mode of ["ignored", "entered"]) {
    const html = render(1, { sharedParticipants: names.map((name,index) => ({ key: `person-${index}`, name, own: index === 1, responded: true, slots: [at], ownerMode: index === 1 ? mode : undefined })) });
    assert.match(legend(html), mode === "ignored" ? /Times ignored by owner; still attending/ : /Owner-entered times/);
    assert.match(html, mode === "ignored" ? /You are still expected to attend/ : /server owner entered these times/);
  }
});
