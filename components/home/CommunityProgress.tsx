import Link from "next/link";
import { AwarenessBadge } from "@/components/collaborations/AwarenessBadge";
import { ValorantEventActions } from "@/components/events/ValorantEventActions";
import { collaborators } from "@/data/collaborations";
import { isEditorialReview, newsDate, visibleNews } from "@/data/news";
import { opportunityHref } from "@/data/recruitment-opportunities";
import { editorialValorantEvent } from "@/lib/editorial-events";
import { visibleOpportunities } from "@/lib/recruitment-opportunities";

export async function CommunityProgress() {
  const valorant = await editorialValorantEvent(false);
  const rosters = visibleOpportunities().filter(({ id }) => id === "rocket-league-roster" || id === "valorant-roster");

  return (
    <>
      <section className="border-y border-white/10 px-5 py-14 sm:px-8 sm:py-16" aria-labelledby="road-underway">
        <div className="mx-auto max-w-7xl">
          <h2 id="road-underway" className="max-w-4xl font-display text-3xl font-black leading-tight text-white sm:text-5xl">What we’re working on</h2>
          <p className="mt-4 max-w-3xl leading-7 text-steel">
            We’re reviewing applications, developing our Rocket League programmes and preparing December community events.
            We’re also speaking with other organisations about ways to work together.
          </p>
          {rosters.length ? (
            <ul className="mt-6 flex flex-wrap gap-x-7 gap-y-1 text-sm font-bold text-ion">
              {rosters.map((opportunity) => <li key={opportunity.id}>
                <Link href={opportunityHref(opportunity)} className="inline-flex min-h-11 items-center hover:underline">{opportunity.title} interest</Link>
              </li>)}
            </ul>
          ) : null}
          <div className="mt-7 rounded-lg border border-white/12 bg-white/[0.04] p-5 sm:p-6">
            <div className="grid gap-5 lg:grid-cols-2 lg:items-end">
              <div>
                <h3 className="font-display text-xl font-black text-white">December Valorant · Xenon x PPP</h3>
                <p className="mt-2 text-sm leading-6 text-steel">Choose between 2v2 Skirmish and standard 5v5 in the format poll. A separate 1v1 pre-show has six places.</p>
              </div>
              <ValorantEventActions event={valorant} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/10 pt-4">
              <AwarenessBadge partner={collaborators[0]} />
              <Link href="/events#rocket-league" className="inline-flex min-h-11 items-center text-sm font-bold text-ion hover:underline">Rocket League community event</Link>
            </div>
          </div>
        </div>
      </section>
      <section className="px-5 py-14 sm:px-8 sm:py-16" aria-labelledby="latest-news">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 id="latest-news" className="font-display text-3xl font-black text-white">Latest Xenon News</h2>
            <Link href="/updates" className="inline-flex min-h-11 items-center text-sm font-bold text-ion hover:underline">All news</Link>
          </div>
          {isEditorialReview() ? <p className="mt-2 text-sm font-bold text-volt">Local editorial review · Includes drafts</p> : null}
          <div className="mt-4 divide-y divide-white/10">
            {visibleNews().slice(0, 3).map((article) => (
              <article key={article.slug} className="grid gap-2 py-5 md:grid-cols-[180px_1fr] md:gap-4">
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm md:block">
                  <p className="font-bold text-ion">{article.category}</p>
                  <time dateTime={article.date} className="text-steel md:mt-1 md:block">{newsDate(article.date)}</time>
                  {article.status === "draft" ? <span className="font-bold text-volt md:mt-1 md:block">Draft</span> : null}
                </div>
                <div>
                  <h3 className="font-display text-xl font-black text-white"><Link href={`/updates/${article.slug}`} className="hover:text-ion">{article.title}</Link></h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-steel">{article.summary}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
