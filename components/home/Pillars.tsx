import type { Pillar } from "@/types";
import Link from "next/link";
import { Suspense } from "react";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { getStaffRoles } from "@/lib/discord-roster";

const pillars: Pillar[] = [
  {
    eyebrow: "01",
    title: "Competitive discipline",
    description:
          "Teams get structure, leadership and consistent standards before announcements.",
  },
  {
    eyebrow: "02",
    title: "Creator momentum",
    description:
          "Creators and content are built around people, stories and repeatable formats.",
  },
  {
    eyebrow: "03",
    title: "Community trust",
    description:
          "Members can see what Xenon is building, where it is going and how to take part.",
  },
];

async function LeadershipStatus() {
  const roles = await getStaffRoles();
  if (roles.some(({ status }) => status === "unavailable")) return null;
  const assigned = roles.filter(({ holders }) => holders.length > 0).length;
  return <span className="text-sm text-steel">{assigned} of {roles.length} leadership roles filled</span>;
}

export function Pillars() {
  return (
    <section id="pillars" className="px-5 py-20 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="Operating pillars"
          title="Three lanes, one return."
          description="Xenon is active now: aligning competitive ambition, creator energy and a community people can join before launch."
        />
        <div className="grid gap-4 md:grid-cols-3">
          {pillars.map((pillar) => (
            <article
              key={pillar.title}
              className="rounded-lg border border-white/12 bg-white/[0.045] p-6 transition duration-300 hover:-translate-y-1 hover:border-ion/60 hover:shadow-signal"
            >
              <p className="font-display text-sm font-black text-volt">
                {pillar.eyebrow}
              </p>
              <h3 className="mt-5 font-display text-2xl font-bold text-white">
                {pillar.title}
              </h3>
              <p className="mt-4 leading-7 text-steel">{pillar.description}</p>
            </article>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 text-sm">
          <Link href="/leadership" className="inline-flex min-h-11 items-center font-bold text-ion hover:underline">See current leadership</Link>
          <Suspense fallback={null}><LeadershipStatus /></Suspense>
        </div>
      </div>
    </section>
  );
}
