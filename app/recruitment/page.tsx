import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { RoleCard } from "@/components/ui/RoleCard";
import { roles } from "@/data/roles";

export default function RecruitmentPage() {
  return (
    <main className="xenon-shell min-h-screen">
      <Navbar />
      <section className="px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto mb-10 max-w-3xl text-center">
            <p className="font-display text-xs font-bold uppercase tracking-[0.34em] text-ion">
              Recruitment
            </p>
            <h1 className="mt-3 font-display text-4xl font-black leading-tight text-white sm:text-6xl">
              Staff seats are open.
            </h1>
            <p className="mt-4 text-base leading-7 text-steel sm:text-lg">
              High-leverage roles for people who want to help build Xenon
              before the 2027 season fully comes online.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {roles.map((role) => (
              <RoleCard key={role.title} role={role} />
            ))}
          </div>
          <div className="mt-10 flex justify-center">
            <Button href="/join/staff">Apply for an open seat</Button>
          </div>
        </div>
      </section>
      <section className="px-5 pb-20 sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {[
            ["01", "Bring ownership", "Own a lane, communicate clearly and keep work moving."],
            ["02", "Build in public", "Help make progress visible through content, updates and events."],
            ["03", "Stay consistent", "Reliability matters more than loud promises in this rebuild."],
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
      <Footer />
    </main>
  );
}
