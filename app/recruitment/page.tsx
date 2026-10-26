import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";

const lanes = [
  ["Content", "Editing, ideas, design and stories that make progress visible."],
  ["Community", "Helping members feel welcome, informed and involved."],
  ["Operations", "Reliable support for the systems and events that keep Xenon moving."],
];

export default function RecruitmentPage() {
  return (
    <main className="xenon-shell min-h-screen">
      <Navbar />
      <section className="px-5 py-20 sm:px-8 sm:py-28"><div className="mx-auto max-w-5xl text-center"><p className="font-display text-xs font-bold uppercase tracking-[0.34em] text-ion">Contributor interest</p><h1 className="mt-3 font-display text-5xl font-black leading-tight text-white sm:text-7xl">Help build the return.</h1><p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-steel">Xenon&apos;s six core leadership roles are managed through Discord. This is for the contributors and future staff who can bring practical support across content, community, operations and events.</p><div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row"><Button href="/join/staff">Contributor application</Button><Button href="/leadership" variant="secondary">Meet leadership</Button></div></div></section>
      <section className="px-5 pb-20 sm:px-8"><div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-3">{lanes.map(([title, description]) => <article key={title} className="rounded-lg bg-white/[0.04] p-6 text-left ring-1 ring-white/10"><h2 className="font-display text-2xl font-black text-white">{title}</h2><p className="mt-4 leading-7 text-steel">{description}</p></article>)}</div></section>
      <Footer />
    </main>
  );
}
