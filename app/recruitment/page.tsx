import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { RecruitmentOpportunities } from "@/components/recruitment/RecruitmentOpportunities";

export const dynamic = "force-dynamic";

export default function RecruitmentPage() {
  return (
    <main className="xenon-shell min-h-screen">
      <Navbar />
      <section className="px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <p className="font-display text-xs font-bold uppercase tracking-[0.34em] text-ion">Get involved</p>
            <h1 className="mt-3 font-display text-5xl font-black leading-tight text-white sm:text-7xl">Help build the return.</h1>
            <p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-steel">Tell us what interests you and what you’d like to contribute. You can get in touch even if you’re still deciding where you’d fit.</p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Button href="/join/interest">Submit interest</Button>
              <Button href="/join/staff" variant="secondary">Detailed staff application</Button>
            </div>
          </div>
          <RecruitmentOpportunities />
        </div>
      </section>
      <Footer />
    </main>
  );
}
