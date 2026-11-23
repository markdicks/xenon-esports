import type { Metadata } from "next";
import { SocialsPreview } from "@/components/socials/SocialsPreview";
export const metadata: Metadata = { title: "Socials preview", robots: { index: false, follow: false } };
export default function PreviewPage() { return <SocialsPreview />; }
