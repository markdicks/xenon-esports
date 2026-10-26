import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { pastEventRecaps, upcomingEvents } from "@/data/events";

export default function CommunityPage() {
  return (
    <main className="xenon-shell min-h-screen">
      <Navbar />
      <section className="px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div><p className="font-display text-xs font-bold uppercase tracking-[0.34em] text-ion">Community</p><h1 className="mt-4 font-display text-5xl font-black leading-none text-white sm:text-7xl">More than a spectator seat.</h1></div>
            <p className="text-lg leading-8 text-steel">Discord is the centre of Xenon&apos;s community: a place for game nights, watch parties, honest updates and people who want to help the organisation grow.</p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[['Discord', 'Join conversations, find updates and meet the people behind the rebuild.'], ['Watch parties', 'Share the important matches and moments with people who care about the same games.'], ['Game nights', 'Take part in relaxed community sessions built around playing together.']].map(([title, description]) => <article key={title} className="rounded-lg bg-white/[0.04] p-6 ring-1 ring-white/10"><h2 className="font-display text-2xl font-black text-white">{title}</h2><p className="mt-4 leading-7 text-steel">{description}</p></article>)}
          </div>
          <section className="mt-16" aria-labelledby="upcoming-events"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-display text-xs font-bold uppercase tracking-[0.3em] text-ion">Upcoming events</p><h2 id="upcoming-events" className="mt-3 font-display text-3xl font-black text-white sm:text-5xl">Make time for the signal.</h2></div><p className="max-w-xl text-sm leading-6 text-steel sm:text-right">Event data lives in one shared file, ready for confirmed dates and Discord details.</p></div><div className="mt-8 grid gap-4 md:grid-cols-2">{upcomingEvents.map((event) => <article key={event.title} className="rounded-lg border border-ion/25 bg-ion/[0.06] p-6"><p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-volt">{event.timing}</p><h3 className="mt-4 font-display text-2xl font-black text-white">{event.title}</h3><p className="mt-3 text-sm font-semibold text-ion">{event.category}</p><p className="mt-4 leading-7 text-steel">{event.description}</p></article>)}</div></section>
          <section className="mt-16" aria-labelledby="event-recaps"><p className="font-display text-xs font-bold uppercase tracking-[0.3em] text-ion">Past-event recaps</p><h2 id="event-recaps" className="mt-3 font-display text-3xl font-black text-white sm:text-5xl">The moments worth revisiting.</h2>{pastEventRecaps.length ? <div className="mt-8 grid gap-4 md:grid-cols-2">{pastEventRecaps.map((event) => <article key={event.title} className="rounded-lg bg-white/[0.04] p-6 ring-1 ring-white/10"><p className="text-sm text-ion">{event.timing}</p><h3 className="mt-3 font-display text-2xl font-black text-white">{event.title}</h3><p className="mt-4 leading-7 text-steel">{event.description}</p></article>)}</div> : <p className="mt-6 max-w-2xl leading-7 text-steel">Recaps will be added here after confirmed Xenon events, so the community can revisit what happened and see what is next.</p>}</section>
          <div className="mt-12"><Button href="/join">Join Xenon</Button></div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
