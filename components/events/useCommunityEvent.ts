"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { publicEventSchema, choiceSchema, type PollChoice, type PublicEvent } from "@/lib/community-contract";

export function useCommunityEvent(initial: PublicEvent) {
  const [event, setEvent] = useState(initial), [proof, setProof] = useState<string | null>(null);
  const [choice, setChoice] = useState<PollChoice | null>(null), [connectionError, setConnectionError] = useState("");
  const controller = useRef<AbortController | null>(null), loading = useRef(false), sessionReady = useRef(false);
  const refresh = useCallback(async (session = true) => {
    if (loading.current || controller.current?.signal.aborted) return;
    const signal = controller.current?.signal;
    loading.current = true;
    try {
      const response = await fetch(`/api/events/valorant${session ? "" : "?results=1"}`, { cache: "no-store", credentials: "same-origin", signal });
      if (!response.ok) throw new Error("Event services are temporarily unavailable.");
      const data = await response.json(), parsed = publicEventSchema.safeParse(data.event);
      if (!parsed.success) throw new Error("Event services are temporarily unavailable.");
      if (signal?.aborted || controller.current?.signal !== signal) return;
      setEvent(parsed.data); setConnectionError(session || sessionReady.current || !parsed.data.available ? "" : "Please refresh to prepare a secure submission.");
      if (session) {
        await new Promise((resolve) => window.setTimeout(resolve, 2100));
        if (signal?.aborted || controller.current?.signal !== signal) return;
        sessionReady.current = typeof data.proof === "string" && data.formReady === true;
        setProof(typeof data.proof === "string" && data.formReady === true ? data.proof : null);
        setChoice(choiceSchema.safeParse(data.choice).success ? data.choice : null);
        if (!data.formReady && parsed.data.available) setConnectionError("Submissions are temporarily unavailable. Please try again later.");
      }
    } catch {
      if (signal?.aborted || controller.current?.signal !== signal) return;
      setConnectionError("Event services are temporarily unavailable. Please refresh to try again.");
      setEvent((current) => ({ ...current, available: false, results: null }));
    } finally { if (controller.current?.signal === signal) loading.current = false; }
  }, []);
  useEffect(() => {
    controller.current = new AbortController(); void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(false); }, 30000);
    return () => { controller.current?.abort(); loading.current = false; window.clearInterval(timer); };
  }, [refresh]);
  return { event, setEvent, proof, choice, setChoice, connectionError, refresh };
}
