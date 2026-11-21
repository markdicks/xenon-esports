import { z } from "zod";

const halfHour = 30 * 60 * 1000;
export function mondayOf(date: string) {
  const day = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) throw new Error("Invalid calendar date");
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return day.toISOString().slice(0, 10);
}
export const weekSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((date) => {
  try { return mondayOf(date) === date; } catch { return false; }
}, "Choose a week starting on Monday");
const slotsSchema = z.array(z.number().int().min(0).max(335)).max(336).refine((slots) => new Set(slots).size === slots.length);
export const profileSchema = z.object({
  enabled: z.boolean().default(true),
  timezone: z.string().max(100).refine((zone) => { try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; } }),
  weeklySlots: slotsSchema,
  mode: z.enum(["recurring", "individual"]).default("recurring"),
  weeks: z.array(z.object({ weekStart: weekSchema, slots: slotsSchema }).strict()).max(52)
    .refine((weeks) => new Set(weeks.map((week) => week.weekStart)).size === weeks.length).default([]),
  revision: z.string().uuid().nullable().default(null),
}).strict();
export type AvailabilityProfile = z.infer<typeof profileSchema>;
const storedSchema = profileSchema.omit({ enabled: true, timezone: true }).extend({ version: z.literal(2), revision: z.string().uuid() });

export function readAvailabilityProfile(row: { timezone: unknown; weekly_slots: unknown }): AvailabilityProfile {
  const value = typeof row.weekly_slots === "string" ? JSON.parse(row.weekly_slots) : row.weekly_slots;
  if (Array.isArray(value)) return profileSchema.parse({ timezone: row.timezone, weeklySlots: value });
  const profile = storedSchema.parse(value);
  return profileSchema.parse({ timezone: row.timezone, revision: profile.revision, mode: profile.mode, weeklySlots: profile.weeklySlots, weeks: profile.weeks });
}
export function writeAvailabilityProfile(profile: AvailabilityProfile, revision: string) {
  return JSON.stringify(storedSchema.parse({ version: 2, revision, mode: profile.mode,
    weeklySlots: [...profile.weeklySlots].sort((a, b) => a - b),
    weeks: [...profile.weeks].sort((a, b) => a.weekStart.localeCompare(b.weekStart)).map((week) => ({ ...week, slots: [...week.slots].sort((a, b) => a - b) })) }));
}
export function slotsForWeek(profile: AvailabilityProfile, weekStart: string): number[] | null {
  if (!profile.enabled) return null;
  return profile.mode === "recurring" ? profile.weeklySlots : profile.weeks.find((week) => week.weekStart === weekStart)?.slots ?? null;
}
export function expandProfileAvailability(profile: AvailabilityProfile, start: number, end: number) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: profile.timezone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const atSlot = (at: number) => {
    const parts = formatter.formatToParts(at), part = (type: string) => parts.find((row) => row.type === type)!.value;
    const week = mondayOf(`${part("year")}-${part("month")}-${part("day")}`);
    return { week, index: weekdays.indexOf(part("weekday")) * 48 + Number(part("hour")) * 2 + Math.floor(Number(part("minute")) / 30) };
  };
  const slots: number[] = [];
  let complete = true;
  for (let at = start; at < end; at += halfHour) {
    const first = atSlot(at), last = atSlot(at + halfHour - 1);
    const selected = slotsForWeek(profile, first.week), ending = first.week === last.week ? selected : slotsForWeek(profile, last.week);
    if (selected === null || ending === null) complete = false;
    if (selected?.includes(first.index) && ending?.includes(last.index)) slots.push(at);
  }
  return { slots, complete };
}
