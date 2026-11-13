import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { publicCommunityEvent } from "@/lib/community-events";
import { valorantEventId } from "@/lib/community-contract";
import { PreShowForm } from "./PreShowForm";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Valorant 1v1 Pre-Show | Xenon Esports", description: "Register interest for a chance to be one of six selected players in Xenon's exclusive Valorant 1v1 showcase.", alternates: { canonical: "/events/valorant/pre-show" }, openGraph: { title: "Xenon Valorant - 1v1 Pre-Show", description: "Six selected players. Register your interest when applications open.", images: ["/branding/logoXE.webp"] } };
export default async function PreShowPage() {
  const event = await publicCommunityEvent(valorantEventId);
  return <main className="xenon-shell min-h-screen"><Navbar /><section className="px-5 py-12 sm:px-8 sm:py-20"><div className="mx-auto max-w-3xl"><Link href="/events" className="text-sm font-bold text-ion hover:underline">December events</Link>
    <p className="mt-9 font-display text-xs font-bold uppercase text-ion">Xenon / December community event</p><h1 className="mt-4 font-display text-4xl font-black leading-tight text-white sm:text-6xl">Valorant 1v1 Pre-Show.</h1>
    <p className="mt-5 text-lg leading-8 text-steel">Before the main event begins, we&apos;re giving six selected players the opportunity to take part in an exclusive 1v1 showcase. Register your interest for a chance to be selected.</p>
    <p className="mt-5 leading-7 text-steel"><strong className="text-white">Only 6 players will be accepted.</strong> This is separate from the main tournament format vote. Submitting interest does not guarantee selection. Dates, format, match order and rules are still being decided.</p>
    <PreShowForm initial={event} />
  </div></section><Footer /></main>;
}
