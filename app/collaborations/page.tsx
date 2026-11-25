import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";
import { collaborators } from "@/data/collaborations";
import { AwarenessBadge } from "@/components/collaborations/AwarenessBadge";
import { publicCommunityEvents } from "@/lib/community-events";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Collaborations | Xenon Esports",
  description: "Meet the organisations and people collaborating with Xenon, and explore the events and projects we share. Featuring Powerpuff Potatoes and our December Valorant event.",
  alternates: { canonical: "/collaborations" },
  openGraph: { title: "Xenon Collaborations", description: "Shared events. Connected communities. Meet PPP Tournaments and discover our Valorant collaboration.", images: [collaborators[0].artwork] },
};

export default async function CollaborationsPage() {
  const events = await publicCommunityEvents();
  return <main className="xenon-shell min-h-screen"><Navbar />
    <section className="px-5 py-12 sm:px-8 sm:py-16"><div className="mx-auto max-w-7xl">
      <p className="collaboration-eyebrow">People / organisations / shared events</p>
      <h1 className="mt-4 font-display text-4xl font-black leading-tight text-white sm:text-6xl">Collaborations.</h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-steel">Different communities, something shared. Meet the people and organisations we work with, and see the events behind each collaboration.</p>
      <div className="mt-10 divide-y divide-white/10">{collaborators.map((partner) => <article key={partner.slug} className="pb-10">
        <div className="collaboration-directory-banner"><Image src={partner.artwork} alt={partner.artworkAlt} width={1920} height={396} sizes="(max-width: 1280px) 100vw, 1280px" /><div><p className="collaboration-eyebrow">Event collaborator / South Africa</p><h2 className="mt-3 font-display text-3xl font-black leading-tight text-white sm:text-4xl">{partner.name}</h2><p className="mt-3 text-sm text-white/80">{partner.slogan}.</p><AwarenessBadge partner={partner} /></div></div>
        <div className="grid gap-8 border-b border-white/10 py-7 md:grid-cols-[1fr_1.2fr]"><div><p className="max-w-lg leading-7 text-steel">{partner.focus} Xenon and {partner.shortName} are working together on the Valorant community event.</p><Link className="collaboration-text-link mt-4" href={`/collaborations/${partner.slug}`}>About {partner.shortName}<span aria-hidden="true"> &rarr;</span></Link></div><div><h3 className="text-xs font-bold uppercase text-steel">Events together</h3><ul className="mt-3 divide-y divide-white/10">{partner.events.map((shared) => {
          const current = events.find((event) => event.id === shared.id);
          const status = current?.settings.status === "complete" ? "Completed" : current?.settings.status === "closed" ? "Closed" : current?.settings.status === "announced" ? "Announced" : "In planning";
          return <li key={shared.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><Link href={shared.href} className="min-h-11 max-w-sm content-center font-bold text-white hover:text-ion">{shared.name}<span aria-hidden="true"> &rarr;</span></Link><span className="collaboration-status">{status}</span></li>;
        })}</ul></div></div>
      </article>)}</div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-5 border-t border-white/10 pt-8"><div><h2 className="font-display text-2xl font-black text-white">Build something with Xenon.</h2><p className="mt-3 text-sm leading-7 text-steel">For event collaborations, partnerships or community projects, start a conversation.</p></div><Button href="/contact">Contact Xenon</Button></div>
    </div></section><Footer /></main>;
}
