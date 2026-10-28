import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { getDiscordInvite } from "@/lib/public-socials";

export const dynamic = "force-dynamic";

export default async function JoinPage() {
  const invite = await getDiscordInvite();
  const paths = [
    ["Community", "Join the conversation, watch parties and game nights as Xenon’s community programme grows.", invite ?? "/community", invite ? "Join our Discord" : "Explore community"],
    ["Creator interest", "Learn the creator standard and register your interest for future applications.", "/creators", "Creator direction"],
    ["Contributor interest", "Offer skills across content, community, operations or events without applying for a leadership seat.", "/join/staff", "Contribute"],
    ["Competitive interest", "See the developing Valorant and Rocket League direction before roster announcements are made.", "/competitive", "Competitive future"],
  ];

  return (
    <main className="xenon-shell min-h-screen">
      <Navbar />
      <section className="px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <p className="font-display text-xs font-bold uppercase tracking-[0.34em] text-ion">Join Xenon</p>
          <h1 className="mt-4 max-w-4xl font-display text-5xl font-black leading-none text-white sm:text-7xl">Find your lane in the return.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-steel">There is more than one way to be part of Xenon. Choose the path that matches what you want to bring.</p>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {paths.map(([title, description, href, cta], index) => (
              <article key={title} className={`rounded-lg p-7 ring-1 ${index === 0 ? "bg-ion/[0.08] ring-ion/35" : "bg-white/[0.04] ring-white/10"}`}>
                <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-volt">0{index + 1}</p>
                <h2 className="mt-5 font-display text-3xl font-black text-white">{title}</h2>
                <p className="mt-4 max-w-xl leading-7 text-steel">{description}</p>
                <Button href={href} variant={index === 0 ? "primary" : "secondary"} className="mt-7">{cta}</Button>
              </article>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
