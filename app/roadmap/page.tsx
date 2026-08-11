import { Roadmap } from "@/components/home/Roadmap";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";

export default function RoadmapPage() {
  return (
    <main className="xenon-shell min-h-screen">
      <Navbar />
      <section className="px-5 pt-20 sm:px-8 sm:pt-28">
        <div className="mx-auto max-w-7xl">
          <p className="font-display text-xs font-bold uppercase tracking-[0.34em] text-ion">
            Xenon 2027
          </p>
          <h1 className="mt-4 max-w-4xl font-display text-5xl font-black leading-none text-white sm:text-7xl">
            Roadmap
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-steel">
            The rebuild plan, shown as clear updates instead of a crowded
            timeline.
          </p>
        </div>
      </section>
      <Roadmap />
      <Footer />
    </main>
  );
}
