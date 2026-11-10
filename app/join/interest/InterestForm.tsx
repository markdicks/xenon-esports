"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { DISCORD_INVITE_URL } from "@/lib/public-links";
import type { SubmissionResult } from "@/lib/form-results";
import { submitForm } from "@/lib/submit-form";
import { interestAreas } from "@/data/interest-areas";

const inputClass = "mt-2 w-full rounded-md border border-white/12 bg-black/35 px-4 py-3 text-white outline-none transition placeholder:text-steel/55 focus:border-ion focus:ring-2 focus:ring-ion/25";

function TextField({ label, name, type = "text", maxLength, placeholder }: {
  label: string;
  name: string;
  type?: string;
  maxLength: number;
  placeholder?: string;
}) {
  return (
    <label htmlFor={name} className="block text-sm font-semibold text-white">
      {label}<span className="ml-1 font-normal text-steel">optional</span>
      <input id={name} name={name} type={type} maxLength={maxLength} placeholder={placeholder} className={inputClass} />
    </label>
  );
}

function ShortAnswer({ label, name, maxLength, placeholder }: {
  label: string;
  name: string;
  maxLength: number;
  placeholder?: string;
}) {
  return (
    <label htmlFor={name} className="block text-sm font-semibold text-white">
      {label}<span className="ml-1 font-normal text-steel">optional</span>
      <textarea id={name} name={name} maxLength={maxLength} placeholder={placeholder} className={`${inputClass} min-h-24 resize-y`} />
    </label>
  );
}

export function InterestForm({ initialInterests }: { initialInterests: string[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<SubmissionResult | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    const formData = new FormData(event.currentTarget);
    setResult(null);
    startTransition(async () => {
      const nextResult = await submitForm("/api/join/interest", formData);
      setResult(nextResult);
      if (nextResult.success) formRef.current?.reset();
    });
  }

  if (result?.success) {
    return (
      <section role="status" className="mt-8 rounded-lg border border-ion/35 bg-ion/[0.08] p-6 sm:p-8">
        <h2 className="font-display text-2xl font-black text-white">Thanks for your interest in Xenon.</h2>
        <p className="mt-4 text-sm font-semibold text-steel">Reference: <span className="text-white">{result.reference}</span></p>
        <p className="mt-3 leading-7 text-steel">We&apos;ll review what you submitted and contact you through Discord if there&apos;s a suitable next step.</p>
        <p className="mt-3 text-sm leading-6 text-steel">Check your Discord DMs for a private meeting availability link from the Xenon bot.</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer">Join Discord</Button>
          <Link href="/" className="inline-flex min-h-11 items-center justify-center rounded-md border border-white/18 px-5 py-3 text-sm font-bold uppercase text-white transition hover:border-ion hover:text-ion">Return Home</Link>
        </div>
      </section>
    );
  }

  return (
    <>
      {result && !result.success ? (
        <div role="alert" className="mt-8 rounded-lg bg-volt/10 p-5 ring-1 ring-volt/35">
          <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-volt">
            {result.error === "database" ? "Could not save your interest" : result.error === "network" ? "Could not confirm submission" : "Check your details"}
          </p>
          <p className="mt-2 text-sm leading-6 text-steel">
            {result.error === "database" ? "Your form reached the server, but could not be saved. Please try again shortly." : result.error === "network" ? "We could not confirm that your form was received. Your answers have been kept; check your connection before trying again." : "Please review the fields below and submit again."}
          </p>
          {result.error === "validation" && result.fieldErrors ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-steel">
              {Object.entries(result.fieldErrors).flatMap(([field, errors]) => errors.map((error, index) => <li key={`${field}-${index}`}>{error}</li>))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <form ref={formRef} onSubmit={handleSubmit} method="post" className="mt-8 grid gap-5 rounded-lg bg-white/[0.04] p-5 ring-1 ring-white/10 sm:p-8">
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

        <div className="grid gap-5 sm:grid-cols-2">
          <label htmlFor="discordUsername" className="block text-sm font-semibold text-white">
            Discord username or user ID <span className="text-volt" aria-hidden="true">*</span>
            <input id="discordUsername" name="discordUsername" maxLength={120} autoComplete="nickname" required className={inputClass} />
          </label>
          <TextField label="Email" name="email" type="email" maxLength={255} placeholder="For an alternate way to reach you" />
        </div>
        <p className="text-sm leading-6 text-steel">Join the Xenon Discord and allow direct messages. Our bot will send a private link to arrange a 30-minute meeting.</p>

        <fieldset className="rounded-md border border-white/10 p-4 sm:p-5">
          <legend className="px-1 text-sm font-semibold text-white">Areas of interest</legend>
          <p className="mb-4 text-xs leading-5 text-steel">Select all that fit. You can change these any time.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {interestAreas.map((area) => (
              <label key={area} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm text-steel transition hover:bg-white/[0.04] hover:text-white">
                <input type="checkbox" name="areasOfInterest" value={area} defaultChecked={initialInterests.includes(area)} className="h-4 w-4 shrink-0 accent-cyan-300" />
                {area}
              </label>
            ))}
          </div>
        </fieldset>

        <ShortAnswer label="A short introduction" name="introduction" maxLength={600} placeholder="A couple of sentences is plenty." />
        <ShortAnswer label="What are you good at?" name="strengths" maxLength={800} />
        <ShortAnswer label="What would you like to do or learn with Xenon?" name="goals" maxLength={800} />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="Weekly availability" name="weeklyAvailability" maxLength={120} placeholder="For example, 3–5 hours per week" />
          <TextField label="Portfolio, social or work link" name="portfolioUrl" type="url" maxLength={500} placeholder="https://" />
        </div>

        <button type="submit" disabled={isPending} className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-volt px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-carbon shadow-signal transition hover:bg-ion focus:outline-none focus:ring-2 focus:ring-ion focus:ring-offset-2 focus:ring-offset-carbon disabled:cursor-not-allowed disabled:opacity-60 sm:w-fit">
          {isPending ? "Sending..." : "Send my interest"}
        </button>
      </form>
    </>
  );
}
