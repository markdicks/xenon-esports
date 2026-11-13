"use client";
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { DISCORD_INVITE_URL } from "@/lib/public-links";
import { useCommunityEvent } from "@/components/events/useCommunityEvent";
import type { PublicEvent } from "@/lib/community-contract";
const inputClass = "mt-2 w-full rounded-md border border-white/15 bg-black/30 px-4 py-3 text-white outline-none focus:border-ion focus:ring-2 focus:ring-ion/20";
export function PreShowForm({ initial }: { initial: PublicEvent }) {
  const { event, proof, connectionError, refresh } = useCommunityEvent(initial), requestId = useRef<string | null>(null);
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [reference, setReference] = useState<string | null>(null);
  const open = event.available && event.settings.registrationOpen && !["closed", "complete"].includes(event.settings.status);
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); if (!open || !proof || pending) return;
    const form = new FormData(formEvent.currentTarget); requestId.current ||= crypto.randomUUID();
    const payload = Object.fromEntries(["discordUsername", "riotId", "rank", "region", "availability", "message", "website"].map((name) => [name, String(form.get(name) || "")]));
    setPending(true); setError("");
    try {
      const response = await fetch("/api/events/valorant/register", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, agreement: form.get("agreement") === "on", requestId: requestId.current, proof }) });
      const data = await response.json();
      if (!response.ok || data.success !== true || !/^XEN-EVT-[A-Z0-9]{6}$/.test(data.reference || "")) {
        const details = data.fieldErrors ? Object.values(data.fieldErrors).flat().filter((value) => typeof value === "string").join(" ") : "";
        throw new Error(details || data.error || "Your registration could not be confirmed. Your answers are still here; please check before retrying.");
      }
      setReference(data.reference);
    } catch (failure) { setError(failure instanceof Error && !(failure instanceof TypeError || failure instanceof SyntaxError) ? failure.message : "Your registration could not be confirmed. Your answers are still here; please check before retrying."); }
    finally { setPending(false); }
  }
  if (reference) return <section className="mt-9 border-y border-ion/30 py-8" role="status"><h2 className="font-display text-2xl font-black text-white">Your pre-show interest is registered.</h2><p className="mt-4 text-steel">Reference: <strong className="text-white">{reference}</strong></p><p className="mt-4 leading-7 text-steel">Your registration is pending review. Submitting interest does not guarantee selection. Only six players will be accepted, and selected players will be contacted through Discord.</p><div className="mt-6 flex flex-wrap gap-3"><Button href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer">Join Discord</Button><Link href="/events" className="inline-flex min-h-11 items-center px-4 text-sm font-bold text-ion">Return to events</Link></div></section>;
  return <div className="mt-9">
    {!event.available || connectionError ? <div className="community-notice" role="status"><p>{connectionError || "Event services are temporarily unavailable."}</p><button type="button" onClick={() => void refresh()} className="community-text-action">Refresh</button></div> : null}
    {!open && event.available ? <p className="community-notice" role="status">Pre-show interest registration is currently closed. Join Discord for the opening announcement.</p> : null}
    <form onSubmit={submit} method="post"><fieldset disabled={!open || !proof || pending} className="grid gap-5 border-t border-white/10 pt-7"><legend className="sr-only">Pre-show interest registration</legend>
      <input name="website" type="text" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-semibold text-white">Discord username or user ID<input name="discordUsername" required maxLength={120} autoComplete="nickname" className={inputClass} /></label><label className="text-sm font-semibold text-white">Valorant Riot ID<input name="riotId" required maxLength={80} placeholder="Player#TAG" className={inputClass} /></label></div>
      <div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-semibold text-white">Rank <span className="font-normal text-steel">optional</span><input name="rank" maxLength={60} className={inputClass} /></label><label className="text-sm font-semibold text-white">Region / server<input name="region" required maxLength={100} className={inputClass} /></label></div>
      <label className="text-sm font-semibold text-white">Availability<textarea name="availability" required maxLength={600} rows={3} placeholder="Your timezone and the days or times you could play." className={inputClass} /></label>
      <label className="text-sm font-semibold text-white">A short message <span className="font-normal text-steel">optional</span><textarea name="message" maxLength={600} rows={3} className={inputClass} /></label>
      <label className="flex items-start gap-3 text-sm leading-7 text-steel"><input name="agreement" type="checkbox" required className="mt-1.5 h-5 w-5 shrink-0 accent-cyan-300" /><span>I agree to Xenon&apos;s community rules, respectful conduct and organiser contact about this event. Event-specific rules will be shared before participation.</span></label>
      <button type="submit" disabled={!open || !proof || pending} className="community-submit">{pending ? "Registering interest..." : open && !proof && !connectionError ? "Preparing registration..." : "Register my interest"}</button>
    </fieldset>{error ? <p className="community-error mt-4" role="alert">{error}</p> : null}</form>
  </div>;
}
