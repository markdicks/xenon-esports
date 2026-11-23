import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { onAccent, socialHref, socialPlatforms, type SocialPage, type SocialDestinations } from "@/lib/socials-contract";
import { SocialIcon } from "@/components/socials/SocialIcon";
import "@/app/socials/socials.css";
export function SocialsContent({ page, destinations, preview = false }: { page: SocialPage; destinations: SocialDestinations; preview?: boolean }) {
  const a = page.appearance, links = page.links.filter((link) => link.visible && socialHref(link, destinations));
  const socials = socialPlatforms.filter((kind) => links.some((link) => link.kind === kind));
  return <main className={`socials-page socials-${a.buttonStyle} socials-${a.corners}${preview ? " socials-preview" : ""}`} style={{ "--social-bg": a.background, "--social-accent": a.accent, "--social-text": a.text, "--social-on-accent": onAccent(a.accent) } as CSSProperties}>
    <div className="socials-glow" aria-hidden="true" />
    <header className="socials-topbar"><Link href="/" className="socials-wordmark">XENON<span>ESPORTS</span></Link><Link href="/" className="socials-home">Visit website</Link></header>
    <div className="socials-container">
      {a.bannerUrl && <div className="socials-banner"><Image src={a.bannerUrl} alt="Xenon Esports" width={2172} height={724} priority unoptimized /></div>}
      <section className="socials-profile" aria-label="About Xenon">
        {a.logoUrl && <Image className="socials-avatar" src={a.logoUrl} width={96} height={96} alt="" unoptimized />}
        <p className="socials-eyebrow">OUR CORNER OF THE INTERNET</p><h1>{a.title}</h1><p className="socials-bio">{a.bio}</p>
        {a.showIcons && socials.length > 0 && <nav className="socials-icons" aria-label="Social channels">{socials.map((kind) => <a key={kind} href={destinations[kind]!} target="_blank" rel="noopener noreferrer" aria-label={`Xenon on ${kind}`}><SocialIcon kind={kind} /></a>)}</nav>}
      </section>
      <nav aria-label="Xenon links" className={`socials-links socials-layout-${a.layout}`}>{links.map((link) => <a className={`socials-link${link.featured ? " socials-featured" : ""}`} key={link.id} href={socialHref(link, destinations)!} target="_blank" rel="noopener noreferrer">
        {a.showIcons && <span className="socials-link-icon"><SocialIcon kind={link.kind} /></span>}<span className="socials-link-copy"><strong>{link.label}</strong>{link.description && <span>{link.description}</span>}</span>
      </a>)}</nav>
      {links.length === 0 && <p className="socials-empty">More Xenon links are on the way. <Link href="/">Visit our website.</Link></p>}
      <footer className="socials-footer"><span className="socials-footer-rule" /><p>{a.footer}</p><Link href="/">Xenon Esports</Link></footer>
    </div>
  </main>;
}
