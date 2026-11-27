import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { pollChoices, type PublicEvent } from "@/lib/community-contract";

export function ValorantEventActions({ event, showResults = false }: { event: PublicEvent; showResults?: boolean }) {
  const active = event.available && !["closed", "complete"].includes(event.settings.status);
  const voting = active && event.settings.pollOpen;
  const registration = active && event.settings.registrationOpen;
  const results = showResults && event.available && !voting ? event.results : null;

  return (
    <div className="space-y-3">
      {event.available ? (
        <p className="text-sm leading-6 text-steel">
          {voting ? "Voting is open." : "Voting is closed."}{" "}
          {registration ? "Pre-show registration is open." : "Pre-show registration is closed."}
        </p>
      ) : <p className="text-sm leading-6 text-steel">Live voting and registration status is temporarily unavailable.</p>}
      {results ? (
        <dl className="grid max-w-xl gap-3 sm:grid-cols-2" aria-label="Recorded format vote results">
          {pollChoices.map((choice) => {
            const count = results.votes[choice.id];
            return <div key={choice.id} className="rounded-md border border-white/12 px-4 py-3">
              <dt className="text-sm text-steel">{choice.title}</dt>
              <dd className="mt-1 font-bold text-white">{count} {count === 1 ? "vote" : "votes"}</dd>
            </div>;
          })}
        </dl>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        {voting ? <Button href="/events/valorant/vote">Vote Now</Button> : null}
        {registration ? <Button href="/events/valorant/pre-show" variant={voting ? "secondary" : "primary"}>Register Interest</Button> : null}
        <Link href="/events/valorant" className="inline-flex min-h-11 items-center text-sm font-bold text-ion hover:underline">Event details</Link>
      </div>
    </div>
  );
}
