import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { publicCommunityEvent } from "@/lib/community-events";
import { valorantEventId } from "@/lib/community-contract";
import { ValorantPoll } from "./ValorantPoll";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Valorant Event Vote | Xenon Esports", description: "Help shape Xenon's December Valorant community event: 2v2 Skirmish BO3 or a 5v5 Standard Tournament.", alternates: { canonical: "/events/valorant/vote" }, openGraph: { title: "Xenon Valorant - You decide what we play", description: "Express your preference for the December community event.", images: ["/branding/logoXE.webp"] } };
export default async function ValorantVotePage() {
  const event = await publicCommunityEvent(valorantEventId);
  return <main className="xenon-shell min-h-screen"><Navbar /><section className="px-5 py-12 sm:px-8 sm:py-20"><div className="mx-auto max-w-3xl">
    <Link href="/events" className="text-sm font-bold text-ion hover:underline">December events</Link>
    <p className="mt-9 font-display text-xs font-bold uppercase text-ion">Xenon Valorant / December community event</p>
    <h1 className="mt-4 font-display text-4xl font-black leading-tight text-white sm:text-6xl">You decide what we play.</h1>
    <p className="mt-5 text-lg leading-8 text-steel">2v2 Skirmish or 5v5 Standard? Share your preference for the main event. Dates and the final format are not confirmed.</p>
    <ValorantPoll initial={event} />
    <div className="mt-10 border-t border-white/10 pt-7"><p className="text-sm leading-7 text-steel">Looking for the separate six-player 1v1 showcase?</p><Link href="/events/valorant/pre-show" className="mt-2 inline-flex min-h-11 items-center font-bold text-ion hover:underline">Register pre-show interest</Link></div>
  </div></section><Footer /></main>;
}
