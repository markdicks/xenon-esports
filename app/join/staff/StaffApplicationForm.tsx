"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import type { SubmissionResult } from "@/lib/form-results";
import { submitForm } from "@/lib/submit-form";

const contributorRoles = ["Content & editing", "Community support", "Operations support", "Events", "Creative", "Other / flexible"];

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

export function StaffApplicationForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<SubmissionResult | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    const formData = new FormData(event.currentTarget);
    setResult(null);
    startTransition(async () => {
      const nextResult = await submitForm("/api/join/staff", formData);
      setResult(nextResult);

      if (nextResult.success) {
        formRef.current?.reset();
      }
    });
  }

  return (
    <>
      {result?.success ? (
        <div role="status" className="mb-8 rounded-lg bg-ion/10 p-5 ring-1 ring-ion/35">
          <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-ion">
            Application received
          </p>
          <p className="mt-2 text-steel">
            Your public reference is{" "}
            <span className="font-bold text-white">{result.reference}</span>.
          </p>
        </div>
      ) : null}

      {result && !result.success ? (
        <div role="alert" className="mb-8 rounded-lg bg-volt/10 p-5 ring-1 ring-volt/35">
          <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-volt">
            {result.error === "database"
              ? "Could not save application"
              : result.error === "network" ? "Could not confirm application" : "Check your application"}
          </p>
          <p className="mt-2 text-steel">
            {result.error === "database"
              ? "The form reached the server, but the database insert failed. Please try again in a moment."
              : result.error === "network"
                ? "We could not confirm that your application was received. Check your connection before trying again. Your form has been kept."
                : "Please correct the following fields and submit again."}
          </p>
          {result.error === "validation" && result.fieldErrors ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-steel">
              {Object.entries(result.fieldErrors).flatMap(([field, errors]) =>
                errors.map((error, index) => <li key={`${field}-${index}`}>{error}</li>),
              )}
            </ul>
          ) : null}
        </div>
      ) : null}

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        method="post"
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
              maxLength={120}
              className={textInputClass()}
              required
            />
          </Field>
          <Field label="Email" name="email" required={false}>
            <input
              id="email"
              name="email"
              type="email"
              maxLength={255}
              className={textInputClass()}
            />
          </Field>
          <Field label="Timezone" name="timezone">
            <input
              id="timezone"
              name="timezone"
              maxLength={80}
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
                Select an interest area
              </option>
              {contributorRoles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Weekly availability" name="weeklyAvailability">
          <input
            id="weeklyAvailability"
            name="weeklyAvailability"
            maxLength={120}
            placeholder="Example: 6-8 hours, evenings and weekends"
            className={textInputClass()}
            required
          />
        </Field>

        <Field label="Relevant experience" name="experience">
          <textarea
            id="experience"
            name="experience"
            maxLength={4000}
            className={textareaClass()}
            required
          />
        </Field>

        <Field label="Portfolio URL" name="portfolioUrl" required={false}>
          <input
            id="portfolioUrl"
            name="portfolioUrl"
            type="url"
            maxLength={500}
            className={textInputClass()}
          />
        </Field>

        <Field label="Motivation" name="motivation">
          <textarea
            id="motivation"
            name="motivation"
            maxLength={4000}
            className={textareaClass()}
            required
          />
        </Field>

        <Field label="First-30-days goal" name="firstThirtyDaysGoal">
          <textarea
            id="firstThirtyDaysGoal"
            name="firstThirtyDaysGoal"
            maxLength={4000}
            className={textareaClass()}
            required
          />
        </Field>

        <Field label="Reliability example" name="reliabilityExample">
          <textarea
            id="reliabilityExample"
            name="reliabilityExample"
            maxLength={4000}
            className={textareaClass()}
            required
          />
        </Field>

        <Field label="Reason you may leave" name="reasonMayLeave">
          <textarea
            id="reasonMayLeave"
            name="reasonMayLeave"
            maxLength={4000}
            className={textareaClass()}
            required
          />
        </Field>

        <Field label="Support needed" name="supportNeeded" required={false}>
          <textarea
            id="supportNeeded"
            name="supportNeeded"
            maxLength={2000}
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
          <span>I understand this is an unpaid volunteer staff application.</span>
        </label>

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-volt px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-carbon shadow-signal transition duration-300 hover:-translate-y-0.5 hover:bg-ion focus:outline-none focus:ring-2 focus:ring-ion focus:ring-offset-2 focus:ring-offset-carbon disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Submitting..." : "Submit application"}
        </button>
      </form>
    </>
  );
}
