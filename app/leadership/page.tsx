import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { getStaffRoles } from "@/lib/discord-roster";

export const dynamic = "force-dynamic";

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

export default async function LeadershipPage() {
  const roles = await getStaffRoles();

  return (
    <main className="xenon-shell min-h-screen">
      <Navbar />
      <section className="px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="font-display text-xs font-bold uppercase tracking-[0.34em] text-ion">Leadership</p>
            <h1 className="mt-4 font-display text-5xl font-black leading-none text-white sm:text-7xl">The people steering the return.</h1>
            <p className="mt-6 text-lg leading-8 text-steel">Leadership assignments are read from Xenon&apos;s Discord server. When a role changes there, this page updates without a hard-coded team list.</p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {roles.map((role) => (
              <article key={role.id} className="rounded-lg bg-white/[0.04] p-6 ring-1 ring-white/10 transition hover:ring-ion/45">
                <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-ion">{role.department}</p>
                <h2 className="mt-3 font-display text-3xl font-black text-white">{role.title}</h2>
                <p className="mt-4 min-h-14 text-sm leading-6 text-steel">{role.description}</p>
                <div className="mt-6 border-t border-white/10 pt-5">
                  {role.holders.length ? (
                    <div className="space-y-3">
                      {role.holders.map((member) => (
                        <div key={member.id} className="flex items-center gap-3">
                          <span className="grid h-10 w-10 place-items-center rounded-full bg-ion/15 font-display text-sm font-black text-ion ring-1 ring-ion/30" aria-hidden="true">{initials(member.nickname)}</span>
                          <div><p className="font-bold text-white">{member.nickname}</p><p className="text-xs text-steel">Assigned through Discord</p></div>
                        </div>
                      ))}
                    </div>
                  ) : role.status === "unavailable" ? (
                    <p className="text-sm text-steel">Leadership availability is syncing from Discord.</p>
                  ) : (
                    <p className="font-semibold text-steel">Position currently unassigned</p>
                  )}
                </div>
                <div className="mt-6 flex flex-wrap gap-2">
                  {role.responsibilities.map((responsibility) => <span key={responsibility} className="rounded-md bg-black/25 px-3 py-2 text-xs font-bold uppercase tracking-[0.1em] text-steel">{responsibility}</span>)}
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
