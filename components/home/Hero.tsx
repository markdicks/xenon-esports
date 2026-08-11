import Image from "next/image";
import { Button } from "@/components/ui/Button";

export function Hero() {
  return (
    <section className="relative px-5 pb-20 pt-20 sm:px-8 sm:pb-28 sm:pt-28">
      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="float-in">
          <p className="font-display text-xs font-bold uppercase tracking-[0.34em] text-ion">
            Xenon Esports / 2027
          </p>
          <h1 className="mt-5 max-w-5xl font-display text-5xl font-black leading-[0.95] text-white sm:text-7xl lg:text-8xl">
            Build the next Xenon era.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-steel sm:text-xl">
            A sharper competitive organisation for players, creators, staff and
            fans who want the grind to feel coordinated, visible and worth
            following.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button href="/join/staff">Apply to staff</Button>
            <Button href="/roadmap" variant="secondary">
              View roadmap
            </Button>
          </div>
        </div>
        <div className="relative min-h-[24rem] overflow-hidden rounded-lg bg-black">
          <Image
            src="/branding/logoXE.webp"
            alt="Xenon Esports XE logo"
            fill
            sizes="(min-width: 1024px) 45vw, 100vw"
            className="object-cover opacity-55 grayscale"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-br from-black/35 via-carbon/70 to-black/90" />
          <div className="absolute inset-0 bg-grid bg-[length:28px_28px] opacity-20" />
          <div className="pointer-events-none absolute left-5 top-5 h-14 w-14 border-l-2 border-t-2 border-ion/60" />
          <div className="pointer-events-none absolute bottom-5 right-5 h-14 w-14 border-b-2 border-r-2 border-volt/45" />
          <div className="relative flex h-full min-h-[24rem] flex-col justify-between p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-volt px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-carbon">
                2027
              </span>
              <span className="pulse-signal h-3 w-3 rounded-full bg-ion shadow-signal" />
            </div>
            <div>
              <p className="font-display text-7xl font-black text-white drop-shadow-2xl sm:text-8xl">
                XE
              </p>
              <div className="mt-5 grid grid-cols-3 gap-3">
                {["Comp", "Create", "Lead"].map((item) => (
                  <div
                    key={item}
                    className="rounded-md border border-white/10 bg-white/[0.07] p-3 text-center text-xs font-bold uppercase tracking-[0.14em] text-steel"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="scanline pt-5">
              <p className="text-sm leading-6 text-steel">
                Signal locked: the 2027 rebuild is coming online.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
