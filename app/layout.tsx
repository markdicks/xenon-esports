import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Xenon Esports — January 2027",
  description:
    "Xenon Esports is actively building toward its January 2027 return through competitive teams, creators, content and community.",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "Xenon Esports — January 2027",
    description:
      "Competitive teams, creators, content and community — actively building toward Xenon's January 2027 return.",
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
