import type { ConfigKey } from "@/lib/site-config-validation";

export type SocialLink = {
  configKey: ConfigKey;
  label: string;
  handle: string;
  description: string;
};

// Presentation stays in code; public destinations are read from site_config.
export const socialLinks: SocialLink[] = [
  { configKey: "discord.invite", label: "Discord", handle: "Community hub", description: "Game nights, watch parties and community updates." },
  { configKey: "social.twitch", label: "Twitch", handle: "Live", description: "Broadcasts, watch parties and live moments." },
  { configKey: "social.tiktok", label: "TikTok", handle: "Short-form", description: "Quick stories, clips and rebuild updates." },
  { configKey: "social.youtube", label: "YouTube", handle: "Long-form", description: "Features, recaps and deeper Xenon stories." },
  { configKey: "social.instagram", label: "Instagram", handle: "Visual journal", description: "Design, people and community moments." },
];
