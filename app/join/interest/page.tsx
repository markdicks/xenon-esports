import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { InterestForm } from "./InterestForm";
import { interestAreas } from "@/data/interest-areas";

type InterestPageProps = {
  searchParams: Promise<{ areas?: string | string[] }>;
};

export default async function InterestPage({ searchParams }: InterestPageProps) {
  const params = await searchParams;
  const requested = Array.isArray(params.areas) ? params.areas : params.areas ? [params.areas] : [];
  const initialInterests = requested.filter((value): value is typeof interestAreas[number] =>
    interestAreas.includes(value as typeof interestAreas[number]),
  );

  return (
    <main className="xenon-shell min-h-screen">
      <Navbar />
      <section className="px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <p className="font-display text-xs font-bold uppercase tracking-[0.34em] text-ion">A quick introduction</p>
          <h1 className="mt-3 font-display text-4xl font-black leading-tight text-white sm:text-6xl">Tell us what interests you.</h1>
          <p className="mt-4 text-base leading-7 text-steel sm:text-lg">A few details are enough to start. You can leave the longer answers blank, and you don&apos;t need to pick a role.</p>
          <InterestForm initialInterests={initialInterests} />
          <p className="mt-6 text-sm text-steel">Looking for the full volunteer staff application? <a href="/join/staff" className="font-bold text-ion underline-offset-4 hover:underline">Continue to the detailed form</a>.</p>
        </div>
      </section>
      <Footer />
    </main>
  );
}
