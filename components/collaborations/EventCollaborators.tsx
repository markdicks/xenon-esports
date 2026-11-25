import Image from "next/image";
import Link from "next/link";
import type { EventId } from "@/lib/community-contract";
import { collaboratorsForEvent } from "@/data/collaborations";
import { AwarenessBadge } from "./AwarenessBadge";

export function EventCollaborators({ eventId }: { eventId: EventId }) {
  const partners = collaboratorsForEvent(eventId);
  if (!partners.length) return null;
  return <aside className="event-collaborators" aria-label="Event collaborators">
    {partners.map((partner) => <div key={partner.slug} className="event-collaborator-row">
      <div className="event-collaborator-art"><Image src={partner.logo} alt="Xenon × PPP crowned XP collaboration logo" width={1500} height={2000} sizes="84px" /></div>
      <div className="min-w-0"><p className="collaboration-eyebrow">Co-hosted with {partner.label}</p><h2 className="mt-2 text-lg font-bold text-white">Xenon &amp; {partner.name}</h2><p className="mt-2 text-sm leading-6 text-steel">{partner.slogan}. South African gaming, with all ranks welcome in the community.</p><Link href={`/collaborations/${partner.slug}`} className="collaboration-text-link mt-2">Meet {partner.shortName}<span aria-hidden="true"> &rarr;</span></Link></div>
      <div className="event-collaborator-awareness"><AwarenessBadge partner={partner} /></div>
    </div>)}
  </aside>;
}
