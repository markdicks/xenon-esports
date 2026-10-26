import { StaffApplicationForm } from "./StaffApplicationForm";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { getStaffRoles } from "@/lib/discord-roster";

export const dynamic = "force-dynamic";

export default async function StaffApplicationPage() {
  const roles = await getStaffRoles();
  const openRoles = roles.filter((role) => role.status === "open");
  const rosterUnavailable = roles.every((role) => role.status === "unavailable");

  return (
    <main className="xenon-shell min-h-screen">
      <Navbar />
      <section className="px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-5xl">
          <div className="mb-10 text-center">
            <p className="font-display text-xs font-bold uppercase tracking-[0.34em] text-ion">
              Staff application
            </p>
            <h1 className="mt-3 font-display text-4xl font-black leading-tight text-white sm:text-6xl">
              Apply to build Xenon.
            </h1>
            <p className="mx-auto mt-4 max-w-3xl text-base leading-7 text-steel sm:text-lg">
              {rosterUnavailable
                ? "Live Discord availability is syncing. Tell us where you fit, how you work and what you can realistically commit to as an unpaid volunteer."
                : "Only roles without a Discord holder are listed below. You can also apply as flexible staff."}
            </p>
          </div>

          <StaffApplicationForm roles={openRoles} />
        </div>
      </section>
      <Footer />
    </main>
  );
}
