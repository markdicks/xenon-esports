import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { DISCORD_INVITE_URL } from "@/lib/public-links";

const paths = [
  {
    title: "I want to compete / play for Xenon",
    description: "Share the games you play and what you hope to do with Xenon.",
    href: "/join/interest?areas=Competitive",
  },
  {
    title: "I want to create, stream or make content",
    description: "Tell us what you make, what you stream, or what you want to learn.",
    href: "/join/interest?areas=Streaming&areas=Content%20creation",
  },
  {
    title: "I want to help behind the scenes",
    description: "Let us know what you are good at and where you would like to contribute.",
    href: "/join/interest?areas=Community%2Fevents&areas=Operations",
  },
  {
    title: "I don't know where I fit yet",
    description: "That is completely fine. Introduce yourself and Xenon will help find a fit.",
    href: "/join/interest?areas=Not%20sure%20yet",
  },
];

export default function JoinPage() {
  return (
    <main className="xenon-shell min-h-screen">
      <Navbar />
      <section className="px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <p className="font-display text-xs font-bold uppercase tracking-[0.34em] text-ion">Get involved</p>
          <h1 className="mt-4 max-w-4xl font-display text-5xl font-black leading-none text-white sm:text-7xl">There&apos;s a place for you at Xenon.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-steel">Join the community, or tell us what you&apos;re interested in. You don&apos;t need to know our roles or have everything figured out.</p>

          <div className="mt-10 rounded-lg border border-ion/35 bg-ion/[0.08] p-6 sm:flex sm:items-center sm:justify-between sm:gap-8 sm:p-8">
            <div>
              <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-ion">Community</p>
              <h2 className="mt-2 font-display text-2xl font-black text-white">Join the Xenon community</h2>
              <p className="mt-2 text-sm leading-6 text-steel">Go straight to our Discord for conversations, events and updates.</p>
            </div>
            <Button href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" className="mt-5 w-full sm:mt-0 sm:w-auto">Join Discord</Button>
          </div>

          <h2 className="mt-12 font-display text-2xl font-black text-white sm:text-3xl">What brings you here?</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {paths.map((path, index) => (
              <article key={path.title} className="flex flex-col rounded-lg bg-white/[0.04] p-6 ring-1 ring-white/10">
                <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-volt">0{index + 1}</p>
                <h3 className="mt-3 font-display text-xl font-black text-white">{path.title}</h3>
                <p className="mt-3 flex-1 leading-7 text-steel">{path.description}</p>
                <Button href={path.href} variant="secondary" className="mt-5 w-full sm:w-fit">Continue</Button>
              </article>
            ))}
          </div>

          <p className="mt-8 text-sm text-steel">Already know you want to apply for a staff role? <a href="/join/staff" className="font-bold text-ion underline-offset-4 hover:underline">Use the detailed staff application</a>.</p>
        </div>
      </section>
      <Footer />
    </main>
  );
}
