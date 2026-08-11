import type { Pillar } from "@/types";
import { SectionHeading } from "@/components/ui/SectionHeading";

const pillars: Pillar[] = [
  {
    eyebrow: "01",
    title: "Competitive discipline",
    description:
      "Teams get structure, leadership and consistent standards before hype.",
  },
  {
    eyebrow: "02",
    title: "Creator momentum",
    description:
      "Content is planned around people, stories and repeatable formats.",
  },
  {
    eyebrow: "03",
    title: "Community trust",
    description:
      "Fans and members see what Xenon is building, where it is going and how to join.",
  },
];

export function Pillars() {
  return (
    <section id="pillars" className="px-5 py-20 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="Operating pillars"
          title="Three lanes, one standard."
          description="The first version of the site makes the organisation understandable at a glance."
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
      </div>
    </section>
  );
}
