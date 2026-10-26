import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

const links = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/leadership", label: "Leadership" },
  { href: "/competitive", label: "Competitive" },
  { href: "/creators", label: "Creators" },
  { href: "/community", label: "Community" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/contact", label: "Contact" },
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
          <span className="font-display text-lg font-black uppercase tracking-[0.22em] text-white">
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
        <Button href="/join" className="hidden sm:inline-flex">
          Join Xenon
        </Button>
      </nav>
      <div className="border-t border-white/10 px-5 py-2 xl:hidden sm:px-8">
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
