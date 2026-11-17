import Image from "next/image";
import type { ReactNode } from "react";

export function CollaborationHero({ eyebrow, title, artwork, artworkAlt, children }: { eyebrow: string; title: string; artwork: string; artworkAlt: string; children: ReactNode }) {
  return (
    <section className="collaboration-hero" aria-labelledby="collaboration-title">
      <div className="collaboration-hero-art">
        <Image src={artwork} alt={artworkAlt} fill sizes="100vw" priority className="object-cover" />
      </div>
      <div className="collaboration-hero-inner">
        <div className="collaboration-hero-copy">
          <p className="collaboration-eyebrow">{eyebrow}</p>
          <h1 id="collaboration-title" className="font-display">{title}</h1>
          {children}
        </div>
      </div>
    </section>
  );
}
