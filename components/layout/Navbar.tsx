import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

const links = [
  { href: "/#pillars", label: "Pillars" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/recruitment", label: "Recruitment" },
  { href: "/about", label: "About" },
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
        <div className="hidden items-center gap-7 md:flex">
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
        <Button href="/join/staff" className="hidden sm:inline-flex">
          Join 2027
        </Button>
      </nav>
    </header>
  );
}
