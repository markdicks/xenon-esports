import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { meetingId } from "@/lib/meeting-contract";
import { MeetingInvitation } from "./MeetingInvitation";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Meeting availability | Xenon", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function MeetingPage({ params }: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!meetingId.safeParse(id).success) notFound();
  return <main className="xenon-shell min-h-screen"><Navbar /><section className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
    <p className="font-display text-xs font-bold uppercase text-ion">Xenon meetings</p>
    <h1 className="mt-3 font-display text-3xl font-black text-white sm:text-4xl">Your availability</h1>
    <MeetingInvitation id={id} />
  </section><Footer /></main>;
}
