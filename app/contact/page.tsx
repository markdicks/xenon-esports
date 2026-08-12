import { ContactForm } from "./ContactForm";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";

export default function ContactPage() {
  return (
    <main className="xenon-shell min-h-screen">
      <Navbar />
      <section className="px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-4xl">
          <div className="mb-10 text-center">
            <p className="font-display text-xs font-bold uppercase tracking-[0.34em] text-ion">
              Contact
            </p>
            <h1 className="mt-3 font-display text-4xl font-black leading-tight text-white sm:text-6xl">
              Send Xenon a signal.
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-steel sm:text-lg">
              Use this for general enquiries, partnerships, community questions
              or anything that does not belong in the staff application form.
            </p>
          </div>

          <ContactForm />
        </div>
      </section>
      <Footer />
    </main>
  );
}
