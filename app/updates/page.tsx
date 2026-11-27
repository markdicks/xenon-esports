import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import Link from "next/link";
import type { Metadata } from "next";
import { visibleNews, isEditorialReview, newsDate } from "@/data/news";

export const dynamic = "force-dynamic";
export function generateMetadata(): Metadata {
  const title = "News & Updates | Xenon Esports";
  const description = "Follow Xenon’s recruiting, Rocket League and Valorant programmes, content work and community events.";
  const images = ["/branding/socials-banner.webp"];
  return { title, description, alternates: { canonical: "/updates" },
    robots: isEditorialReview() ? { index: false, follow: false } : undefined,
    openGraph: { title, description, url: "/updates", images },
    twitter: { card: "summary_large_image", title, description, images },
  };
}

export default function UpdatesPage() {
  return (
    <main className="xenon-shell min-h-screen">
      <Navbar />
      <section className="px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <p className="font-display text-xs font-bold uppercase tracking-[0.34em] text-ion">Updates</p>
          <h1 className="mt-4 max-w-4xl font-display text-5xl font-black leading-none text-white sm:text-7xl">Xenon news.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-steel">Recruitment, community events and the work behind our January 2027 return.</p>
          {isEditorialReview() ? <p className="mt-6 text-sm font-bold text-volt">Local editorial review · Drafts and proposed release dates</p> : null}
          <div className="mt-10 divide-y divide-white/10 border-y border-white/10">
            {visibleNews().map((article) => (
              <article key={article.slug} className="grid gap-3 py-7 md:grid-cols-[180px_1fr] md:gap-5">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm md:block">
                  <p className="font-bold text-ion">{article.category}</p>
                  <time dateTime={article.date} className="text-steel md:mt-2 md:block">{newsDate(article.date)}</time>
                  {article.status === "draft" ? <span className="font-bold text-volt md:mt-2 md:block">Draft</span> : null}
                </div>
                <div>
                  <h2 className="font-display text-2xl font-black text-white sm:text-3xl">
                    <Link href={`/updates/${article.slug}`} className="hover:text-ion">{article.title}</Link>
                  </h2>
                  <p className="mt-3 max-w-3xl leading-7 text-steel">{article.summary}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
