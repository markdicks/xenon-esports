import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";
import { publicCommunityEvents } from "@/lib/community-events";
import { valorantEventId } from "@/lib/community-contract";
import { DISCORD_INVITE_URL } from "@/lib/public-links";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "December Community Events | Xenon Esports",
  description: "Valorant and Rocket League community activities in planning for December 2026, including a format vote and a separate six-player Valorant pre-show.",
  alternates: { canonical: "/events" },
  openGraph: { title: "Xenon December Community Events", description: "Help shape the Valorant event and discover the separate six-player 1v1 pre-show.", url: "/events", images: [{ url: "/branding/logoXE.webp", alt: "Xenon Esports" }] },
};
export default async function EventsPage() {
  const events = await publicCommunityEvents();
  return <main className="xenon-shell min-h-screen"><Navbar /><section className="px-5 py-14 sm:px-8 sm:py-20"><div className="mx-auto max-w-7xl"><p className="font-display text-xs font-bold uppercase text-ion">December 2026 / Community</p><h1 className="mt-4 font-display text-5xl font-black leading-tight text-white sm:text-7xl">Xenon community events.</h1><p className="mt-6 max-w-3xl text-lg leading-8 text-steel">Our first December activities are in planning. Get involved in shaping them, with confirmed details clearly separated from decisions still to come.</p>
    <div className="mt-12 divide-y divide-white/10 border-t border-white/10">{events.map((event) => <article key={event.id} id={event.id === valorantEventId ? "valorant" : "rocket-league"} className="grid gap-8 py-10 lg:grid-cols-[240px_1fr]"><div><p className="font-display text-2xl font-black text-ion">{event.game}</p><p className="mt-3 text-sm text-steel">{event.settings.status === "planning" ? "In planning" : event.settings.status === "complete" ? "Complete" : event.settings.status === "closed" ? "Closed" : "Announced"}{event.available && event.settings.pollOpen ? " / Community voting open" : ""}</p></div><div className="community-event-details"><h2 className="font-display text-3xl font-black text-white">{event.settings.name}</h2><p className="mt-4 max-w-3xl leading-7 text-steel">{event.settings.description}</p><dl className="mt-6 grid gap-5 text-sm sm:grid-cols-2"><div><dt className="font-bold text-white">Date / time</dt><dd className="mt-2 text-steel">{event.settings.startsAt ? `${new Intl.DateTimeFormat("en-ZA", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(event.settings.startsAt))} SAST (UTC+2)` : "To be confirmed"}</dd></div><div><dt className="font-bold text-white">Format</dt><dd className="mt-2 text-steel">{event.settings.format || "To be confirmed by organisers"}</dd></div><div><dt className="font-bold text-white">Organisers</dt><dd className="mt-2 text-steel">{event.settings.organisers.join(", ") || "To be confirmed"}</dd></div><div><dt className="font-bold text-white">Registration</dt><dd className="mt-2 text-steel">{event.id === valorantEventId && event.available && event.settings.registrationOpen ? "1v1 pre-show interest open; main event details to follow" : "Not currently open"}</dd></div></dl><p className="mt-6 max-w-3xl text-sm leading-7 text-steel">{event.settings.participation}</p>
      {event.id === valorantEventId ? <div className="mt-6 flex flex-wrap gap-3"><Button href="/events/valorant/vote">{event.available && event.settings.pollOpen ? "Vote on the format" : "View format vote"}</Button><Button href="/events/valorant/pre-show" variant="secondary">1v1 pre-show interest</Button></div> : <p className="mt-6 text-sm font-bold text-ion">Details coming soon</p>}
      {event.settings.links.length ? <div className="mt-5 flex flex-wrap gap-5">{event.settings.links.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="text-sm font-bold text-ion hover:underline">{link.label}</a>)}</div> : null}
      {!event.available ? <p className="mt-5 text-sm text-steel">Live event details are temporarily unavailable. Voting and registration remain disabled.</p> : null}
    </div></article>)}</div><div className="mt-8 flex flex-wrap items-center gap-5"><Button href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer">Join Discord</Button><Link href="/join/interest" className="text-sm font-bold text-ion hover:underline">Help organise an event</Link></div>
  </div></section><Footer /></main>;
}
