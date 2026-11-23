import { z } from "zod";
import { configKeys, normalizeConfigValue, type ConfigKey } from "@/lib/site-config-validation";
import { DISCORD_INVITE_URL } from "@/lib/public-links";

export const socialPlatforms = ["instagram", "youtube", "tiktok", "twitch", "discord"] as const;
export const platformKeys: Record<typeof socialPlatforms[number], ConfigKey> = { instagram: "social.instagram", youtube: "social.youtube", tiktok: "social.tiktok", twitch: "social.twitch", discord: "discord.invite" };
export function publicUrl(value: string) {
  if (value.length > 512 || /[\s\u0000-\u001f\u007f\\]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.search && !url.hash
      && !["localhost", "localhost.localdomain"].includes(url.hostname) && !url.hostname.endsWith(".local")
      && !/^\[|^\d+(?:\.\d+){3}$/.test(url.hostname);
  } catch { return false; }
}
const imageUrl = z.string().max(512).refine((v) => v === "" || /^\/branding\/[a-zA-Z0-9_.-]+$/.test(v) || publicUrl(v), "Use a public HTTPS image or a bundled branding image.");
const text = (max: number) => z.string().trim().max(max).refine((v) => !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(v));
export const socialAppearanceSchema = z.object({
  title: text(80).min(1), bio: text(300), footer: text(100), bannerUrl: imageUrl, logoUrl: imageUrl,
  background: z.string().regex(/^#[a-f0-9]{6}$/i), accent: z.string().regex(/^#[a-f0-9]{6}$/i), text: z.string().regex(/^#[a-f0-9]{6}$/i),
  buttonStyle: z.enum(["glass", "solid", "outline"]), corners: z.enum(["rounded", "pill", "square"]), layout: z.enum(["stack", "grid"]), showIcons: z.boolean(),
}).strict();
export const socialLinkSchema = z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/),
  kind: z.enum(["website", ...socialPlatforms, "custom"]), label: text(80).min(1), description: text(160),
  url: z.string().max(512).nullable(), visible: z.boolean(), featured: z.boolean(),
}).strict().superRefine((link, ctx) => {
  if (["website", "custom"].includes(link.kind) ? !link.url || !publicUrl(link.url) : link.url !== null) ctx.addIssue({ code: "custom", path: ["url"], message: "Use a public HTTPS destination for website/custom links; social destinations are managed by platform." });
});
export const socialLinksSchema = z.array(socialLinkSchema).max(30).refine((links) => new Set(links.map((l) => l.id)).size === links.length, "Link IDs must be unique.")
  .refine((links) => new Set(links.filter((l) => socialPlatforms.includes(l.kind as typeof socialPlatforms[number])).map((l) => l.kind)).size === links.filter((l) => socialPlatforms.includes(l.kind as typeof socialPlatforms[number])).length, "Each social platform can appear once.");
export const socialDestinationsSchema = z.object({ instagram: z.string().nullable(), youtube: z.string().nullable(), tiktok: z.string().nullable(), twitch: z.string().nullable(), discord: z.string().nullable() }).strict()
  .superRefine((values, ctx) => { for (const platform of socialPlatforms) { try { normalizeConfigValue(platformKeys[platform], values[platform]); } catch { ctx.addIssue({ code: "custom", path: [platform], message: `Use a public HTTPS ${platform} profile or invite without tracking parameters.` }); } } });
export const socialPageSchema = z.object({ revision: z.string().uuid().nullable(), links: socialLinksSchema, appearance: socialAppearanceSchema }).strict();
export type SocialPage = z.infer<typeof socialPageSchema>;
export type SocialDestinations = z.infer<typeof socialDestinationsSchema>;
export const defaultSocialDestinations: SocialDestinations = { instagram: "https://instagram.com/xenonesportsonline", youtube: "https://youtube.com/@xenonesports-e7n", tiktok: "https://tiktok.com/@xenonesports88", twitch: null, discord: DISCORD_INVITE_URL };
export const defaultSocialPage: SocialPage = { revision: null, appearance: {
  title: "Xenon Esports", bio: "Gaming, creators and community. Find your side of Xenon.", footer: "Competitive. Creators. Community.",
  bannerUrl: "/branding/socials-banner.webp", logoUrl: "", background: "#0b0912", accent: "#b8a2ff", text: "#f7f6ff", buttonStyle: "glass", corners: "rounded", layout: "stack", showIcons: true,
}, links: [
  { id: "website", kind: "website", label: "Xenon Esports", description: "The home of Xenon. Teams, news and what comes next.", url: "https://xenonesports.online", visible: true, featured: true },
  { id: "instagram", kind: "instagram", label: "Instagram", description: "@xenonesportsonline", url: null, visible: true, featured: false },
  { id: "youtube", kind: "youtube", label: "YouTube", description: "@XenonEsports-e7n", url: null, visible: true, featured: false },
  { id: "tiktok", kind: "tiktok", label: "TikTok", description: "@xenonesports88", url: null, visible: true, featured: false },
] };
export const socialConfigKeys = ["socials.page", ...configKeys] as const;
export function socialHref(link: SocialPage["links"][number], destinations: SocialDestinations) {
  return link.kind === "website" || link.kind === "custom" ? link.url : destinations[link.kind];
}
export function onAccent(hex: string) {
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? "#101014" : "#ffffff";
}
