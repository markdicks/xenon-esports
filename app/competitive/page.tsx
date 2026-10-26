import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { competitiveDivisions } from "@/data/competitive";

export default function CompetitivePage() {
  return (
    <main className="xenon-shell min-h-screen">
      <Navbar />
      <section className="px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div><p className="font-display text-xs font-bold uppercase tracking-[0.34em] text-ion">Competitive</p><h1 className="mt-4 font-display text-5xl font-black leading-none text-white sm:text-7xl">Compete with standards, not noise.</h1></div>
            <p className="text-lg leading-8 text-steel">Xenon&apos;s competitive direction is being developed around responsible roster planning, strong leadership and a public identity worth representing.</p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {competitiveDivisions.map((division) => (
              <article key={division.title} className="rounded-lg bg-white/[0.04] p-8 ring-1 ring-white/10">
                <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-volt">{division.status}</p>
                <h2 className="mt-5 font-display text-4xl font-black text-white">{division.title}</h2>
                <p className="mt-5 leading-7 text-steel">{division.description}</p>
              </article>
            ))}
          </div>
          <div className="mt-8 rounded-lg border border-ion/30 bg-ion/[0.08] p-7 sm:flex sm:items-center sm:justify-between sm:gap-8"><div><h2 className="font-display text-2xl font-black text-white">No unsigned rosters. No placeholder announcements.</h2><p className="mt-3 max-w-3xl leading-7 text-steel">Player and roster announcements will happen closer to launch, when there is something real to show.</p></div><Button href="/join">Register competitive interest</Button></div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
