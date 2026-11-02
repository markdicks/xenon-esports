import "server-only";
import { socialLinks } from "@/data/social";
import { DISCORD_INVITE_URL } from "@/lib/public-links";
import { getConfigs } from "@/lib/site-config";
import type { ConfigValues } from "@/lib/site-config-validation";

export async function getSocialLinks() {
  let values: Partial<ConfigValues> = {};
  try { values = await getConfigs(); } catch {
    // Missing migration/database downtime must not take down the public site.
  }
  return socialLinks.map((link) => ({
    ...link,
    href: link.configKey === "discord.invite" ? DISCORD_INVITE_URL : values[link.configKey] ?? null,
  }));
}

export async function getDiscordInvite() {
  return DISCORD_INVITE_URL;
}
