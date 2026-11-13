import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { DISCORD_INVITE_URL } from "@/lib/public-links";

const links = [
  { href: "/about", label: "About" },
  { href: "/competitive", label: "Competitive" },
  { href: "/creators", label: "Creators" },
  { href: "/community", label: "Community" },
  { href: "/events", label: "Events" },
  { href: "/updates", label: "Updates" },
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-carbon/78 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
        <Link
          href="/"
          className="group flex items-center gap-3"
          aria-label="Xenon 2027 home"
        >
          <span className="relative h-11 w-11 overflow-visible transition duration-300 group-hover:scale-105">
            <Image
              src="/favicon.svg"
              alt=""
              fill
              sizes="44px"
              className="object-contain opacity-95"
              priority
            />
          </span>
          <span className="hidden font-display text-lg font-black uppercase tracking-[0.22em] text-white sm:block">
            Xenon
          </span>
        </Link>
        <div className="hidden items-center gap-5 xl:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-semibold text-steel transition hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <Button href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" variant="secondary" className="min-h-10 px-2.5 text-[10px] sm:px-4 sm:text-xs">
            Join Discord
          </Button>
          <Button href="/join" className="min-h-10 px-2.5 text-[10px] sm:px-4 sm:text-xs">
            Get involved
          </Button>
        </div>
      </nav>
      <div className="grid grid-cols-2 gap-2 border-t border-white/10 px-5 py-2 sm:hidden">
        <Button href="/join" className="w-full !min-h-11 !px-2 !text-xs !tracking-normal whitespace-nowrap">Get involved</Button>
        <Button href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" variant="secondary" className="w-full !min-h-11 !px-2 !text-xs !tracking-normal whitespace-nowrap">Join Discord</Button>
      </div>
      <div className="border-t border-white/10 px-5 py-2 sm:px-8 xl:hidden">
        <div className="mx-auto flex max-w-7xl gap-5 overflow-x-auto whitespace-nowrap pb-1">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="text-xs font-bold uppercase tracking-[0.12em] text-steel transition hover:text-white">
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}
