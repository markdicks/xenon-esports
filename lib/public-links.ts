const defaultDiscordInvite = "https://discord.gg/2XwuujbuNT";

function getConfiguredDiscordInvite() {
  const value = process.env.NEXT_PUBLIC_DISCORD_URL?.trim();
  if (!value) return defaultDiscordInvite;

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const isInvite = url.protocol === "https:" && !url.username && !url.password
      && !url.port && !url.search && !url.hash
      && ((host === "discord.gg" && /^\/[a-zA-Z0-9-]+\/?$/.test(url.pathname))
        || (host === "discord.com" && /^\/invite\/[a-zA-Z0-9-]+\/?$/.test(url.pathname)));
    return isInvite ? url.href : defaultDiscordInvite;
  } catch {
    return defaultDiscordInvite;
  }
}

export const DISCORD_INVITE_URL = getConfiguredDiscordInvite();
