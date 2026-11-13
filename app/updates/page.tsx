import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import Link from "next/link";
import type { Metadata } from "next";
import { publishedNews, newsDate } from "@/data/news";

export const metadata: Metadata = { title: "News & Updates | Xenon Esports", description: "Recruitment, Rocket League development and December community events on the road to January 2027.", alternates: { canonical: "/updates" } };

export default function UpdatesPage() {
  return (
    <main className="xenon-shell min-h-screen">
      <Navbar />
      <section className="px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <p className="font-display text-xs font-bold uppercase tracking-[0.34em] text-ion">Updates</p>
          <h1 className="mt-4 max-w-4xl font-display text-5xl font-black leading-none text-white sm:text-7xl">Xenon news.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-steel">Recruitment, community events and the work behind our January 2027 return.</p>
          <div className="mt-12 divide-y divide-white/10 border-y border-white/10">{publishedNews().map((article) => <article key={article.slug} className="grid gap-5 py-8 md:grid-cols-[180px_1fr]"><div className="text-sm"><p className="font-bold text-ion">{article.category}</p><time dateTime={article.date} className="mt-2 block text-steel">{newsDate(article.date)}</time></div><div><h2 className="font-display text-2xl font-black text-white sm:text-3xl"><Link href={`/updates/${article.slug}`} className="hover:text-ion">{article.title}</Link></h2><p className="mt-3 max-w-3xl leading-7 text-steel">{article.summary}</p><Link href={`/updates/${article.slug}`} className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-ion hover:underline">Read article<span className="sr-only">: {article.title}</span></Link></div></article>)}</div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
