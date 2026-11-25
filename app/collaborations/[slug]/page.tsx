import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";
import { CollaborationHero } from "@/components/collaborations/CollaborationHero";
import { getCollaborator } from "@/data/collaborations";
import Image from "next/image";
import { AwarenessBadge } from "@/components/collaborations/AwarenessBadge";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const partner = getCollaborator((await params).slug);
  if (!partner) notFound();
  return { title: `${partner.name} (${partner.shortName}) | Xenon Collaborations`, description: `${partner.slogan}. ${partner.focus}`,
    alternates: { canonical: `/collaborations/${partner.slug}` },
    openGraph: { title: `${partner.name} x Xenon`, description: partner.message, images: [partner.artwork] } };
}
export default async function CollaboratorPage({ params }: Props) {
  const partner = getCollaborator((await params).slug);
  if (!partner) notFound();
  return <main className="xenon-shell min-h-screen"><Navbar />
    <CollaborationHero eyebrow={`Meet our event collaborator / ${partner.label}`} title={partner.name} artwork={partner.artwork} artworkAlt={partner.artworkAlt} logo={partner.logo}>
      <p className="collaboration-slogan">{partner.slogan}.</p>
      <p className="collaboration-hero-description">South African tournaments. Friendly banter. A place for every rank.</p>
      <div className="collaboration-actions"><Button href={partner.events[0].href}>Our Valorant event</Button><a href="#about-ppp" className="collaboration-text-link">About {partner.shortName}<span aria-hidden="true"> &darr;</span></a></div>
      <AwarenessBadge partner={partner} />
    </CollaborationHero>
    <section id="about-ppp" className="scroll-mt-52 px-5 py-12 sm:px-8 sm:py-16"><div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[0.8fr_1.2fr]">
      <div><Link href="/collaborations" className="collaboration-text-link">All collaborations<span aria-hidden="true"> &rarr;</span></Link><h2 className="mt-6 font-display text-3xl font-black leading-tight text-white sm:text-4xl">No egos.<br />No rank shaming.</h2><p className="mt-5 text-lg font-semibold text-ion">All ranks are welcome.</p></div>
      <div><p className="text-lg leading-8 text-white">{partner.message}</p><p className="mt-5 leading-8 text-steel">{partner.name}, also known as {partner.label}, focuses on {partner.focus.charAt(0).toLowerCase() + partner.focus.slice(1)}</p><p className="mt-4 leading-8 text-steel">{partner.philosophy}</p>
        <nav aria-label={`${partner.name} social links`} className="mt-6 flex flex-wrap gap-x-6 gap-y-1">{partner.socials.map((social) => <a key={social.label} href={social.url} target="_blank" rel="noreferrer" className="collaboration-text-link">{social.label}<span aria-hidden="true"> &#8599;</span></a>)}</nav>
      </div>
    </div></section>
    <section className="border-y border-white/10 px-5 py-12 sm:px-8 sm:py-16"><div className="mx-auto max-w-7xl"><p className="collaboration-eyebrow">Together with Xenon</p><h2 className="mt-4 font-display text-3xl font-black text-white">Our shared events.</h2><div className="mt-7 divide-y divide-white/10">{partner.events.map((event) => <article key={event.id} className="grid items-center gap-6 border-t border-white/10 py-6 md:grid-cols-[1fr_auto]"><div><h3 className="font-display text-xl font-bold text-white">{event.name}</h3><p className="mt-3 max-w-3xl leading-7 text-steel">{event.contribution}</p><p className="mt-3 text-sm text-steel">The collaboration is agreed. Check the event page for confirmed dates, the final format and event-specific rules.</p></div><Button href={event.href} variant="secondary">View the event</Button></article>)}</div></div></section>
    {partner.awareness && <section id="community-safety" className="ppp-awareness scroll-mt-32 px-5 py-14 sm:px-8 sm:py-20" aria-labelledby="ppp-safety-title"><div className="mx-auto max-w-5xl">
      <p className="collaboration-eyebrow">PPP / Community safety</p><h2 id="ppp-safety-title" className="mt-4 max-w-3xl font-display text-3xl font-black leading-tight text-white sm:text-5xl">{partner.awareness.headline}</h2>
      <p className="mt-6 max-w-3xl leading-8 text-steel">{partner.awareness.message}</p>
      <figure className="ppp-awareness-poster"><Image src={partner.awareness.poster} alt={partner.awareness.posterAlt} width={2828} height={4000} sizes="(max-width: 700px) 100vw, 700px" /><figcaption>PPP&apos;s anti-femicide awareness message. <a href={partner.awareness.poster} target="_blank" rel="noreferrer">Open the full-size poster<span aria-hidden="true"> ↗</span></a></figcaption></figure>
    </div></section>}
    <Footer /></main>;
}
