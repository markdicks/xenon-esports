import { z } from "zod";
export const bracketId = z.string().regex(/^[a-f0-9]{24}$/);
const text = (max: number) => z.string().trim().max(max).refine((value) => !/[\x00-\x1f\x7f]/.test(value));
export const bracketFormats = ["single", "double", "rsc-six"] as const;
export const bracketConfigSchema = z.object({ name: text(100).min(1), format: z.enum(bracketFormats),
  entrants: z.array(text(80)).min(2).max(32), roundBestOf: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(7), z.literal(9)]),
  finalBestOf: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(7), z.literal(9)]) }).strict().superRefine((value, ctx) => {
  const names = value.entrants.filter(Boolean).map((name) => name.normalize("NFKC").toLowerCase());
  if (new Set(names).size !== names.length) ctx.addIssue({ code: "custom", message: "Use a different name for each entrant.", path: ["entrants"] });
  if (value.format === "rsc-six" && value.entrants.length !== 6) ctx.addIssue({ code: "custom", message: "The RSC playoff format needs six seeds.", path: ["entrants"] });
});
export type BracketConfig = z.infer<typeof bracketConfigSchema>;
export const matchId = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/);
export const seriesScoreSchema = z.object({ a: z.number().int().min(0).max(5).nullable(), b: z.number().int().min(0).max(5).nullable() }).strict();
export type SeriesScore = z.infer<typeof seriesScoreSchema>;
export type BracketState = BracketConfig & { scores: Record<string, SeriesScore> };
type Source = { seed: number } | { winner: string } | { loser: string };
export type MatchDefinition = { id: string; label: string; lane: "upper" | "lower" | "final"; round: number; number: number; bestOf: number; a: Source; b: Source; reset?: true };
export type Entrant = { id: string; seed: number; name: string };
export type ResolvedMatch = MatchDefinition & { needed: boolean; ready: boolean; autoAdvance: boolean; complete: boolean;
  teamA: Entrant | null; teamB: Entrant | null; sourceA: string; sourceB: string; score: SeriesScore; winner: Entrant | null; loser: Entrant | null };
const w = (id: string): Source => ({ winner: id }), l = (id: string): Source => ({ loser: id }), seed = (value: number): Source => ({ seed: value });
export function seedOrder(size: number): number[] {
  let order = [1, 2];
  for (let current = 4; current <= size; current *= 2) order = order.flatMap((value) => [value, current + 1 - value]);
  return order;
}
export function bracketMatches(config: BracketConfig): MatchDefinition[] {
  const { roundBestOf: early, finalBestOf: final } = config;
  if (config.format === "rsc-six") return [
    { id: "lq1", label: "Lower quarter-final 1", lane: "lower", round: 1, number: 1, bestOf: early, a: seed(3), b: seed(6) },
    { id: "lq2", label: "Lower quarter-final 2", lane: "lower", round: 1, number: 2, bestOf: early, a: seed(4), b: seed(5) },
    { id: "uf", label: "Upper final", lane: "upper", round: 1, number: 1, bestOf: final, a: seed(1), b: seed(2) },
    { id: "ls", label: "Lower semi-final", lane: "lower", round: 2, number: 1, bestOf: final, a: w("lq1"), b: w("lq2") },
    { id: "lf", label: "Lower final", lane: "lower", round: 3, number: 1, bestOf: final, a: l("uf"), b: w("ls") },
    { id: "gf", label: "Grand final", lane: "final", round: 1, number: 1, bestOf: final, a: w("uf"), b: w("lf") },
    { id: "gr", label: "Grand-final reset", lane: "final", round: 2, number: 1, bestOf: final, a: w("uf"), b: w("lf"), reset: true },
  ];
  let size = 2;
  while (size < config.entrants.length) size *= 2;
  const order = seedOrder(size), matches: MatchDefinition[] = [], upper: string[][] = [];
  const rounds = Math.log2(size);
  for (let round = 1; round <= rounds; round++) {
    const ids: string[] = [];
    for (let index = 0; index < size / 2 ** round; index++) {
      const id = `u${round}m${index + 1}`; ids.push(id);
      matches.push({ id, label: round === rounds ? "Upper final" : `Upper round ${round} · Match ${index + 1}`, lane: "upper", round, number: index + 1,
        bestOf: round === rounds ? final : early, a: round === 1 ? seed(order[index * 2]) : w(upper[round - 2][index * 2]), b: round === 1 ? seed(order[index * 2 + 1]) : w(upper[round - 2][index * 2 + 1]) });
    }
    upper.push(ids);
  }
  if (config.format === "single") { for (const match of matches) match.label = match.label.replace("Upper round", "Round"); matches.at(-1)!.label = "Final"; return matches; }
  let lowerWinner: Source = l(upper[0][0]);
  if (size > 2) {
    let previous: string[] = [];
    for (let index = 0; index < size / 4; index++) {
      const id = `l1m${index + 1}`; previous.push(id);
      matches.push({ id, label: `Lower round 1 · Match ${index + 1}`, lane: "lower", round: 1, number: index + 1, bestOf: early, a: l(upper[0][index * 2]), b: l(upper[0][index * 2 + 1]) });
    }
    for (let upperRound = 2; upperRound <= rounds; upperRound++) {
      const round = 2 * upperRound - 2, ids: string[] = [], count = upper[upperRound - 1].length;
      for (let index = 0; index < count; index++) {
        const id = `l${round}m${index + 1}`; ids.push(id);
        matches.push({ id, label: upperRound === rounds ? "Lower final" : `Lower round ${round} · Match ${index + 1}`, lane: "lower", round, number: index + 1,
          bestOf: upperRound === rounds ? final : early, a: w(previous[index]), b: l(upper[upperRound - 1][count > 1 ? index ^ 1 : 0]) });
      }
      previous = ids;
      if (upperRound < rounds) {
        previous = [];
        for (let index = 0; index < ids.length / 2; index++) {
          const id = `l${round + 1}m${index + 1}`; previous.push(id);
          matches.push({ id, label: `Lower round ${round + 1} · Match ${index + 1}`, lane: "lower", round: round + 1, number: index + 1, bestOf: early, a: w(ids[index * 2]), b: w(ids[index * 2 + 1]) });
        }
      }
    }
    lowerWinner = w(previous[0]);
  }
  const upperWinner = w(upper.at(-1)![0]);
  matches.push({ id: "gf", label: "Grand final", lane: "final", round: 1, number: 1, bestOf: final, a: upperWinner, b: lowerWinner });
  matches.push({ id: "gr", label: "Grand-final reset", lane: "final", round: 2, number: 1, bestOf: final, a: upperWinner, b: lowerWinner, reset: true });
  return matches;
}
export function resolveBracket(state: BracketState) {
  const definitions = bracketMatches(state), resolved = new Map<string, ResolvedMatch>();
  const source = (value: Source) => {
    if ("seed" in value) {
      const name = state.entrants[value.seed - 1];
      return { ready: value.seed > state.entrants.length || Boolean(name), team: name ? { id: `s${value.seed}`, seed: value.seed, name } : null,
        label: value.seed > state.entrants.length ? "Bye" : `Seed ${value.seed} · to be confirmed` };
    }
    const id = "winner" in value ? value.winner : value.loser, match = resolved.get(id)!;
    const team = "winner" in value ? match.winner : match.loser;
    return { ready: match.complete, team, label: match.complete && !team ? "Bye" : `${"winner" in value ? "Winner" : "Loser"} of ${match.label}` };
  };
  for (const definition of definitions) {
    const a = source(definition.a), b = source(definition.b), gf = resolved.get("gf");
    const needed = !definition.reset || Boolean(gf?.complete && gf.winner?.id === gf.teamB?.id);
    const ready = needed && a.ready && b.ready, autoAdvance = ready && (!a.team || !b.team);
    const score = state.scores[definition.id] || { a: null, b: null }, need = Math.ceil(definition.bestOf / 2);
    const scored = ready && Boolean(a.team && b.team) && score.a !== null && score.b !== null
      && ((score.a === need && score.b < need) || (score.b === need && score.a < need));
    const winner = autoAdvance ? a.team || b.team : scored ? (score.a === need ? a.team : b.team) : null;
    const loser = scored ? (score.a === need ? b.team : a.team) : null;
    resolved.set(definition.id, { ...definition, needed, ready, autoAdvance, complete: autoAdvance || scored, teamA: a.team, teamB: b.team,
      sourceA: a.label, sourceB: b.label, score, winner, loser });
  }
  const matches = Array.from(resolved.values()), gf = resolved.get("gf"), reset = resolved.get("gr");
  const champion = state.format === "single" ? matches.at(-1)!.winner : gf?.complete ? (gf.winner?.id === gf.teamA?.id ? gf.winner : reset?.winner || null) : null;
  return { matches, champion };
}
export const bracketStateSchema = bracketConfigSchema.safeExtend({ scores: z.record(matchId, seriesScoreSchema).default({}) }).superRefine((state, ctx) => {
  const { matches } = resolveBracket(state);
  for (const [id, score] of Object.entries(state.scores)) {
    const match = matches.find((item) => item.id === id), need = match ? Math.ceil(match.bestOf / 2) : 0;
    if (!match?.needed || !match.ready || match.autoAdvance || (score.a !== null && score.a > need) || (score.b !== null && score.b > need) || (score.a === need && score.b === need)) {
      ctx.addIssue({ code: "custom", message: "Scores require a ready match and a valid series result.", path: ["scores", id] });
    }
  }
});
export function applyBracketScore(state: BracketState, id: string, score: SeriesScore) {
  state = bracketStateSchema.parse(state); score = seriesScoreSchema.parse(score);
  const before = resolveBracket(state), match = before.matches.find((item) => item.id === id);
  if (!match?.needed || !match.ready || match.autoAdvance) throw Object.assign(Error("Both entrants must be confirmed before recording this match."), { status: 409 });
  const need = Math.ceil(match.bestOf / 2);
  if ((score.a !== null && score.a > need) || (score.b !== null && score.b > need) || (score.a === need && score.b === need)) throw Object.assign(Error(`Use scores from 0 to ${need}; both sides cannot win the series.`), { status: 400 });
  const next = structuredClone(state), cleared: string[] = [];
  if (score.a === null && score.b === null) delete next.scores[id]; else next.scores[id] = score;
  for (const previous of before.matches) {
    if (previous.id === id || !next.scores[previous.id]) continue;
    const current = resolveBracket(next).matches.find((item) => item.id === previous.id)!;
    const identities = (value: ResolvedMatch) => [value.needed, value.ready, value.teamA?.id || null, value.teamB?.id || null].join(":");
    if (identities(previous) !== identities(current)) { delete next.scores[previous.id]; cleared.push(previous.id); }
  }
  return { state: bracketStateSchema.parse(next), cleared };
}
