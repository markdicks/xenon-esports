import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";
import { CollaborationHero } from "@/components/collaborations/CollaborationHero";
import { EventCollaborators } from "@/components/collaborations/EventCollaborators";
import { collaborators, eventOrganisers } from "@/data/collaborations";
import { publicCommunityEvent } from "@/lib/community-events";
import { valorantEventId } from "@/lib/community-contract";
import { DISCORD_INVITE_URL } from "@/lib/public-links";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Xenon x PPP | December Valorant Event",
  description: "Xenon and Powerpuff Potatoes are co-hosting the December Valorant community event. Discover PPP, vote on the main format and register interest for the separate 1v1 pre-show when open.",
  alternates: { canonical: "/events/valorant" },
  openGraph: { title: "Xenon x PPP - Valorant", description: "Two communities. One shared Valorant event. Where community comes first.", images: [collaborators[0].artwork] },
};
export default async function ValorantEventPage() {
  const event = await publicCommunityEvent(valorantEventId, false), active = event.available && !["closed", "complete"].includes(event.settings.status);
  return <main className="xenon-shell collab-event min-h-screen"><Navbar />
    <CollaborationHero eyebrow="December 2026 / Valorant / Event collaboration" title="Xenon x PPP" artwork={collaborators[0].artwork} artworkAlt={collaborators[0].artworkAlt} logo={collaborators[0].logo}>
      <p className="collaboration-slogan">Two communities. One shared event.</p>
      <p className="collaboration-hero-description">Xenon and Powerpuff Potatoes are bringing the December Valorant community event together.</p>
      <div className="collaboration-actions"><Button href="/events/valorant/vote">{active && event.settings.pollOpen ? "Vote Now" : "View the format vote"}</Button>{active && event.settings.registrationOpen ? <Button href="/events/valorant/pre-show" variant="secondary">Register Interest</Button> : <Link href="/events/valorant/pre-show" className="collaboration-text-link">Pre-show details</Link>}</div>
    </CollaborationHero>
    <section className="px-5 py-10 sm:px-8 sm:py-14"><div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-4"><Link href="/events" className="collaboration-text-link">All December events<span aria-hidden="true"> &rarr;</span></Link><span className="collaboration-status">{event.settings.status === "complete" ? "Complete" : event.settings.status === "closed" ? "Closed" : event.settings.status === "announced" ? "Announced" : "In planning"}</span></div>
      <div className="mt-8 grid gap-10 lg:grid-cols-[1.2fr_0.8fr]"><div className="community-event-details"><p className="collaboration-eyebrow">The main event</p><h2 className="mt-4 font-display text-3xl font-black text-white">{event.settings.name}</h2><p className="mt-5 max-w-3xl leading-8 text-steel">{event.settings.description}</p><p className="mt-4 max-w-3xl leading-8 text-steel">{collaborators[0].events[0].contribution} Community preference will help shape the format; organisers will confirm the final plan.</p><p className="mt-4 text-sm leading-7 text-steel">{event.settings.participation}</p></div>
        <dl className="collaboration-event-facts"><div><dt>Date / time</dt><dd>{event.settings.startsAt ? `${new Intl.DateTimeFormat("en-ZA", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(event.settings.startsAt))} SAST (UTC+2)` : "To be confirmed"}</dd></div><div><dt>Final format</dt><dd>{event.settings.format || "To be confirmed by organisers"}</dd></div><div><dt>Organisers</dt><dd>{eventOrganisers(event.id, event.settings.organisers).join(", ")}</dd></div></dl>
      </div>
      <div className="collaboration-event-options mt-10"><article><p className="collaboration-eyebrow">Have your say</p><h3 className="mt-3 font-display text-2xl font-black text-white">2v2 or 5v5?</h3><p className="mt-3 text-sm leading-7 text-steel">The organisers will consider the poll results when confirming the main tournament format.</p><Link href="/events/valorant/vote" className="collaboration-text-link mt-3">{active && event.settings.pollOpen ? "Voting open" : "View poll and current status"}<span aria-hidden="true"> &rarr;</span></Link></article><article><p className="collaboration-eyebrow">A separate showcase</p><h3 className="mt-3 font-display text-2xl font-black text-white">Six-player 1v1 pre-show</h3><p className="mt-3 text-sm leading-7 text-steel">Players can put their names forward while registration is open. Organisers will select six players.</p><Link href="/events/valorant/pre-show" className="collaboration-text-link mt-3">{active && event.settings.registrationOpen ? "Register Interest" : "View pre-show details"}<span aria-hidden="true"> &rarr;</span></Link></article></div>
      {!event.available ? <p className="community-notice mt-6" role="status">Live event details are temporarily unavailable. Voting and registration remain disabled.</p> : null}
      {event.settings.links.length ? <nav aria-label="Related event links" className="mt-6 flex flex-wrap gap-5">{event.settings.links.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="collaboration-text-link">{link.label}<span aria-hidden="true"> &#8599;</span></a>)}</nav> : null}
      <EventCollaborators eventId={event.id} />
      <div className="mt-8 flex flex-wrap items-center gap-6"><Button href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer">Join Xenon Discord</Button><Link href="/collaborations" className="collaboration-text-link">Explore our collaborations<span aria-hidden="true"> &rarr;</span></Link></div>
    </div></section><Footer /></main>;
}
