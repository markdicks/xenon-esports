import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AwarenessBadge } from "@/components/collaborations/AwarenessBadge";
import { ValorantEventActions } from "@/components/events/ValorantEventActions";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";
import { collaborators } from "@/data/collaborations";
import { isEditorialReview, visibleArticle, visibleNews, newsDate } from "@/data/news";
import { getStaffRoles } from "@/lib/discord-roster";
import { editorialValorantEvent } from "@/lib/editorial-events";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = visibleArticle((await params).slug);
  if (!article) notFound();
  const { title, summary: description, date } = article;
  const url = `/updates/${article.slug}`;
  const image = article.image || {
    src: "/branding/socials-banner.webp", alt: "Xenon Esports", width: 2172, height: 724,
  };
  const images = [{ url: image.src, width: image.width, height: image.height, alt: image.alt }];
  return {
    title: `${title} | Xenon Esports`, description, alternates: { canonical: url },
    robots: isEditorialReview() ? { index: false, follow: false } : undefined,
    openGraph: { type: "article", title, description, url, images, section: article.category,
      ...(article.status === "published" && date.length > 7 ? { publishedTime: date } : {}) },
    twitter: { card: "summary_large_image", title, description, images: [image.src] },
  };
}

export default async function NewsArticlePage({ params }: Props) {
  const article = visibleArticle((await params).slug);
  if (!article) notFound();

  const [roles, event] = await Promise.all([
    article.leadership ? getStaffRoles() : [],
    article.event === "valorant" ? editorialValorantEvent() : null,
  ]);
  const candidates = visibleNews().filter(({ slug }) => slug !== article.slug);
  const related = article.related
    ? article.related.flatMap((slug) => candidates.filter((candidate) => candidate.slug === slug))
    : candidates.filter(({ category }) => category === article.category).slice(0, 2);

  return (
    <main className="xenon-shell min-h-screen">
      <Navbar />
      <article className="px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <Link href="/updates" className="inline-flex min-h-11 items-center text-sm font-bold text-ion hover:underline">All Xenon news</Link>

          <header className="mt-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-steel">
              <span className="font-bold text-ion">{article.category}</span>
              <time dateTime={article.date}>{newsDate(article.date)}</time>
              {article.status === "draft" ? <span className="font-bold text-volt">Draft · Proposed release</span> : null}
            </div>
            <h1 className="mt-4 font-display text-4xl font-black leading-tight text-white sm:text-6xl">{article.title}</h1>
            <p className="mt-5 text-lg leading-8 text-steel">{article.summary}</p>
          </header>

          {article.image ? (
            <Image
              className="mt-8 h-auto w-full rounded-lg border border-white/10"
              src={article.image.src} alt={article.image.alt}
              width={article.image.width} height={article.image.height}
              sizes="(min-width: 832px) 768px, calc(100vw - 40px)"
            />
          ) : null}

          <div className="mt-8 space-y-5 border-t border-white/10 pt-7">
            {article.content.map((paragraph, index) => <p key={index} className="leading-8 text-steel">{paragraph}</p>)}
          </div>

          {roles.length ? (
            <section className="mt-9 border-t border-white/10 pt-7" aria-labelledby="article-leadership">
              <h2 id="article-leadership" className="font-display text-2xl font-black text-white">The people behind the work</h2>
              <dl className="mt-4 divide-y divide-white/10">
                {roles.map((role) => <div key={role.id} className="py-5">
                  <dt className="font-bold text-white">{role.title}</dt>
                  <dd className="mt-2 leading-7 text-steel">
                    {role.holders.length ? role.holders.map((member) => member.nickname).join(", ") : role.status === "unavailable" ? "Role holders are syncing from Discord." : "Currently unassigned"}
                    <p className="mt-2 text-sm">{role.responsibilities.join(" · ")}</p>
                  </dd>
                </div>)}
              </dl>
            </section>
          ) : null}

          {event ? (
            <section className="mt-9 space-y-4 rounded-lg border border-white/12 bg-white/[0.04] p-5 sm:p-6" aria-labelledby="article-event">
              <h2 id="article-event" className="font-display text-2xl font-black text-white">Take part in the Valorant event</h2>
              <ValorantEventActions event={event} showResults />
              <AwarenessBadge partner={collaborators[0]} />
            </section>
          ) : null}

          {article.action ? (
            <div className="mt-9"><Button href={article.action.href}>{article.action.label}</Button></div>
          ) : null}

          {related.length ? (
            <aside className="mt-12 border-t border-white/10 pt-7" aria-labelledby="related-news">
              <h2 id="related-news" className="font-display text-xl font-black text-white">Related news</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {related.map((item) => (
                  <li key={item.slug}>
                    <Link href={`/updates/${item.slug}`} className="inline-flex min-h-11 items-center py-2 font-bold text-ion hover:underline">{item.title}</Link>
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}
        </div>
      </article>
      <Footer />
    </main>
  );
}
