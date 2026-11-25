import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { BracketViewer } from "@/components/brackets/BracketViewer";
import { bracketId } from "@/lib/bracket-contract";
import { publicBracket } from "@/lib/brackets";
import "../brackets.css";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Unlisted tournament bracket | Xenon", robots: { index: false, follow: false, noarchive: true, noimageindex: true } };
export default async function BracketPage({ params }: { params: Promise<{ id: string }> }) {
  const parsed = bracketId.safeParse((await params).id);
  if (!parsed.success) notFound();
  let initial;
  try { initial = await publicBracket(parsed.data); }
  catch { return <main className="xenon-shell bracket-page min-h-screen"><Navbar /><BracketViewer id={parsed.data} initial={null} /><Footer /></main>; }
  if (!initial) notFound();
  return <main className="xenon-shell bracket-page min-h-screen"><Navbar /><BracketViewer id={parsed.data} initial={initial} /><Footer /></main>;
}
