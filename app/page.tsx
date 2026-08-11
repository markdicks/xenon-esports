import { CommunityCTA } from "@/components/home/CommunityCTA";
import { Hero } from "@/components/home/Hero";
import { Pillars } from "@/components/home/Pillars";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";

export default function Home() {
  return (
    <main className="xenon-shell min-h-screen">
      <Navbar />
      <Hero />
      <Pillars />
      <CommunityCTA />
      <Footer />
    </main>
  );
}
