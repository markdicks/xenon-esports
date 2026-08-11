import { submitContactForm } from "./actions";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";

type ContactPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const inputClass =
  "mt-2 w-full rounded-md border border-white/12 bg-black/35 px-4 py-3 text-white outline-none transition placeholder:text-steel/55 focus:border-ion focus:ring-2 focus:ring-ion/25";

function Field({
  label,
  name,
  children,
  required = true,
}: {
  label: string;
  name: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-semibold text-white" htmlFor={name}>
      {label}
      {!required ? <span className="text-steel"> optional</span> : null}
      {children}
    </label>
  );
}

export default async function ContactPage({ searchParams }: ContactPageProps) {
  const params = await searchParams;
  const submitted = typeof params?.submitted === "string" ? params.submitted : "";
  const hasError = params?.error === "validation";

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

          {submitted ? (
            <div className="mb-8 rounded-lg bg-ion/10 p-5 ring-1 ring-ion/35">
              <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-ion">
                Enquiry received
              </p>
              <p className="mt-2 text-steel">
                Your public reference is{" "}
                <span className="font-bold text-white">{submitted}</span>.
              </p>
            </div>
          ) : null}

          {hasError ? (
            <div className="mb-8 rounded-lg bg-volt/10 p-5 ring-1 ring-volt/35">
              <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-volt">
                Check your enquiry
              </p>
              <p className="mt-2 text-steel">
                Some required fields are missing or invalid. Please review and
                submit again.
              </p>
            </div>
          ) : null}

          <form
            action={submitContactForm}
            className="grid gap-5 rounded-lg bg-white/[0.04] p-5 ring-1 ring-white/10 sm:p-8"
          >
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              className="hidden"
              aria-hidden="true"
            />

            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Name" name="name">
                <input id="name" name="name" className={inputClass} required />
              </Field>
              <Field label="Email" name="email">
                <input
                  id="email"
                  name="email"
                  type="email"
                  className={inputClass}
                  required
                />
              </Field>
            </div>

            <Field label="Discord username" name="discordUsername" required={false}>
              <input
                id="discordUsername"
                name="discordUsername"
                className={inputClass}
              />
            </Field>

            <Field label="Subject" name="subject">
              <input
                id="subject"
                name="subject"
                className={inputClass}
                required
              />
            </Field>

            <Field label="Message" name="message">
              <textarea
                id="message"
                name="message"
                className={`${inputClass} min-h-40 resize-y`}
                required
              />
            </Field>

            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-volt px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-carbon shadow-signal transition duration-300 hover:-translate-y-0.5 hover:bg-ion focus:outline-none focus:ring-2 focus:ring-ion focus:ring-offset-2 focus:ring-offset-carbon"
            >
              Send enquiry
            </button>
          </form>
        </div>
      </section>
      <Footer />
    </main>
  );
}
