const test = require("node:test"), assert = require("node:assert/strict");
const load = require("./load-typescript.cjs");
const { bracketConfigSchema, bracketStateSchema, bracketMatches, resolveBracket, applyBracketScore } = load("lib/bracket-contract.ts");
function config(format = "single", count = 8) { return { name: "TEST bracket", format, entrants: Array.from({ length: count }, (_, i) => `TEST team ${i + 1}`), roundBestOf: 3, finalBestOf: 5 }; }
const state = (format, count) => ({ ...config(format, count), scores: {} });
function simulate(initial, pick) {
  let s = initial, played = 0; const losses = new Map(), pairs = [];
  while (!resolveBracket(s).champion && played < 70) {
    const m = resolveBracket(s).matches.find((m) => m.needed && m.ready && !m.complete);
    assert.ok(m, `Bracket stalled: ${s.format} ${s.entrants.length}`);
    assert.ok(m.teamA && m.teamB); assert.notEqual(m.teamA.id, m.teamB.id);
    assert.ok((losses.get(m.teamA.id) || 0) < 2 && (losses.get(m.teamB.id) || 0) < 2);
    const wins = Math.ceil(m.bestOf / 2), aWins = pick(m, played++), loser = aWins ? m.teamB : m.teamA;
    losses.set(loser.id, (losses.get(loser.id) || 0) + 1); pairs.push([m.teamA.id, m.teamB.id]);
    s = applyBracketScore(s, m.id, aWins ? { a: wins, b: 0 } : { a: 0, b: wins }).state;
  }
  assert.ok(resolveBracket(s).champion); return { s, played, losses, pairs };
}
test("single and double elimination finish for 2–32 seeds, including byes and both grand-final outcomes", () => {
  for (const format of ["single", "double"]) for (let count = 2; count <= 32; count++) for (let policy = 0; policy < 3; policy++) {
    const result = simulate(state(format, count), (m, i) => policy === 0 || (policy === 2 && (i % 3 === 0 || m.teamA.seed < m.teamB.seed)));
    const champion = resolveBracket(result.s).champion;
    assert.equal(result.played, format === "single" ? count - 1 : count * 2 - 2 + Number(Boolean(result.s.scores.gr)));
    for (let seed = 1; seed <= count; seed++) assert.equal(result.losses.get(`s${seed}`) || 0, champion.id === `s${seed}` ? format === "double" && result.s.scores.gr ? 1 : 0 : format === "double" ? 2 : 1);
    const definitions = bracketMatches(result.s), prior = new Set();
    for (const m of definitions) { assert.ok(!prior.has(m.id)); for (const source of [m.a, m.b]) if (!("seed" in source)) assert.ok(prior.has(source.winner || source.loser)); prior.add(m.id); }
  }
});
test("unconfirmed seeds never count as byes or advance opponents", () => {
  const s = state("double", 3); s.entrants[1] = "";
  const resolved = resolveBracket(s);
  assert.equal(resolved.matches.find((m) => m.id === "u1m1").winner.id, "s1");
  assert.equal(resolved.matches.find((m) => m.id === "u1m2").ready, false);
  assert.equal(resolved.champion, null);
  assert.throws(() => applyBracketScore(s, "u1m2", { a: 2, b: 0 }), /Both entrants/);
});
test("RSC six-seed graph and series lengths match the supplied rules, including a conditional reset", () => {
  const s = { ...state("rsc-six", 6), roundBestOf: 5, finalBestOf: 7 };
  const m = bracketMatches(s); assert.deepEqual(m.slice(0, 3).map((m) => [m.id, m.a.seed, m.b.seed, m.bestOf]), [["lq1", 3, 6, 5], ["lq2", 4, 5, 5], ["uf", 1, 2, 7]]);
  for (const reset of [false, true]) {
    const result = simulate(s, (m) => m.id !== "gf" || !reset), done = resolveBracket(result.s);
    assert.equal(result.played, reset ? 7 : 6); assert.equal(Boolean(result.s.scores.gr), reset); assert.equal(done.matches.find((m) => m.id === "gr").needed, reset);
  }
});
test("only completed valid series advance, and scores cannot bypass pending feeder matches", () => {
  let s = state("single", 4);
  s = applyBracketScore(s, "u1m1", { a: 2, b: null }).state;
  assert.equal(resolveBracket(s).matches[0].complete, false);
  assert.equal(resolveBracket(s).matches[2].ready, false);
  assert.throws(() => applyBracketScore(s, "u2m1", { a: 3, b: 0 }), /Both entrants/);
  for (const score of [{ a: 2, b: 2 }, { a: -1, b: 0 }, { a: 3, b: 0 }, { a: 0.5, b: 0 }]) assert.throws(() => applyBracketScore(s, "u1m1", score));
  for (const scores of [{ nonsense: { a: 1, b: 0 } }, { u2m1: { a: 3, b: 0 } }]) assert.equal(bracketStateSchema.safeParse({ ...s, scores }).success, false);
  assert.equal(bracketStateSchema.safeParse({ ...state("double", 2), scores: { gr: { a: 3, b: 0 } } }).success, false);
});
test("correcting a winner clears affected downstream results and keeps independent results", () => {
  const complete = simulate(state("double", 8), () => true).s;
  const sameWinner = applyBracketScore(complete, "u1m1", { a: 2, b: 1 });
  assert.deepEqual(sameWinner.cleared, []); assert.ok(resolveBracket(sameWinner.state).champion);
  const correction = applyBracketScore(complete, "u1m1", { a: 0, b: 2 });
  assert.ok(correction.cleared.includes("u2m1")); assert.ok(correction.cleared.includes("l1m1")); assert.ok(correction.cleared.includes("gf"));
  assert.deepEqual(correction.state.scores.u1m2, complete.scores.u1m2); assert.deepEqual(correction.state.scores.u2m2, complete.scores.u2m2);
  assert.equal(resolveBracket(correction.state).champion, null); assert.ok(bracketStateSchema.safeParse(correction.state).success);
});
test("removing an earlier result also invalidates a completed reset", () => {
  const complete = simulate(state("double", 2), () => false).s;
  assert.ok(complete.scores.gr);
  const correction = applyBracketScore(complete, "gf", { a: null, b: null });
  assert.deepEqual(correction.cleared, ["gr"]); assert.equal(resolveBracket(correction.state).champion, null);
});
test("configuration restricts formats and sizes and accepts blank seeds but no duplicate names", () => {
  for (const change of [{ entrants: ["A", " a "] }, { entrants: ["Ａ", "A"] }, { format: "round-robin" }, { format: "rsc-six" }, { name: "a\nb" }, { finalBestOf: 4 }]) assert.equal(bracketConfigSchema.safeParse({ ...config(), ...change }).success, false);
  assert.ok(bracketConfigSchema.safeParse({ ...config(), entrants: ["", ""] }).success);
});
