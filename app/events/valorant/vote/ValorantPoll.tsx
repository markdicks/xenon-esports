"use client";
import { useState, type FormEvent } from "react";
import { pollChoices, choiceSchema, publicEventSchema, type PollChoice, type PublicEvent } from "@/lib/community-contract";
import { useCommunityEvent } from "@/components/events/useCommunityEvent";

export function ValorantPoll({ initial }: { initial: PublicEvent }) {
  const { event, setEvent, proof, choice, setChoice, connectionError, refresh } = useCommunityEvent(initial);
  const [selected, setSelected] = useState<PollChoice | null>(null), [pending, setPending] = useState(false), [error, setError] = useState("");
  const open = event.available && event.settings.pollOpen && !["closed", "complete"].includes(event.settings.status);
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); if (!selected || !proof || pending || choice) return;
    const website = String(new FormData(formEvent.currentTarget).get("website") || "");
    setPending(true); setError("");
    try {
      const response = await fetch("/api/events/valorant/vote", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ choice: selected, proof, website }) });
      const data = await response.json();
      if (!response.ok || data.success !== true || !choiceSchema.safeParse(data.choice).success) throw new Error(data.error || "Your vote could not be confirmed. Please refresh before retrying.");
      setChoice(data.choice);
      const result = publicEventSchema.safeParse(data.event); if (result.success) setEvent(result.data); else await refresh(false);
    } catch (failure) { setError(failure instanceof Error && !(failure instanceof TypeError || failure instanceof SyntaxError) ? failure.message : "Your vote could not be confirmed. Please refresh before retrying."); }
    finally { setPending(false); }
  }
  const first = event.results?.total ? Math.round(event.results.votes["skirmish-2v2"] / event.results.total * 1000) / 10 : 0;
  return <div className="mt-9">
    {!event.available || connectionError ? <div className="community-notice" role="status"><p>{connectionError || "Event services are temporarily unavailable. No results can be shown right now."}</p><button type="button" onClick={() => void refresh()} className="community-text-action">Refresh</button></div> : null}
    {!open && event.available ? <p className="community-notice" role="status">{event.settings.status === "planning" ? "Voting is not open yet. The December event is being planned; check back for the opening announcement." : "Voting is currently closed."}</p> : null}
    {choice ? <p className="community-notice" role="status">Your vote is recorded: <strong>{pollChoices.find((option) => option.id === choice)?.title}</strong>. Thank you for helping shape the event.</p> : null}
    <form onSubmit={submit} className="mt-6">
      <input name="website" type="text" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <fieldset disabled={!open || !proof || pending || Boolean(choice)}><legend className="sr-only">Preferred main event format</legend>
        <div className="grid gap-4 sm:grid-cols-2">{pollChoices.map((option) => <label key={option.id} className="community-poll-option"><input type="radio" name="format" value={option.id} checked={(choice || selected) === option.id} onChange={() => setSelected(option.id)} required /><span><strong>{option.title}</strong><span>{option.description}</span></span></label>)}</div>
      </fieldset>
      {error ? <p className="community-error mt-4" role="alert">{error}</p> : null}
      <button type="submit" disabled={!open || !proof || !selected || pending || Boolean(choice)} className="community-submit mt-5">{pending ? "Recording vote..." : choice ? "Vote recorded" : open && !proof && !connectionError ? "Preparing vote..." : "Cast your vote"}</button>
    </form>
    <section aria-labelledby="poll-results" className="mt-12 border-t border-white/10 pt-8"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="poll-results" className="font-display text-2xl font-black text-white">Live community results</h2><span className="text-xs text-steel">{open ? "Voting open" : "Voting closed"}</span></div>
      {event.available && event.results ? <><div className="mt-7 space-y-6">{pollChoices.map((option, index) => {
        const percentage = index === 0 ? first : event.results!.total ? Math.round((100 - first) * 10) / 10 : 0;
        return <div key={option.id}><div className="flex items-center justify-between gap-4 text-sm"><span className="font-semibold text-white">{option.title}</span><strong className="text-ion">{percentage}%</strong></div><div className="community-result-track mt-3" role="progressbar" aria-label={`${option.title} preference`} aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${percentage}%` }} /></div></div>;
      })}</div><p className="mt-6 text-sm text-steel">Total votes: <strong className="text-white">{event.results.total}</strong></p></> : <p className="mt-6 text-sm text-steel">Results are temporarily unavailable.</p>}
      <p className="mt-6 text-sm leading-7 text-steel">This anonymous poll is an indication of community preference, not proof of unique individual voters or an automatic event decision. Organisers will review interest levels, player availability and feasibility before confirming the format.</p>
    </section>
  </div>;
}
