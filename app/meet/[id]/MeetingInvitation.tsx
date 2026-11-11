"use client";
import { useEffect, useState } from "react";
import { AvailabilityForm, type AvailabilityFormProps } from "./AvailabilityForm";

export function MeetingInvitation({ id }: { id: string }) {
  const [invitation, setInvitation] = useState<(AvailabilityFormProps & { reference: string }) | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        // URL fragments stay in the browser and are never sent in server request URLs.
        const values = new URLSearchParams(window.location.hash.slice(1));
        const userId = values.get("user"), token = values.get("token");
        if (!userId || !token) throw new Error("Open the private availability link sent to you by the Xenon bot.");
        const response = await fetch(`/api/meetings/${id}`, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "read", userId, token }), signal: controller.signal, cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load invitation");
        if (!controller.signal.aborted) { setInvitation({ ...result.view, id, userId, token }); setError(""); }
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not load invitation"); }
    }
    void load(); return () => controller.abort();
  }, [id, refresh]);
  if (error && !invitation) return <div className="mt-6"><p className="text-sm text-volt" role="alert">{error}</p><button className="mt-4 min-h-11 rounded-md border border-white/20 px-4 text-sm text-white" onClick={() => setRefresh((value) => value + 1)}>Retry</button></div>;
  if (!invitation) return <p className="mt-6 text-sm text-steel" role="status">Loading your private invitation...</p>;
  return <><p className="mt-3 break-words text-sm text-steel">Reference: {invitation.reference}</p>{error && <p role="alert" className="mt-3 text-sm text-volt">{error}</p>}<button className="mt-4 min-h-11 rounded-md border border-white/20 px-4 text-sm text-white" onClick={() => setRefresh((value) => value + 1)}>Refresh responses</button><AvailabilityForm {...invitation} /></>;
}
