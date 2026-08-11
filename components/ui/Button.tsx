import Link from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

type ButtonProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
};

export function Button({
  href,
  children,
  variant = "primary",
  className,
  ...props
}: ButtonProps) {
  return (
    <Link
      href={href}
      className={clsx(
        "inline-flex min-h-11 items-center justify-center rounded-md px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] transition duration-300 focus:outline-none focus:ring-2 focus:ring-ion focus:ring-offset-2 focus:ring-offset-carbon",
        variant === "primary" &&
          "bg-volt text-carbon shadow-signal hover:-translate-y-0.5 hover:bg-ion",
        variant === "secondary" &&
          "border border-white/18 bg-white/6 text-white hover:-translate-y-0.5 hover:border-ion hover:text-ion",
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}
