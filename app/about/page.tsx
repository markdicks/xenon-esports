import Image from "next/image";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { staff } from "@/data/staff";

export default function AboutPage() {
  return (
    <main className="xenon-shell min-h-screen">
      <Navbar />
      <section className="relative overflow-hidden px-5 pb-20 pt-10 sm:px-8 sm:pb-28">
        <div className="absolute inset-x-0 top-0 h-[34rem] opacity-45">
          <Image
            src="/branding/logoXE.webp"
            alt=""
            fill
            sizes="100vw"
            className="object-cover grayscale"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-carbon/78 to-carbon" />
        </div>

        <div className="relative mx-auto max-w-7xl pt-24">
          <div className="mx-auto max-w-5xl bg-carbon/82 px-6 py-12 text-center shadow-signal backdrop-blur-sm sm:px-10 sm:py-16">
            <div className="pointer-events-none absolute left-0 top-0 h-16 w-16 border-l-2 border-t-2 border-ion/70" />
            <div className="pointer-events-none absolute bottom-0 right-0 h-16 w-16 border-b-2 border-r-2 border-volt/55" />
            <p className="font-display text-xs font-bold uppercase tracking-[0.34em] text-ion">
              System online // Xenon_Node_27
            </p>
            <h1 className="mt-6 font-display text-5xl font-black uppercase leading-none text-white sm:text-7xl lg:text-8xl">
              Xenon <span className="text-ion">Esports</span>
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-steel">
              Xenon is rebuilding around disciplined competition, visible
              creators and a community that can follow every step of the climb.
              The aim is simple: make 2027 the year Xenon becomes organised,
              recognisable and dangerous.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Button href="/recruitment">Join the rebuild</Button>
              <Button href="/roadmap" variant="secondary">
                See the plan
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {[
            ["01", "Competitive culture", "Standards before noise. Every roster and staff role needs a clear purpose."],
            ["02", "Creator-led growth", "The organisation grows by making people, stories and progress visible."],
            ["03", "South African roots", "Xenon is built for the local scene first, with ambition that can travel."],
          ].map(([number, title, description]) => (
            <article
              key={title}
              className="rounded-lg bg-white/[0.04] p-6 ring-1 ring-white/10"
            >
              <p className="font-display text-sm font-black text-volt">
                {number}
              </p>
              <h2 className="mt-5 font-display text-2xl font-black text-white">
                {title}
              </h2>
              <p className="mt-4 leading-7 text-steel">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-display text-xs font-bold uppercase tracking-[0.34em] text-ion">
                Current operators
              </p>
              <h2 className="mt-3 font-display text-3xl font-black text-white sm:text-5xl">
                People behind the signal.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-steel sm:text-right">
              The team is intentionally small while the foundations are being
              set, with open roles ready for the next wave.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {staff.map((member) => (
              <article
                key={member.name}
                className="rounded-lg bg-black/35 p-6 ring-1 ring-white/10 transition hover:ring-ion/45"
              >
                <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-ion">
                  {member.role}
                </p>
                <h3 className="mt-3 font-display text-3xl font-black text-white">
                  {member.name}
                </h3>
                <div className="mt-5 flex flex-wrap gap-2">
                  {member.responsibilities.map((item) => (
                    <span
                      key={item}
                      className="rounded-md bg-white/[0.06] px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-steel"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
