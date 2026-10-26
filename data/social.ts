export type SocialLink = {
  label: string;
  handle: string;
  href: string | null;
  description: string;
};

// Add official Xenon channel URLs here as they are confirmed. Public social
// destinations stay in one place rather than being scattered through pages.
export const socialLinks: SocialLink[] = [
  { label: "Discord", handle: "Community hub", href: null, description: "Game nights, watch parties and community updates." },
  { label: "Twitch", handle: "Live", href: null, description: "Broadcasts, watch parties and live moments." },
  { label: "TikTok", handle: "Short-form", href: null, description: "Quick stories, clips and rebuild updates." },
  { label: "YouTube", handle: "Long-form", href: null, description: "Features, recaps and deeper Xenon stories." },
  { label: "Instagram", handle: "Visual journal", href: null, description: "Design, people and community moments." },
];
