import "server-only";
import { socialLinks } from "@/data/social";
import { getConfig, getConfigs } from "@/lib/site-config";
import type { ConfigValues } from "@/lib/site-config-validation";

export async function getSocialLinks() {
  let values: Partial<ConfigValues> = {};
  try { values = await getConfigs(); } catch {
    // Missing migration/database downtime must not take down the public site.
  }
  return socialLinks.map((link) => ({ ...link, href: values[link.configKey] ?? null }));
}

export async function getDiscordInvite() {
  try { return await getConfig("discord.invite"); } catch { return null; }
}
