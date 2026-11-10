"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
import { slotLength } from "@/lib/meeting-contract";

export type AvailabilityFormProps = { id: string; userId: string; token: string; initialSlots: number[]; initialTimezone: string;
  windowStart: number; windowEnd: number; initialResponded: boolean; status: string; scheduledAt: number | null; channelUrl: string | null; serverNow: number; proposedSlots?: number[]; attending?: boolean };
const subscribe = () => () => {};
const control = "min-h-11 rounded-md border border-white/15 bg-black/30 px-4 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-ion disabled:opacity-40";
export function AvailabilityForm(props: AvailabilityFormProps) {
  const localTimezone = useSyncExternalStore(subscribe, () => Intl.DateTimeFormat().resolvedOptions().timeZone, () => "UTC");
  const [chosenTimezone, setTimezone] = useState<string | null>(null);
  const timezone = chosenTimezone || (props.initialResponded ? props.initialTimezone : localTimezone);
  const [slots, setSlots] = useState(new Set(props.initialSlots));
  const [dayIndex, setDayIndex] = useState(0), [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(props.initialResponded), [error, setError] = useState("");
  const now = props.serverNow;
  const timezones = useMemo(() => Array.from(new Set([timezone, "UTC", ...Intl.supportedValuesOf("timeZone")])).sort(), [timezone]);
  const days = useMemo(() => {
    const groups = new Map<string, number[]>();
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
    const offered = props.proposedSlots ?? Array.from({ length: (props.windowEnd - props.windowStart) / slotLength }, (_, index) => props.windowStart + index * slotLength);
    for (const at of [...offered].sort((a, b) => a - b)) {
      if (at < now + 2 * 60 * 60 * 1000) continue;
      const key = date.format(at); if (!groups.has(key)) groups.set(key, []); groups.get(key)!.push(at);
    }
    return Array.from(groups.values());
  }, [timezone, props.windowStart, props.windowEnd, props.proposedSlots, now]);
  const day = days[Math.min(dayIndex, Math.max(0, days.length - 1))] || [];
  const dateLabel = (at: number) => new Intl.DateTimeFormat("en", { timeZone: timezone, weekday: "long", month: "long", day: "numeric" }).format(at);
  const timeLabel = (at: number) => new Intl.DateTimeFormat("en", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(at);
  const expired = props.windowEnd <= now || props.status === "expired";
  if (props.status === "scheduled" && props.scheduledAt && props.attending === false) return <p className="mt-8 text-sm leading-6 text-steel">A meeting time was selected outside your availability. No attendance is expected from you. Check Discord for the outcome.</p>;
  if (props.status === "scheduled" && props.scheduledAt) return <section className="mt-8 border-t border-ion/30 py-6" role="status">
    <h2 className="font-display text-2xl font-bold text-ion">{props.channelUrl ? "Meeting booked" : "Meeting time reserved"}</h2><p className="mt-4 text-white">{dateLabel(props.scheduledAt)}, {timeLabel(props.scheduledAt)} ({timezone})</p>
    {!props.channelUrl && <p className="mt-4 text-sm text-steel">The bot is preparing your private Discord meeting channel. Check Discord for confirmation.</p>}
    {props.channelUrl && <a href={props.channelUrl} rel="noreferrer" className={`${control} mt-6 inline-flex items-center`}>Open meeting in Discord</a>}</section>;
  if (expired) return <p className="mt-8 text-steel">This availability window has closed. Please contact Xenon in Discord for the next step.</p>;
  async function save(values: number[]) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/meetings/${props.id}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: props.userId, token: props.token, slots: values, timezone }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not save availability");
      setSlots(new Set(values)); setSaved(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save availability"); }
    finally { setBusy(false); }
  }
  return <section className="mt-8 border-t border-white/15 pt-6">
    <p className="mb-5 text-sm text-steel">{props.proposedSlots ? "Applicant's proposed meeting times" : "Your selected times will be shared with the invited Xenon managers."}</p>
    <label htmlFor="meeting-timezone" className="block text-sm font-semibold text-white">Timezone</label><select id="meeting-timezone" value={timezone} disabled={busy} onChange={(event) => { setTimezone(event.target.value); setDayIndex(0); setSaved(false); }} className={`${control} mt-2 w-full`}>
      {timezones.map((zone) => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}
    </select>
    {saved && <p role="status" className="mt-5 text-sm leading-6 text-ion">Availability saved. Check Discord for the meeting confirmation once everyone has responded.</p>}
    {props.status === "no_match" && !saved && <p className="mt-5 text-sm text-steel">No matching time yet. You can update your availability.</p>}
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><button className={control} disabled={busy || dayIndex === 0} onClick={() => setDayIndex(Math.max(0, dayIndex - 1))}>Previous day</button>
      <button className={control} disabled={busy || dayIndex >= days.length - 1} onClick={() => setDayIndex(Math.min(days.length - 1, dayIndex + 1))}>Next day</button></div>
    <fieldset disabled={busy} className="mt-5"><legend className="mb-4 text-base font-bold text-white">{day.length ? dateLabel(day[0]) : "No future slots"}<span className="mt-1 block text-xs font-normal text-steel">30-minute slots</span></legend>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{day.map((at) => <label key={at} className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border p-2 text-sm ${slots.has(at) ? "border-ion bg-ion/10 text-white" : "border-white/15 text-steel"}`}>
        <input type="checkbox" checked={slots.has(at)} className="h-4 w-4 accent-cyan-300" onChange={() => { setSlots((old) => { const next = new Set(old); if (next.has(at)) next.delete(at); else next.add(at); return next; }); setSaved(false); }} />{timeLabel(at)}</label>)}</div>
    </fieldset>
    <p className="mt-4 text-sm text-steel">{slots.size} selected across all days</p>
    {error && <p role="alert" className="mt-4 text-sm text-volt">{error}</p>}
    <div className="mt-6 flex flex-col gap-3 sm:flex-row"><button disabled={busy || slots.size === 0} onClick={() => save(Array.from(slots))} className={`${control} bg-ion/10 font-bold text-ion`}>{busy ? "Saving..." : "Save availability"}</button>
      <button disabled={busy} onClick={() => save([])} className={control}>No suitable times</button></div>
  </section>;
}
