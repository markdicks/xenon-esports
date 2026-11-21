import { staffRoleDefinitions } from "@/data/roles";

export function LeadershipPillars() {
  return (
    <div className="mt-10">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {staffRoleDefinitions.map((role) => (
          <article key={role.id} className="flex flex-col rounded-lg border border-volt/20 border-t-2 border-t-volt bg-carbon/70 p-6 sm:p-7">
            <h2 className="font-display text-3xl font-black text-volt">{role.department}</h2>
            <p className="mt-2 text-base font-bold text-white">{role.title}</p>
            <p className="mb-6 mt-4 text-base leading-7 text-steel">{role.description}</p>
            <ul className="mt-auto space-y-2 border-t border-white/10 pt-5 text-sm leading-6 text-steel">
              {role.responsibilities.map((responsibility) => (
                <li key={responsibility} className="flex items-start gap-3"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 bg-volt" />{responsibility}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <aside aria-labelledby="pillars-download-heading" className="mt-8 flex flex-col gap-6 rounded-lg border border-volt/25 bg-volt/[0.04] p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <h2 id="pillars-download-heading" className="font-display text-2xl font-black text-white">Take the pillars with you.</h2>
          <p className="mt-3 text-base leading-7 text-steel">Save all six leadership portfolios as a Xenon graphic for posts, presentations and team briefings.</p>
          <p className="mt-2 text-sm text-steel">Portrait PNG · 1080 × 1350</p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col">
          <a href="/leadership/pillars.png" download="xenon-leadership-pillars.png" className="inline-flex min-h-12 items-center justify-center gap-3 rounded-md bg-volt px-5 py-3 text-sm font-bold text-carbon transition hover:bg-ion focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ion">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></svg>
            Download graphic
          </a>
          <a href="/leadership/pillars.png" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-md px-5 py-3 text-sm font-semibold text-steel transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ion">Preview graphic</a>
        </div>
      </aside>
    </div>
  );
}
