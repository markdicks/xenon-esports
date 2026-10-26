import { socialLinks } from "@/data/social";

export function FollowTheRebuild() {
  const liveLinks = socialLinks.filter((link) => link.href);

  return (
    <section id="follow" className="px-5 py-20 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-display text-xs font-bold uppercase tracking-[0.34em] text-ion">Follow the rebuild</p>
            <h2 className="mt-3 font-display text-3xl font-black text-white sm:text-5xl">Keep Xenon in your feed.</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-steel sm:text-right">
            Streams, short-form, longer stories and community updates will all point back to the work behind the January return.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {socialLinks.map((link) => {
            const content = <>
              <p className="font-display text-lg font-black text-white">{link.label}</p>
              <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-ion">{link.handle}</p>
              <p className="mt-4 text-sm leading-6 text-steel">{link.description}</p>
            </>;
            return link.href ? (
              <a key={link.label} href={link.href} target="_blank" rel="noreferrer" className="rounded-lg bg-white/[0.04] p-5 ring-1 ring-white/10 transition hover:-translate-y-1 hover:ring-ion/50">
                {content}
              </a>
            ) : (
              <div key={link.label} className="rounded-lg bg-white/[0.04] p-5 ring-1 ring-white/10">
                {content}
              </div>
            );
          })}
        </div>
        {!liveLinks.length ? <p className="mt-5 text-sm text-steel">Official social destinations will be added to the shared social configuration as each channel is confirmed.</p> : null}
      </div>
    </section>
  );
}
