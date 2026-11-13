import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";
import { publishedArticle, newsDate } from "@/data/news";
import { getStaffRoles } from "@/lib/discord-roster";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = publishedArticle((await params).slug);
  if (!article) notFound();
  return { title: `${article.title} | Xenon Esports`, description: article.summary, alternates: { canonical: `/updates/${article.slug}` },
    openGraph: { type: "article", title: article.title, description: article.summary, url: `/updates/${article.slug}`,
      ...(article.date.length > 7 ? { publishedTime: article.date } : {}), images: [{ url: "/branding/logoXE.webp", alt: "Xenon Esports" }] },
    twitter: { card: "summary_large_image", title: article.title, description: article.summary, images: ["/branding/logoXE.webp"] } };
}
export default async function NewsArticlePage({ params }: Props) {
  const article = publishedArticle((await params).slug);
  if (!article) notFound();
  const roles = article.leadership ? await getStaffRoles() : [];
  return <main className="xenon-shell min-h-screen"><Navbar /><article className="px-5 py-14 sm:px-8 sm:py-20"><div className="mx-auto max-w-3xl">
    <Link href="/updates" className="text-sm font-bold text-ion hover:underline">All Xenon news</Link>
    <div className="mt-8 flex flex-wrap items-center gap-4 text-sm text-steel"><span className="font-bold text-ion">{article.category}</span><time dateTime={article.date}>{newsDate(article.date)}</time></div>
    <h1 className="mt-4 font-display text-4xl font-black leading-tight text-white sm:text-6xl">{article.title}</h1>
    <p className="mt-6 text-lg leading-8 text-steel">{article.summary}</p>
    <div className="mt-10 space-y-6 border-t border-white/10 pt-8">{article.content.map((paragraph, index) => <p key={index} className="leading-8 text-steel">{paragraph}</p>)}</div>
    {roles.length ? <section className="mt-10 border-t border-white/10 pt-8" aria-label="Current leadership from Discord"><h2 className="font-display text-2xl font-black text-white">The people behind the work</h2><dl className="mt-6 divide-y divide-white/10">{roles.map((role) => <div key={role.id} className="py-5"><dt className="font-bold text-white">{role.title}</dt><dd className="mt-2 leading-7 text-steel">{role.holders.length ? role.holders.map((member) => member.nickname).join(", ") : role.status === "unavailable" ? "Role holders are syncing from Discord." : "Currently unassigned"}<p className="mt-2 text-sm">{role.responsibilities.join(" · ")}</p></dd></div>)}</dl></section> : null}
    {article.action ? <div className="mt-10"><Button href={article.action.href}>{article.action.label}</Button></div> : null}
  </div></article><Footer /></main>;
}
