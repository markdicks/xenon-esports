import type { Metadata } from "next";
import { getPublicSocials } from "@/lib/socials-page";
import { SocialsContent } from "@/components/socials/SocialsContent";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Socials | Xenon Esports", description: "Find Xenon Esports on Instagram, YouTube, TikTok and beyond. All our official channels in one place.", alternates: { canonical: "/socials" }, openGraph: { title: "Xenon Esports | Official links", images: ["/branding/socials-banner.webp"] } };
export default async function SocialsPage() { const data = await getPublicSocials(); return <SocialsContent page={data.page} destinations={data.destinations} />; }
