import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Xenon 2027",
  description:
    "The 2027 home for Xenon Esports: competitive teams, creators, staff recruitment, and community momentum.",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "Xenon 2027",
    description:
      "A competitive, creator-led esports organisation building toward 2027.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
