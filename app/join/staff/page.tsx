import { submitStaffApplication } from "./actions";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { roles } from "@/data/roles";

type StaffApplicationPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function textInputClass() {
  return "mt-2 w-full rounded-md border border-white/12 bg-black/35 px-4 py-3 text-white outline-none transition placeholder:text-steel/55 focus:border-ion focus:ring-2 focus:ring-ion/25";
}

function textareaClass() {
  return `${textInputClass()} min-h-32 resize-y`;
}

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

export default async function StaffApplicationPage({
  searchParams,
}: StaffApplicationPageProps) {
  const params = await searchParams;
  const submitted = typeof params?.submitted === "string" ? params.submitted : "";
  const error = typeof params?.error === "string" ? params.error : "";
  const openRoles = roles.filter((role) => role.status === "open");

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
              Apply to build Xenon.
            </h1>
            <p className="mx-auto mt-4 max-w-3xl text-base leading-7 text-steel sm:text-lg">
              Tell us where you fit, how you work and what you can realistically
              commit to as an unpaid volunteer.
            </p>
          </div>

          {submitted ? (
            <div className="mb-8 rounded-lg bg-ion/10 p-5 ring-1 ring-ion/35">
              <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-ion">
                Application received
              </p>
              <p className="mt-2 text-steel">
                Your public reference is{" "}
                <span className="font-bold text-white">{submitted}</span>.
              </p>
            </div>
          ) : null}

          {error ? (
            <div className="mb-8 rounded-lg bg-volt/10 p-5 ring-1 ring-volt/35">
              <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-volt">
                {error === "database"
                  ? "Could not save application"
                  : "Check your application"}
              </p>
              <p className="mt-2 text-steel">
                {error === "database"
                  ? "The form reached the server, but the database insert failed. Please try again in a moment."
                  : "Some required fields are missing or too short. Please add more detail and submit again."}
              </p>
            </div>
          ) : null}

          <form
            action={submitStaffApplication}
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
              <Field label="Discord username" name="discordUsername">
                <input
                  id="discordUsername"
                  name="discordUsername"
                  className={textInputClass()}
                  required
                />
              </Field>
              <Field label="Email" name="email" required={false}>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className={textInputClass()}
                />
              </Field>
              <Field label="Timezone" name="timezone">
                <input
                  id="timezone"
                  name="timezone"
                  placeholder="SAST / GMT+2"
                  className={textInputClass()}
                  required
                />
              </Field>
              <Field label="Role" name="role">
                <select
                  id="role"
                  name="role"
                  className={textInputClass()}
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select a role
                  </option>
                  {openRoles.map((role) => (
                    <option key={role.title} value={role.title}>
                      {role.title}
                    </option>
                  ))}
                  <option value="Other / flexible">Other / flexible</option>
                </select>
              </Field>
            </div>

            <Field label="Weekly availability" name="weeklyAvailability">
              <input
                id="weeklyAvailability"
                name="weeklyAvailability"
                placeholder="Example: 6-8 hours, evenings and weekends"
                className={textInputClass()}
                required
              />
            </Field>

            <Field label="Relevant experience" name="experience">
              <textarea
                id="experience"
                name="experience"
                className={textareaClass()}
                required
              />
            </Field>

            <Field label="Portfolio URL" name="portfolioUrl" required={false}>
              <input
                id="portfolioUrl"
                name="portfolioUrl"
                type="url"
                className={textInputClass()}
              />
            </Field>

            <Field label="Motivation" name="motivation">
              <textarea
                id="motivation"
                name="motivation"
                className={textareaClass()}
                required
              />
            </Field>

            <Field label="First-30-days goal" name="firstThirtyDaysGoal">
              <textarea
                id="firstThirtyDaysGoal"
                name="firstThirtyDaysGoal"
                className={textareaClass()}
                required
              />
            </Field>

            <Field label="Reliability example" name="reliabilityExample">
              <textarea
                id="reliabilityExample"
                name="reliabilityExample"
                className={textareaClass()}
                required
              />
            </Field>

            <Field label="Reason you may leave" name="reasonMayLeave">
              <textarea
                id="reasonMayLeave"
                name="reasonMayLeave"
                className={textareaClass()}
                required
              />
            </Field>

            <Field label="Support needed" name="supportNeeded" required={false}>
              <textarea
                id="supportNeeded"
                name="supportNeeded"
                className={textareaClass()}
              />
            </Field>

            <label className="flex gap-3 rounded-md bg-black/25 p-4 text-sm leading-6 text-steel ring-1 ring-white/10">
              <input
                type="checkbox"
                name="unpaidVolunteerAcknowledgement"
                className="mt-1 h-4 w-4 accent-volt"
                required
              />
              <span>
                I understand this is an unpaid volunteer staff application.
              </span>
            </label>

            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-volt px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-carbon shadow-signal transition duration-300 hover:-translate-y-0.5 hover:bg-ion focus:outline-none focus:ring-2 focus:ring-ion focus:ring-offset-2 focus:ring-offset-carbon"
            >
              Submit application
            </button>
          </form>
        </div>
      </section>
      <Footer />
    </main>
  );
}
