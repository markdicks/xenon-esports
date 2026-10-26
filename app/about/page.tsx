import Image from "next/image";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { getStaffRoles } from "@/lib/discord-roster";

export const dynamic = "force-dynamic";

const principles = [
  ["01", "Competitive with care", "Standards, structure and sustainable decisions before roster noise."],
  ["02", "Creators with a point of view", "Content that makes people, games and progress worth following."],
  ["03", "Community in the room", "An organisation members can take part in through every stage of the rebuild."],
];

export default async function AboutPage() {
  const roles = await getStaffRoles();

  return (
    <main className="xenon-shell min-h-screen">
      <Navbar />
      <section className="relative overflow-hidden px-5 pb-20 pt-10 sm:px-8 sm:pb-28">
        <div className="absolute inset-x-0 top-0 h-[34rem] opacity-45">
          <Image src="/branding/logoXE.webp" alt="" fill sizes="100vw" className="object-cover grayscale" priority />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-carbon/78 to-carbon" />
        </div>
        <div className="relative mx-auto max-w-7xl pt-24">
          <div className="mx-auto max-w-5xl bg-carbon/82 px-6 py-12 text-center shadow-signal backdrop-blur-sm sm:px-10 sm:py-16">
            <p className="font-display text-xs font-bold uppercase tracking-[0.34em] text-ion">Xenon Esports / active rebuild</p>
            <h1 className="mt-6 font-display text-5xl font-black uppercase leading-none text-white sm:text-7xl lg:text-8xl">Built for the <span className="text-ion">return.</span></h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-steel">Xenon is an esports organisation building a stronger competitive, creator and community presence toward January 2027 — with the work visible before the launch moment arrives.</p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row"><Button href="/leadership">Meet leadership</Button><Button href="/roadmap" variant="secondary">See the roadmap</Button></div>
          </div>
        </div>
      </section>
      <section className="px-5 py-16 sm:px-8"><div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">{principles.map(([number, title, description]) => <article key={title} className="rounded-lg bg-white/[0.04] p-6 ring-1 ring-white/10"><p className="font-display text-sm font-black text-volt">{number}</p><h2 className="mt-5 font-display text-2xl font-black text-white">{title}</h2><p className="mt-4 leading-7 text-steel">{description}</p></article>)}</div></section>
      <section className="px-5 py-16 sm:px-8"><div className="mx-auto max-w-7xl"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-ion">Current leadership</p><h2 className="mt-3 font-display text-3xl font-black text-white sm:text-5xl">The team changes in Discord, not in hard-coded copy.</h2></div><Button href="/leadership" variant="secondary">View leadership</Button></div><div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{roles.map((role) => <article key={role.id} className="rounded-lg bg-white/[0.04] p-6 ring-1 ring-white/10"><p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-ion">{role.title}</p><p className="mt-4 font-display text-2xl font-black text-white">{role.holders.length ? role.holders.map((member) => member.nickname).join(", ") : role.status === "unavailable" ? "Availability syncing" : "Position currently unassigned"}</p><p className="mt-3 text-sm leading-6 text-steel">{role.description}</p></article>)}</div></div></section>
      <Footer />
    </main>
  );
}
