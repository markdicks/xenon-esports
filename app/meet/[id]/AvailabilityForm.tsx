"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { availabilityDayCount, bookingNotice, futureAvailabilitySlots, minimumAvailabilityDays, minimumAvailabilitySlots, slotLength } from "@/lib/meeting-contract";

export type AvailabilityFormProps = { id: string; userId: string; token: string; initialSlots: number[]; initialTimezone: string;
  windowStart: number; windowEnd: number; initialResponded: boolean; status: string; scheduledAt: number | null; channelUrl: string | null; serverNow: number; proposedSlots?: number[]; attending?: boolean;
  nearTermAt?: number;
  sharedParticipants?: { key: string; name: string; own: boolean; responded: boolean; source?: string; waived?: boolean; slots: number[] }[] };
const subscribe = () => () => {};
const control = "min-h-11 rounded-md border border-white/15 bg-black/30 px-4 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-ion disabled:opacity-40";
const dotColors = ["#d8b4fe", "#93c5fd", "#fda4af", "#fcd34d", "#86efac", "#f9a8d4"];
function PersonDot({ index }: { index: number }) {
  return <span aria-hidden="true" className="inline-grid h-4 min-w-4 shrink-0 place-items-center rounded-full px-0.5 text-[9px] font-black leading-none text-carbon" style={{ backgroundColor: dotColors[index % dotColors.length] }}>{index + 1}</span>;
}
export function AvailabilityForm(props: AvailabilityFormProps) {
  const localTimezone = useSyncExternalStore(subscribe, () => Intl.DateTimeFormat().resolvedOptions().timeZone, () => "UTC");
  const [chosenTimezone, setTimezone] = useState<string | null>(null);
  const timezone = chosenTimezone || (props.initialResponded ? props.initialTimezone : localTimezone);
  const [slots, setSlots] = useState(new Set(props.initialSlots));
  const [dayIndex, setDayIndex] = useState(0), [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(props.initialResponded), [error, setError] = useState("");
  const [clock, setClock] = useState(props.serverNow);
  const [inspectedAt, setInspectedAt] = useState<number | null>(null);
  const [decision, setDecision] = useState<{ at: number; message: string } | null>(null);
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
  const selectedDays = availabilityDayCount(selected, timezone);
  const others = useMemo(() => (props.sharedParticipants || []).filter((person) => !person.own), [props.sharedParticipants]);
  const availableByTime = useMemo(() => {
    const times = new Map<number, { name: string; index: number }[]>();
    others.forEach((person, index) => {
      if (!person.responded || person.waived) return;
      for (const at of person.slots) {
        const row = times.get(at) || [];
        row.push({ name: person.name, index });
        times.set(at, row);
      }
    });
    return times;
  }, [others]);
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
  async function decide(confirm: boolean) {
    if (!props.nearTermAt) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/meetings/${props.id}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: props.userId, token: props.token, action: confirm ? "confirm-time" : "skip-time", at: props.nearTermAt }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update this time");
      setDecision({ at: props.nearTermAt, message: confirm ? "Time accepted. Check Discord for the booking confirmation." : "Time skipped. We’ll look for a later match." });
    } catch (err) { setError(err instanceof Error ? err.message : "Could not update this time"); }
    finally { setBusy(false); }
  }
  async function save(values: number[]) {
    const current = anchor.current;
    const checkedAt = current ? current.serverNow + Math.max(0, performance.now() - current.measuredAt) : now;
    const future = futureAvailabilitySlots(values, props.windowStart, props.windowEnd, checkedAt);
    if (values.length > 0 && future.length < minimumAvailabilitySlots) {
      setSlots(new Set(future)); setSaved(false); setError(`Select at least ${minimumAvailabilitySlots} future times, at least two hours from now`); return;
    }
    if (future.length && availabilityDayCount(future, timezone) < minimumAvailabilityDays) {
      setSlots(new Set(future)); setSaved(false); setError(`Choose times on at least ${minimumAvailabilityDays} different days in your timezone`); return;
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
    {props.nearTermAt && decision?.at === props.nearTermAt ? <p className="mb-5 text-sm text-ion" role="status">{decision.message}</p>
      : props.nearTermAt && props.nearTermAt >= now + bookingNotice ? <section className="mb-6 border-b border-white/15 pb-5" aria-label="Confirm proposed meeting">
        <h2 className="font-display text-lg font-bold text-white">Confirm short-notice meeting</h2>
        <p className="my-3 text-steel">{dateLabel(props.nearTermAt)}, {timeLabel(props.nearTermAt)} ({timezone})</p>
        <div className="flex flex-wrap gap-3"><button disabled={busy} className={`${control} font-bold text-ion`} onClick={() => decide(true)}>Confirm this time</button>
          <button disabled={busy} className={control} onClick={() => decide(false)}>Find a later time</button></div>
      </section> : null}
    <p className="mb-5 text-sm text-steel">Availability is visible to meeting participants and authorised staff.</p>
    {props.sharedParticipants?.some((person) => person.own && person.waived) && <p className="mb-4 text-sm text-steel">Your reply was not required after 48 hours. You can still update your times before booking.</p>}
    <ul aria-label="Participant availability legend" className="mb-5 flex flex-wrap gap-3 text-xs text-steel">{others.map((person, index) => <li key={person.key} className="flex min-w-0 items-start gap-2 border-b border-white/15 pb-2"><PersonDot index={index} /><span className="min-w-0 break-all"><strong className="text-white">{person.name}</strong>: {person.waived ? "Not required after 48 hours" : person.responded ? person.source === "standing" ? "Weekly availability" : "Replied" : "Awaiting reply"}</span></li>)}</ul>
    <div className="mb-5 flex flex-wrap gap-4 text-xs"><span className="text-ion">Your selection</span><span className="text-purple-300">Others available</span><span className="text-lime-300">Shared selection</span></div>
    <label htmlFor="meeting-timezone" className="block text-sm font-semibold text-white">Timezone</label><select id="meeting-timezone" value={timezone} disabled={busy} onChange={(event) => { setTimezone(event.target.value); setDayIndex(0); setSaved(false); }} className={`${control} mt-2 w-full`}>
      {timezones.map((zone) => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}
    </select>
    {saved && <p role="status" className="mt-5 text-sm leading-6 text-ion">Availability saved. Check Discord for confirmation once a matching time is found.</p>}
    {props.status === "no_match" && !saved && <p className="mt-5 text-sm text-steel">No matching time yet. You can update your availability.</p>}
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><button className={control} disabled={busy || dayIndex === 0} onClick={() => setDayIndex(Math.max(0, dayIndex - 1))}>Previous day</button>
      <button className={control} disabled={busy || dayIndex >= days.length - 1} onClick={() => setDayIndex(Math.min(days.length - 1, dayIndex + 1))}>Next day</button></div>
    <fieldset disabled={busy} className="mt-5"><legend className="mb-4 text-base font-bold text-white">{day.length ? dateLabel(day[0]) : "No future slots"}<span className="mt-1 block text-xs font-normal text-steel">30-minute slots</span></legend>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{day.map((at) => {
        const people = availableByTime.get(at) || [];
        const who = people.map((person) => person.name).join(", "), time = timeLabel(at);
        return <label key={at} title={who ? `Available: ${who}` : undefined} className={`grid min-h-16 cursor-pointer content-center justify-items-center gap-1 rounded-md border px-1 py-1.5 text-sm ${slots.has(at) ? people.length ? "border-lime-300 bg-lime-300/10 text-white" : "border-ion bg-ion/10 text-white" : people.length ? "border-purple-300/60 bg-purple-300/10 text-purple-200" : "border-white/15 text-steel"}`}>
        <span className="flex items-center gap-1.5"><input type="checkbox" aria-label={who ? `${time}. Available: ${who}` : time} checked={slots.has(at)} className="h-4 w-4 accent-cyan-300" onFocus={() => setInspectedAt(at)} onChange={() => { setInspectedAt(at); setSlots((old) => { const next = new Set(old); if (next.has(at)) next.delete(at); else next.add(at); return next; }); setSaved(false); }} />{time}</span>
        <span aria-hidden="true" className="flex h-4 items-center gap-0.5">{people.slice(0, 3).map((person) => <PersonDot key={person.index} index={person.index} />)}{people.length > 3 && <span className="text-[10px] font-bold">+{people.length - 3}</span>}</span></label>;
      })}</div>
    </fieldset>
    {inspectedAt !== null && day.includes(inspectedAt) && <p className="mt-3 break-words text-sm text-steel" aria-live="polite"><strong className="text-white">{timeLabel(inspectedAt)}:</strong> {availableByTime.get(inspectedAt)?.map((person) => person.name).join(", ") || "No one else has marked this time."}</p>}
    <p aria-live="polite" className="mt-4 text-sm text-steel">{selected.length} future {selected.length === 1 ? "time" : "times"} across {selectedDays} {selectedDays === 1 ? "day" : "days"}. Choose at least {minimumAvailabilitySlots} times across {minimumAvailabilityDays} days.</p>
    {error && <p role="alert" className="mt-4 text-sm text-volt">{error}</p>}
    <div className="mt-6 flex flex-col gap-3 sm:flex-row"><button disabled={busy || selected.length < minimumAvailabilitySlots || selectedDays < minimumAvailabilityDays} onClick={() => save(Array.from(slots))} className={`${control} bg-ion/10 font-bold text-ion`}>{busy ? "Saving..." : "Save availability"}</button>
      <button disabled={busy} onClick={() => save([])} className={control}>No suitable times</button></div>
  </section>;
}
