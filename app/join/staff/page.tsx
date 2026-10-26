import { StaffApplicationForm } from "./StaffApplicationForm";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";

export default async function StaffApplicationPage() {
  return (
    <main className="xenon-shell min-h-screen">
      <Navbar />
      <section className="px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-5xl">
          <div className="mb-10 text-center">
            <p className="font-display text-xs font-bold uppercase tracking-[0.34em] text-ion">
              Staff application
            </p>
            <h1 className="mt-3 font-display text-4xl font-black leading-tight text-white sm:text-6xl">
              Contribute to Xenon.
            </h1>
            <p className="mx-auto mt-4 max-w-3xl text-base leading-7 text-steel sm:text-lg">
              Core leadership is established through Discord. This form is for
              future contributors and volunteer staff who can add real support
              across content, community, operations and events.
            </p>
          </div>

          <StaffApplicationForm />
        </div>
      </section>
      <Footer />
    </main>
  );
}
