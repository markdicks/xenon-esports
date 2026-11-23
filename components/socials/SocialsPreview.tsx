"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import { SocialsContent } from "@/components/socials/SocialsContent";
import { defaultSocialPage, defaultSocialDestinations, socialPageSchema, socialDestinationsSchema } from "@/lib/socials-contract";
const payload = z.object({ page: socialPageSchema, destinations: socialDestinationsSchema }).strict();
export function SocialsPreview() {
  const [data, setData] = useState({ page: defaultSocialPage, destinations: defaultSocialDestinations });
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.data?.type !== "xenon-socials-preview") return;
      const parsed = payload.safeParse(event.data.data); if (parsed.success) setData(parsed.data);
    };
    window.addEventListener("message", receive);
    window.parent.postMessage({ type: "xenon-socials-ready" }, "*");
    return () => window.removeEventListener("message", receive);
  }, []);
  return <SocialsContent {...data} preview />;
}
