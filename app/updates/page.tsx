import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { updates } from "@/data/updates";

export default function UpdatesPage() {
  return (
    <main className="xenon-shell min-h-screen">
      <Navbar />
      <section className="px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <p className="font-display text-xs font-bold uppercase tracking-[0.34em] text-ion">Updates</p>
          <h1 className="mt-4 max-w-4xl font-display text-5xl font-black leading-none text-white sm:text-7xl">Signals from the rebuild.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-steel">Short, clear notes on what Xenon is building and why it matters.</p>
          <div className="mt-12 grid gap-4 md:grid-cols-2">{updates.map((update) => <article key={update.title} className="rounded-lg bg-white/[0.04] p-7 ring-1 ring-white/10 transition hover:ring-ion/45"><div className="flex items-center justify-between gap-4"><p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-ion">{update.category}</p><p className="text-xs font-semibold text-steel">{update.date}</p></div><h2 className="mt-6 font-display text-3xl font-black text-white">{update.title}</h2><p className="mt-4 leading-7 text-steel">{update.excerpt}</p></article>)}</div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
