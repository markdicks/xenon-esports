import Link from "next/link";
import { opportunityHref } from "@/data/recruitment-opportunities";
import { visibleOpportunities } from "@/lib/recruitment-opportunities";

export function RecruitmentOpportunities() {
  const opportunities = visibleOpportunities();
  if (!opportunities.length) return null;

  return <section className="mt-10" aria-labelledby="recruitment-opportunities">
    <h2 id="recruitment-opportunities" className="font-display text-2xl font-black text-white sm:text-3xl">Current opportunities</h2>
    <ul className="mt-4 grid gap-3 sm:grid-cols-2">
      {opportunities.map((opportunity) => (
        <li key={opportunity.id} className="rounded-lg bg-white/[0.04] p-5 ring-1 ring-white/10">
          <h3 className="font-display text-lg font-bold text-white">{opportunity.title}</h3>
          <p className="mt-2 text-sm leading-6 text-steel">{opportunity.summary}</p>
          <Link href={opportunityHref(opportunity)} className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-ion hover:underline">
            Express interest<span className="sr-only"> in {opportunity.title}</span>
          </Link>
        </li>
      ))}
    </ul>
  </section>;
}
