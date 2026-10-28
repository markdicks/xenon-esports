import { CommunityCTA } from "@/components/home/CommunityCTA";
import { FollowTheRebuild } from "@/components/home/FollowTheRebuild";
import { Hero } from "@/components/home/Hero";
import { Pillars } from "@/components/home/Pillars";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="xenon-shell min-h-screen">
      <Navbar />
      <Hero />
      <Pillars />
      <FollowTheRebuild />
      <CommunityCTA />
      <Footer />
    </main>
  );
}
