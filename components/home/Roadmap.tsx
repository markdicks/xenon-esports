import { roadmap } from "@/data/roadmap";

export function Roadmap() {
  return (
    <section id="roadmap" className="px-5 py-20 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md border border-ion/25 bg-ion/10 px-4 py-2 font-display text-xs font-bold uppercase tracking-[0.18em] text-ion">
              <span className="h-2 w-2 rounded-full bg-ion" />
              2027 Signal
            </div>
            <h2 className="mt-4 font-display text-3xl font-black text-white sm:text-5xl">
              From foundation to return.
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-steel sm:text-right">
            The next six months are about deliberate momentum, not a promise
            without a plan.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {roadmap.map((item, index) => (
            <article key={item.period} className={`rounded-lg p-6 ring-1 transition ${index === 3 ? "bg-ion/[0.08] ring-ion/45 shadow-signal" : "bg-white/[0.04] ring-white/10 hover:ring-ion/35"}`}>
              <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-ion">{item.period}</p>
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-volt">{item.label}</p>
              <h3 className="mt-2 font-display text-2xl font-black text-white">{item.title}</h3>
              <p className="mt-4 leading-7 text-steel">{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
