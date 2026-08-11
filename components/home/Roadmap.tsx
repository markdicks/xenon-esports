import { roadmap } from "@/data/roadmap";

export function Roadmap() {
  const [featured, ...secondary] = roadmap;

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
              Roadmap updates
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-steel sm:text-right">
            Built like a news feed: clear dates, readable priorities and a
            featured milestone for the next big organisational move.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.45fr_0.85fr_0.85fr]">
          <article className="group relative min-h-[22rem] overflow-hidden rounded-lg bg-black p-6 shadow-signal transition duration-300 hover:-translate-y-1">
            <div className="absolute inset-0 bg-[url('/branding/logoXE.webp')] bg-cover bg-center opacity-35 grayscale transition duration-500 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-br from-carbon/92 via-carbon/76 to-black/70" />
            <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-ion/55" />
            <div className="relative flex h-full min-h-[19rem] flex-col justify-between">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="font-display text-xs font-bold uppercase tracking-[0.24em] text-ion">
                    {featured.label}
                  </p>
                  <h3 className="mt-5 max-w-2xl font-display text-3xl font-black leading-tight text-white sm:text-4xl">
                    {featured.title}
                  </h3>
                  <p className="mt-4 max-w-2xl leading-7 text-steel">
                    {featured.description}
                  </p>
                </div>
                <div className="shrink-0 text-right font-display">
                  <p className="text-3xl font-black text-white">{featured.day}</p>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-steel">
                    {featured.month}
                  </p>
                </div>
              </div>
              <div className="mt-8 flex items-end justify-between">
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-ion">
                  {featured.quarter}
                </p>
                <span className="grid h-12 w-12 place-items-center rounded-full bg-ion text-sm font-black text-carbon">
                  01
                </span>
              </div>
            </div>
          </article>
          {secondary.slice(0, 2).map((item, index) => (
            <article
              key={item.quarter}
              className="group relative min-h-[22rem] overflow-hidden rounded-lg bg-white/[0.045] p-5 transition duration-300 hover:-translate-y-1 hover:bg-white/[0.07]"
            >
              <div className="absolute inset-0 bg-[url('/branding/logoXE.webp')] bg-cover bg-center opacity-12 grayscale" />
              <div className="absolute inset-0 bg-gradient-to-b from-carbon/90 to-black/92" />
              <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-white/10 transition group-hover:ring-ion/45" />
              <div className="relative flex h-full min-h-[19rem] flex-col justify-between">
                <div className="flex items-start justify-between gap-5">
                  <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-ion">
                    {item.label}
                  </p>
                  <div className="text-right font-display">
                    <p className="text-2xl font-black text-white">{item.day}</p>
                    <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-steel">
                      {item.month}
                    </p>
                  </div>
                </div>
                <div>
                  <h3 className="font-display text-2xl font-black leading-tight text-white">
                    {item.title}
                  </h3>
                  <p className="mt-4 text-sm leading-6 text-steel">
                    {item.description}
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-steel">
                    {item.quarter}
                  </p>
                  <span className="text-sm font-black text-white/55">
                    {String(index + 2).padStart(2, "0")}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {roadmap.slice(3).map((item, index) => (
            <article
              key={item.quarter}
              className="flex flex-col gap-5 rounded-lg bg-white/[0.035] p-5 ring-1 ring-white/10 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-volt">
                  {item.label}
                </p>
                <h3 className="mt-2 font-display text-xl font-black text-white">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-steel">
                  {item.description}
                </p>
              </div>
              <div className="flex items-center justify-between gap-6 sm:flex-col sm:items-end">
                <div className="text-right font-display">
                  <p className="text-2xl font-black text-white">{item.day}</p>
                  <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-steel">
                    {item.month}
                  </p>
                </div>
                <span className="text-sm font-black text-white/55">
                  {String(index + 4).padStart(2, "0")}
                </span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
