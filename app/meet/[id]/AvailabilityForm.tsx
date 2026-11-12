"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { futureAvailabilitySlots, minimumAvailabilitySlots, slotLength } from "@/lib/meeting-contract";

export type AvailabilityFormProps = { id: string; userId: string; token: string; initialSlots: number[]; initialTimezone: string;
  windowStart: number; windowEnd: number; initialResponded: boolean; status: string; scheduledAt: number | null; channelUrl: string | null; serverNow: number; proposedSlots?: number[]; attending?: boolean;
  sharedParticipants?: { key: string; name: string; own: boolean; responded: boolean; source?: string; slots: number[] }[] };
const subscribe = () => () => {};
const control = "min-h-11 rounded-md border border-white/15 bg-black/30 px-4 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-ion disabled:opacity-40";
export function AvailabilityForm(props: AvailabilityFormProps) {
  const localTimezone = useSyncExternalStore(subscribe, () => Intl.DateTimeFormat().resolvedOptions().timeZone, () => "UTC");
  const [chosenTimezone, setTimezone] = useState<string | null>(null);
  const timezone = chosenTimezone || (props.initialResponded ? props.initialTimezone : localTimezone);
  const [slots, setSlots] = useState(new Set(props.initialSlots));
  const [dayIndex, setDayIndex] = useState(0), [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(props.initialResponded), [error, setError] = useState("");
  const [clock, setClock] = useState(props.serverNow);
  const anchor = useRef<{ serverNow: number; measuredAt: number } | null>(null);
  useEffect(() => {
    anchor.current = { serverNow: props.serverNow, measuredAt: performance.now() };
    const advance = () => {
      const current = anchor.current;
      if (current) setClock(current.serverNow + Math.max(0, performance.now() - current.measuredAt));
    };
    const timer = window.setInterval(advance, 15_000);
    window.addEventListener("focus", advance); document.addEventListener("visibilitychange", advance);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", advance); document.removeEventListener("visibilitychange", advance); };
  }, [props.serverNow]);
  const now = Math.max(props.serverNow, clock);
  const selected = useMemo(() => futureAvailabilitySlots(Array.from(slots), props.windowStart, props.windowEnd, now), [slots, props.windowStart, props.windowEnd, now]);
  const timezones = useMemo(() => Array.from(new Set([timezone, "UTC", ...Intl.supportedValuesOf("timeZone")])).sort(), [timezone]);
  const days = useMemo(() => {
    const groups = new Map<string, number[]>();
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
    const offered = props.proposedSlots ?? Array.from({ length: (props.windowEnd - props.windowStart) / slotLength }, (_, index) => props.windowStart + index * slotLength);
    for (const at of futureAvailabilitySlots(offered, props.windowStart, props.windowEnd, now).sort((a, b) => a - b)) {
      const key = date.format(at); if (!groups.has(key)) groups.set(key, []); groups.get(key)!.push(at);
    }
    return Array.from(groups.values());
  }, [timezone, props.windowStart, props.windowEnd, props.proposedSlots, now]);
  const day = days[Math.min(dayIndex, Math.max(0, days.length - 1))] || [];
  const dateLabel = (at: number) => new Intl.DateTimeFormat("en", { timeZone: timezone, weekday: "long", month: "long", day: "numeric" }).format(at);
  const timeLabel = (at: number) => new Intl.DateTimeFormat("en", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(at);
  const expired = props.windowEnd <= now || props.status === "expired";
  if (props.status === "closed") return <p className="mt-8 text-steel">This submission is closed. Availability can no longer be changed.</p>;
  if (props.status === "scheduled" && props.scheduledAt && props.attending === false) return <p className="mt-8 text-sm leading-6 text-steel">A meeting time was selected outside your availability. No attendance is expected from you. Check Discord for the outcome.</p>;
  if (props.status === "scheduled" && props.scheduledAt) return <section className="mt-8 border-t border-ion/30 py-6" role="status">
    <h2 className="font-display text-2xl font-bold text-ion">{props.channelUrl ? "Meeting booked" : "Meeting time reserved"}</h2><p className="mt-4 text-white">{dateLabel(props.scheduledAt)}, {timeLabel(props.scheduledAt)} ({timezone})</p>
    {!props.channelUrl && <p className="mt-4 text-sm text-steel">The bot is preparing your private Discord meeting channel. Check Discord for confirmation.</p>}
    {props.channelUrl && <a href={props.channelUrl} rel="noreferrer" className={`${control} mt-6 inline-flex items-center`}>Open meeting in Discord</a>}</section>;
  if (expired) return <p className="mt-8 text-steel">This availability window has closed. Please contact Xenon in Discord for the next step.</p>;
  async function save(values: number[]) {
    const current = anchor.current;
    const checkedAt = current ? current.serverNow + Math.max(0, performance.now() - current.measuredAt) : now;
    const future = futureAvailabilitySlots(values, props.windowStart, props.windowEnd, checkedAt);
    if (values.length > 0 && future.length < minimumAvailabilitySlots) {
      setSlots(new Set(future)); setSaved(false); setError(`Select at least ${minimumAvailabilitySlots} future times, at least two hours from now`); return;
    }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/meetings/${props.id}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: props.userId, token: props.token, slots: future, timezone }) });
      const result = await response.json();
      if (Number.isFinite(result.serverNow)) {
        anchor.current = { serverNow: result.serverNow, measuredAt: performance.now() }; setClock(result.serverNow);
      }
      if (!response.ok) throw new Error(result.error || "Could not save availability");
      setSlots(new Set(result.slots ?? future)); setSaved(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save availability"); }
    finally { setBusy(false); }
  }
  return <section className="mt-8 border-t border-white/15 pt-6">
    <p className="mb-5 text-sm text-steel">Availability is shared only with the people handling this submission.</p>
    <ul className="mb-5 flex flex-wrap gap-3 text-xs text-steel">{props.sharedParticipants?.map((person) => <li key={person.key} className="border-b border-white/15 pb-2"><strong className={person.responded ? "text-ion" : "text-steel"}>{person.name}{person.own ? " (you)" : ""}</strong>: {person.responded ? person.source === "standing" ? "Weekly availability saved" : "Replied" : "Awaiting reply"}</li>)}</ul>
    <div className="mb-5 flex flex-wrap gap-4 text-xs"><span className="text-ion">Your selection</span><span className="text-purple-300">Others available</span><span className="text-lime-300">Shared selection</span></div>
    <label htmlFor="meeting-timezone" className="block text-sm font-semibold text-white">Timezone</label><select id="meeting-timezone" value={timezone} disabled={busy} onChange={(event) => { setTimezone(event.target.value); setDayIndex(0); setSaved(false); }} className={`${control} mt-2 w-full`}>
      {timezones.map((zone) => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}
    </select>
    {saved && <p role="status" className="mt-5 text-sm leading-6 text-ion">Availability saved. Check Discord for the meeting confirmation once everyone has responded.</p>}
    {props.status === "no_match" && !saved && <p className="mt-5 text-sm text-steel">No matching time yet. You can update your availability.</p>}
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><button className={control} disabled={busy || dayIndex === 0} onClick={() => setDayIndex(Math.max(0, dayIndex - 1))}>Previous day</button>
      <button className={control} disabled={busy || dayIndex >= days.length - 1} onClick={() => setDayIndex(Math.min(days.length - 1, dayIndex + 1))}>Next day</button></div>
    <fieldset disabled={busy} className="mt-5"><legend className="mb-4 text-base font-bold text-white">{day.length ? dateLabel(day[0]) : "No future slots"}<span className="mt-1 block text-xs font-normal text-steel">30-minute slots</span></legend>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{day.map((at) => {
        const others = props.sharedParticipants?.filter((person) => !person.own && person.responded && person.slots.includes(at)) || [];
        return <label key={at} title={others.length ? `Available: ${others.map((person) => person.name).join(", ")}` : undefined} className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border p-2 text-sm ${slots.has(at) ? others.length ? "border-lime-300 bg-lime-300/10 text-white" : "border-ion bg-ion/10 text-white" : others.length ? "border-purple-300/60 bg-purple-300/10 text-purple-200" : "border-white/15 text-steel"}`}>
        <input type="checkbox" checked={slots.has(at)} className="h-4 w-4 accent-cyan-300" onChange={() => { setSlots((old) => { const next = new Set(old); if (next.has(at)) next.delete(at); else next.add(at); return next; }); setSaved(false); }} />{timeLabel(at)}</label>;
      })}</div>
    </fieldset>
    <p aria-live="polite" className="mt-4 text-sm text-steel">{selected.length} future times selected (minimum {minimumAvailabilitySlots})</p>
    {error && <p role="alert" className="mt-4 text-sm text-volt">{error}</p>}
    <div className="mt-6 flex flex-col gap-3 sm:flex-row"><button disabled={busy || selected.length < minimumAvailabilitySlots} onClick={() => save(Array.from(slots))} className={`${control} bg-ion/10 font-bold text-ion`}>{busy ? "Saving..." : "Save availability"}</button>
      <button disabled={busy} onClick={() => save([])} className={control}>No suitable times</button></div>
  </section>;
}
