"use client";
import { useEffect, useState } from "react";
import { AvailabilityForm, type AvailabilityFormProps } from "./AvailabilityForm";

export function MeetingInvitation({ id }: { id: string }) {
  const [invitation, setInvitation] = useState<(AvailabilityFormProps & { reference: string }) | null>(null);
  const [error, setError] = useState("");
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
        if (!controller.signal.aborted) setInvitation({ ...result.view, id, userId, token });
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not load invitation"); }
    }
    void load(); return () => controller.abort();
  }, [id]);
  if (error) return <p className="mt-6 text-sm text-volt" role="alert">{error}</p>;
  if (!invitation) return <p className="mt-6 text-sm text-steel" role="status">Loading your private invitation...</p>;
  return <><p className="mt-3 break-words text-sm text-steel">Reference: {invitation.reference}</p><AvailabilityForm {...invitation} /></>;
}
