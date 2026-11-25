import Image from "next/image";
import type { ReactNode } from "react";

export function CollaborationHero({ eyebrow, title, artwork, artworkAlt, logo, children }: { eyebrow: string; title: string; artwork: string; artworkAlt: string; logo?: string; children: ReactNode }) {
  return (
    <section className="collaboration-hero" aria-labelledby="collaboration-title">
      <div className="collaboration-hero-art">
        <Image src={artwork} alt={artworkAlt} width={1920} height={396} sizes="100vw" priority />
      </div>
      <div className="collaboration-hero-inner">
        {logo && <div className="collaboration-logo"><Image src={logo} alt="Xenon × PPP crowned XP collaboration logo" width={1500} height={2000} sizes="112px" /></div>}
        <div className="collaboration-hero-copy">
          <p className="collaboration-eyebrow">{eyebrow}</p>
          <h1 id="collaboration-title" className="font-display">{title}</h1>
          {children}
        </div>
      </div>
    </section>
  );
}
