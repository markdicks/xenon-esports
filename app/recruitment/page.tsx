import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";

export default function RecruitmentPage() {
  return (
    <main className="xenon-shell min-h-screen">
      <Navbar />
      <section className="px-5 py-20 sm:px-8 sm:py-28"><div className="mx-auto max-w-5xl text-center"><p className="font-display text-xs font-bold uppercase tracking-[0.34em] text-ion">Get involved</p><h1 className="mt-3 font-display text-5xl font-black leading-tight text-white sm:text-7xl">Help build the return.</h1><p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-steel">Tell Xenon what interests you and what you would like to bring. You do not need to know our internal roles or have a formal application ready.</p><div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row"><Button href="/join">Get involved</Button><Button href="/join/staff" variant="secondary">Detailed staff application</Button></div></div></section>
      <Footer />
    </main>
  );
}
