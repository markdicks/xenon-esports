"use client";
import { useEffect, useRef, useState } from "react";
import type { PublicBracket } from "@/lib/brackets";
import type { ResolvedMatch } from "@/lib/bracket-contract";
import { collaboratorsForEvent } from "@/data/collaborations";
import { CollaborationHero } from "@/components/collaborations/CollaborationHero";
import { AwarenessBadge } from "@/components/collaborations/AwarenessBadge";
const formats = { single: "Single elimination", double: "Double elimination", "rsc-six": "Six-team seeded playoffs" };
const sourceName = (match: ResolvedMatch, side: "A" | "B") => (side === "A" ? match.teamA?.name || match.sourceA : match.teamB?.name || match.sourceB);
const time = (value: string) => new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(value));
export function BracketViewer({ id, initial }: { id: string; initial: PublicBracket | null }) {
  const [bracket, setBracket] = useState(initial), [delayed, setDelayed] = useState(!initial), [missing, setMissing] = useState(false);
  const [lane, setLane] = useState("all"), [selected, setSelected] = useState<string | null>(null), [copied, setCopied] = useState(false);
  const revision = useRef(initial?.revision), refresh = useRef<() => void>(() => {}), dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const controller = new AbortController(); let busy = false;
    async function load() {
      if (busy || document.hidden) return; busy = true;
      try {
        const response = await fetch(`/api/brackets/${id}`, { cache: "no-store", credentials: "omit", redirect: "error", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
          headers: revision.current ? { "If-None-Match": `"${revision.current}"` } : {} });
        if (response.status === 304) { setDelayed(false); return; }
        if (response.status === 404) { revision.current = undefined; setBracket(null); setSelected(null); setMissing(true); setDelayed(false); return; }
        if (!response.ok) throw Error("Scores unavailable");
        const value = (await response.json()).bracket as PublicBracket;
        if (value?.id !== id || typeof value.revision !== "string" || !value.state || !Object.hasOwn(formats, value.state.format) || !Array.isArray(value.matches)) throw Error("Invalid scores");
        if (revision.current !== value.revision) { setBracket(value); revision.current = value.revision; }
        setMissing(false); setDelayed(false);
      } catch { if (!controller.signal.aborted) setDelayed(true); } finally { busy = false; }
    }
    refresh.current = () => { void load(); }; void load();
    const timer = setInterval(() => { void load(); }, 5000), resume = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", resume);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", resume); };
  }, [id]);
  const selectedMatch = bracket?.matches.find((value) => value.id === selected && value.needed);
  useEffect(() => {
    if (selectedMatch && dialog.current && !dialog.current.open) dialog.current.showModal();
    if (!selectedMatch && dialog.current?.open) dialog.current.close();
  }, [selectedMatch]);
  if (!bracket) return <section className="bracket-unavailable"><p className="collaboration-eyebrow">Unlisted bracket</p><h1>{missing ? "This bracket is not available." : "The bracket is reconnecting."}</h1><p>{missing ? "The organisers may have disabled this viewing link. Ask them for the current link." : "Scores could not be loaded. Please try again shortly."}</p><button type="button" onClick={() => refresh.current()}>Try again</button></section>;
  const partner = collaboratorsForEvent(bracket.eventId)[0], matches = bracket.matches, match = selectedMatch;
  const lanes = ["upper", ...(bracket.state.format === "single" ? [] : ["lower", "final"])];
  const labels: Record<string, string> = { upper: bracket.state.format === "single" ? "Bracket" : "Upper bracket", lower: "Lower bracket", final: "Finals" };
  const activeLane = lanes.includes(lane) ? lane : "all";
  const description = <><p className="collaboration-slogan">{formats[bracket.state.format]} · {bracket.state.entrants.length} seeds</p><p className="collaboration-hero-description">Follow every series, the path through each round and the eventual champion. Scores update automatically.</p>{partner && <AwarenessBadge partner={partner} />}</>;
  async function copyLink() { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); } catch { setCopied(false); } }
  return <div className={`bracket-viewer ${partner ? "bracket-collaboration" : ""}`}>
    {partner ? <CollaborationHero eyebrow="Unlisted tournament bracket / Xenon × PPP" title={bracket.state.name} artwork={partner.artwork} artworkAlt={partner.artworkAlt} logo={partner.logo}>{description}</CollaborationHero>
      : <header className="bracket-plain-hero"><p className="collaboration-eyebrow">Xenon / Unlisted tournament bracket</p><h1>{bracket.state.name}</h1>{description}</header>}
    <section className="bracket-content">
      <div className="bracket-toolbar"><div><span className="bracket-link-label">Unlisted · link access</span><p>Anyone with this link can view. Editing is restricted to event staff.</p></div><div className="bracket-actions"><button onClick={() => refresh.current()} type="button">Refresh scores</button><button onClick={() => { void copyLink(); }} type="button">{copied ? "Link copied" : "Copy viewing link"}</button></div></div>
      <div className="bracket-live" role="status"><span className={delayed ? "bracket-dot delayed" : "bracket-dot"} />{delayed ? "Updates are delayed. Showing the last received results." : "Scores refresh automatically"}<span>Updated {time(bracket.updatedAt)} SAST</span></div>
      <div className="bracket-summary"><div><strong>{bracket.state.entrants.filter(Boolean).length}<small> / {bracket.state.entrants.length}</small></strong><span>Seeds confirmed</span></div><div><strong>{matches.filter((value) => value.complete && !value.autoAdvance).length}</strong><span>Series completed</span></div><div className="bracket-champion"><span>Champion</span><strong>{bracket.champion?.name || "Still to be decided"}</strong></div></div>
      <nav className="bracket-tabs" aria-label="Bracket rounds"><button type="button" aria-pressed={activeLane === "all"} onClick={() => setLane("all")}>All rounds</button>{lanes.map((value) => <button key={value} type="button" aria-pressed={activeLane === value} onClick={() => setLane(value)}>{labels[value]}</button>)}</nav>
      {lanes.filter((value) => activeLane === "all" || activeLane === value).map((value) => {
        const rounds = Array.from(new Set(matches.filter((item) => item.lane === value).map((item) => item.round)));
        return <section className={`bracket-lane bracket-lane-${value}`} key={value} aria-label={labels[value]}><div className="bracket-lane-title"><h2>{labels[value]}</h2><p>{value === "final" ? "A reset is played only if the lower-bracket finalist wins the first grand final." : value === "lower" ? "The winner advances. A loss in this bracket ends the run." : bracket.state.format === "single" ? "Win to advance to the next round." : "A loss here moves an entrant to the lower bracket."}</p></div>
          <div className="bracket-rounds" tabIndex={0} role="region" aria-label={`${labels[value]} match columns; scroll horizontally for later rounds`}>
            {rounds.map((round) => <div className="bracket-round" key={round}><h3>{value === "final" ? round === 1 ? "Grand final" : "Bracket reset" : `Round ${round}`}</h3><div className="bracket-round-matches">{matches.filter((item) => item.lane === value && item.round === round).map((item) => !item.needed ? <div className="bracket-reset-note" key={item.id}>{bracket.champion ? "A reset was not needed." : "If the lower-bracket finalist wins the grand final, both finalists play one deciding series."}</div>
              : <button type="button" className={`bracket-match ${item.complete ? "is-complete" : item.ready ? "is-ready" : ""}`} key={item.id} onClick={() => setSelected(item.id)} aria-label={`${item.label}: ${sourceName(item, "A")} versus ${sourceName(item, "B")}. View match details`}>
                <span className="bracket-match-heading"><span>{item.label}</span><span>BO{item.bestOf}</span></span>
                {(["A", "B"] as const).map((side) => { const team = side === "A" ? item.teamA : item.teamB, score = side === "A" ? item.score.a : item.score.b;
                  return <span key={side} className={`bracket-team ${team && item.winner?.id === team.id ? "is-winner" : ""}`}><small>{team?.seed || "–"}</small><span title={sourceName(item, side)}>{sourceName(item, side)}</span><strong>{item.autoAdvance ? "–" : score ?? "–"}</strong></span>;
                })}<span className="bracket-match-status">{item.autoAdvance ? "Automatic advance · bye" : item.complete ? "Final result" : item.ready ? item.score.a !== null || item.score.b !== null ? "In progress" : "Ready to play" : "Awaiting entrants"}</span>
              </button>)}</div></div>)}
          </div></section>;
      })}
      <details className="bracket-explanation"><summary>How this bracket works</summary><p>{bracket.state.format === "rsc-six" ? "The top two seeds start in the upper final. Seeds 3–6 start in the lower quarter-finals: 3 vs 6 and 4 vs 5. Their winners meet in the lower semi-final; that winner then faces the upper-final loser. The upper-final and lower-final winners meet in the grand final." : bracket.state.format === "double" ? "Entrants start in the upper bracket. After their first loss, they move to the lower bracket. A second loss eliminates them. When the entrant count is not a power of two, higher seeds receive byes." : "Each series winner advances; the loser is eliminated. When the entrant count is not a power of two, higher seeds receive byes."}</p><p>A best-of-{bracket.state.roundBestOf} series is first to {Math.ceil(bracket.state.roundBestOf / 2)} wins. Finals are best-of-{bracket.state.finalBestOf}, first to {Math.ceil(bracket.state.finalBestOf / 2)} wins.{bracket.state.format !== "single" && " If the lower-bracket finalist wins the grand final, one reset series decides the champion."} Unconfirmed seeds stay pending and do not advance as byes.</p></details>
    </section>
    <dialog ref={dialog} className="bracket-dialog" onCancel={() => setSelected(null)} onClose={() => setSelected(null)} aria-labelledby="bracket-match-title">{match && <><p className="collaboration-eyebrow">Match details · BO{match.bestOf}</p><h2 id="bracket-match-title">{match.label}</h2><div className="bracket-head-to-head"><div><span>Seed {match.teamA?.seed || "–"}</span><strong>{sourceName(match, "A")}</strong><b>{match.score.a ?? "–"}</b></div><span>vs</span><div><span>Seed {match.teamB?.seed || "–"}</span><strong>{sourceName(match, "B")}</strong><b>{match.score.b ?? "–"}</b></div></div><p>{match.winner ? `${match.winner.name} advances${match.autoAdvance ? " with a bye" : ""}.` : `First to ${Math.ceil(match.bestOf / 2)} wins.`}</p><div className="bracket-actions">{[match.a, match.b].map((source, index) => "seed" in source ? null : <button key={index} type="button" onClick={() => setSelected("winner" in source ? source.winner : source.loser)}>View {index ? "second" : "first"} feeder match</button>)}<button type="button" onClick={() => setSelected(null)}>Close</button></div></>}</dialog>
  </div>;
}
