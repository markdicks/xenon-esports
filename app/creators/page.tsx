import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";

const provides = ["Collaboration across Xenon projects", "Visibility through content and community moments", "Content opportunities with a clear creative direction", "Community events and cross-promotion"];
const expectations = ["A consistent, sustainable creative rhythm", "Respectful conduct on every platform", "Clear communication with the team", "Meaningful involvement in the Xenon community"];

export default function CreatorsPage() {
  return (
    <main className="xenon-shell min-h-screen">
      <Navbar />
      <section className="px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="font-display text-xs font-bold uppercase tracking-[0.34em] text-ion">Creators</p>
            <h1 className="mt-4 font-display text-5xl font-black leading-none text-white sm:text-7xl">Creators who make the rebuild visible.</h1>
            <p className="mt-6 text-lg leading-8 text-steel">A Xenon creator helps turn the organisation&apos;s games, people and progress into stories the community can follow.</p>
          </div>
          <div className="mt-12 grid gap-4 lg:grid-cols-2">
            <article className="rounded-lg bg-white/[0.04] p-7 ring-1 ring-white/10"><p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-ion">What Xenon provides</p><ul className="mt-6 space-y-4">{provides.map((item) => <li key={item} className="flex gap-3 leading-7 text-steel"><span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-ion" />{item}</li>)}</ul></article>
            <article className="rounded-lg bg-white/[0.04] p-7 ring-1 ring-white/10"><p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-volt">What Xenon expects</p><ul className="mt-6 space-y-4">{expectations.map((item) => <li key={item} className="flex gap-3 leading-7 text-steel"><span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-volt" />{item}</li>)}</ul></article>
          </div>
          <div className="mt-8 rounded-lg border border-ion/30 bg-ion/[0.08] p-7 sm:flex sm:items-center sm:justify-between sm:gap-8"><div><h2 className="font-display text-2xl font-black text-white">Creator applications open soon.</h2><p className="mt-3 max-w-3xl leading-7 text-steel">The creator programme is being shaped with the rest of the return. Follow the rebuild and use the contact form to share a thoughtful introduction in the meantime.</p></div><Button href="/contact">Introduce yourself</Button></div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
