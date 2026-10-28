import { z } from "zod";

export const configKeys = [
  "social.twitch",
  "social.youtube",
  "social.tiktok",
  "social.instagram",
  "discord.invite",
] as const;

export type ConfigKey = typeof configKeys[number];
export type ConfigValues = Record<ConfigKey, string | null>;

export const configKeySchema = z.enum(configKeys);
export const configActorSchema = z.object({
  discordId: z.string().regex(/^\d{17,20}$/),
  name: z.string().trim().min(1).max(100).refine((name) => !/[\u0000-\u001f\u007f]/.test(name)),
}).strict();
export type ConfigActor = z.infer<typeof configActorSchema>;

// Restrict this API to public profile/channel/invite links. Credentials, query
// strings, fragments and unrelated hosts cannot be saved through it.
export function normalizeConfigValue(key: ConfigKey, value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 512 || /[\s\u0000-\u001f\u007f\\]/.test(value)) {
    throw new Error("Invalid public link");
  }
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) {
    throw new Error("Invalid public link");
  }
  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname;
  const valid = key === "social.twitch"
    ? host === "twitch.tv" && /^\/[a-zA-Z0-9_]{1,25}\/?$/.test(path)
    : key === "social.youtube"
      ? host === "youtube.com" && /^\/(?:@[a-zA-Z0-9_.-]+|(?:channel|c|user)\/[a-zA-Z0-9_-]+)\/?$/.test(path)
      : key === "social.tiktok"
        ? host === "tiktok.com" && /^\/@[a-zA-Z0-9_.]{1,24}\/?$/.test(path)
        : key === "social.instagram"
          ? host === "instagram.com" && /^\/[a-zA-Z0-9_.]{1,30}\/?$/.test(path)
          : key === "discord.invite" && (
            (host === "discord.gg" && /^\/[a-zA-Z0-9-]+\/?$/.test(path))
            || (host === "discord.com" && /^\/invite\/[a-zA-Z0-9-]+\/?$/.test(path))
          );
  if (!valid) throw new Error("Invalid public link");
  return url.href;
}

export const configChangeSchema = z.object({
  key: configKeySchema,
  value: z.string().max(512).nullable(),
  actor: configActorSchema,
}).strict().superRefine(({ key, value }, context) => {
  try { normalizeConfigValue(key, value); } catch {
    context.addIssue({ code: "custom", path: ["value"], message: "Use a public HTTPS profile, channel or Discord invite URL for the selected platform." });
  }
});
