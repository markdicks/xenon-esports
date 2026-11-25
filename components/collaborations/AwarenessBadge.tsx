import Link from "next/link";
import type { Collaborator } from "@/data/collaborations";

export function AwarenessBadge({ partner }: { partner: Collaborator }) {
  if (!partner.awareness) return null;
  return <Link href={`/collaborations/${partner.slug}#community-safety`} className="awareness-badge">
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8.5 4.5c0-3 7-3 7 0 0 4-5 10-9 16l-3-3c4-5 10-10 11-13M9 6c1 4 5 9 9 14l3-3C17 12 12 7 9 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    <span>Against GBV &amp; femicide<span className="sr-only"> · {partner.shortName} community safety awareness</span></span>
  </Link>;
}
