export function Footer() {
  return (
    <footer className="border-t border-white/10 px-5 py-8 sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 text-sm text-steel sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-display font-bold uppercase tracking-[0.24em] text-white">Xenon 2027</p>
          <p className="mt-2">Competitive teams, creators and community, returning January 2027.</p>
        </div>
        <nav aria-label="More Xenon pages" className="flex flex-wrap gap-x-5 gap-y-2">
          <a className="transition hover:text-white" href="/leadership">Leadership</a>
          <a className="transition hover:text-white" href="/roadmap">Roadmap</a>
          <a className="transition hover:text-white" href="/contact">Contact</a>
        </nav>
      </div>
    </footer>
  );
}
