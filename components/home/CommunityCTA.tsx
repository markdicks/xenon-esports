import { Button } from "@/components/ui/Button";

export function CommunityCTA() {
  return (
    <section id="community" className="px-5 py-20 sm:px-8">
      <div className="mx-auto max-w-7xl rounded-lg border border-ion/30 bg-ion/[0.08] p-8 shadow-signal sm:p-12">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="font-display text-xs font-bold uppercase tracking-[0.34em] text-ion">
              Community signal
            </p>
            <h2 className="mt-3 font-display text-3xl font-black text-white sm:text-5xl">
            Be part of the return.
            </h2>
            <p className="mt-4 max-w-2xl leading-7 text-steel">
              Follow the work, meet the people building it and find the lane
              where you can contribute to Xenon&apos;s January return.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Button href="/join">Join Xenon</Button>
            <Button href="/community" variant="secondary">
              Explore community
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
