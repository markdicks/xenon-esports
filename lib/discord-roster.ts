import { staffRoleDefinitions } from "@/data/roles";
import type { DiscordRosterMember, Role } from "@/types";
import { unstable_cache } from "next/cache";

type RemoteRole = {
  id: string;
  name: string;
  exists: boolean;
  members: DiscordRosterMember[];
};

type RemoteRoster = {
  guild: { id: string; name: string };
  syncedAt: string;
  roles: RemoteRole[];
};

export type WebsiteRoster = {
  source: "discord" | "unavailable";
  guild: RemoteRoster["guild"] | null;
  syncedAt: string | null;
  roles: RemoteRole[];
};

function asMember(value: unknown): DiscordRosterMember | null {
  if (!value || typeof value !== "object") return null;
  const member = value as Record<string, unknown>;
  if (typeof member.id !== "string" || typeof member.nickname !== "string" || typeof member.username !== "string") {
    return null;
  }
  return { id: member.id, nickname: member.nickname, username: member.username };
}

function asRoster(value: unknown): RemoteRoster | null {
  if (!value || typeof value !== "object") return null;
  const roster = value as Record<string, unknown>;
  if (!roster.guild || typeof roster.guild !== "object" || !Array.isArray(roster.roles) || typeof roster.syncedAt !== "string") {
    return null;
  }
  const guild = roster.guild as Record<string, unknown>;
  if (typeof guild.id !== "string" || typeof guild.name !== "string") return null;
  const roles = roster.roles.map((value) => {
    if (!value || typeof value !== "object") return null;
    const role = value as Record<string, unknown>;
    if (typeof role.id !== "string" || typeof role.name !== "string" || typeof role.exists !== "boolean" || !Array.isArray(role.members)) {
      return null;
    }
    const members = role.members.map(asMember);
    return members.some((member) => member === null)
      ? null
      : { id: role.id, name: role.name, exists: role.exists, members: members as DiscordRosterMember[] };
  });
  return roles.some((role) => role === null) ? null : { guild: { id: guild.id, name: guild.name }, syncedAt: roster.syncedAt, roles: roles as RemoteRole[] };
}

function unavailableRoster(): WebsiteRoster {
  return { source: "unavailable", guild: null, syncedAt: null, roles: [] };
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchRemoteRoster(botUrl: string, token: string): Promise<RemoteRoster> {
  const origin = new URL(botUrl);
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (origin.protocol !== "https:" && !(origin.protocol === "http:" && isLocal)) throw new Error("Discord bot URL must use HTTPS.");
  if (origin.username || origin.password) throw new Error("Discord bot URL must not include credentials.");

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(new URL("/api/website/roster", origin), {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) throw new Error(`Discord roster returned HTTP ${response.status}.`);
      const roster = asRoster(await response.json());
      if (!roster) throw new Error("Discord roster response was invalid.");
      return roster;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await wait(600);
    }
  }
  throw lastError;
}

// Cached independently from the page so a short Render/Discord outage keeps
// showing the most recently verified roster instead of marking every role as syncing.
const getCachedRemoteRoster = unstable_cache(fetchRemoteRoster, ["xenon-discord-roster-v1"], {
  revalidate: 60,
});

const FALLBACK_TTL_MS = 5 * 60 * 1000;
let lastKnownGoodRoster: { key: string; roster: RemoteRoster; receivedAt: number } | null = null;
let inFlightRoster: { key: string; request: Promise<RemoteRoster> } | null = null;

function rosterKey(botUrl: string, token: string) {
  return `${botUrl}\u0000${token}`;
}

function loadRemoteRoster(botUrl: string, token: string) {
  const key = rosterKey(botUrl, token);
  if (inFlightRoster?.key === key) return inFlightRoster.request;
  const request = getCachedRemoteRoster(botUrl, token).then((roster) => {
    lastKnownGoodRoster = { key, roster, receivedAt: Date.now() };
    return roster;
  }).finally(() => {
    if (inFlightRoster?.request === request) inFlightRoster = null;
  });
  inFlightRoster = { key, request };
  return request;
}

export async function getWebsiteRoster(): Promise<WebsiteRoster> {
  const botUrl = process.env.DISCORD_BOT_URL;
  const token = process.env.WEBSITE_BOT_TOKEN;
  if (!botUrl || !token) return unavailableRoster();

  try {
    return { source: "discord", ...await loadRemoteRoster(botUrl, token) };
  } catch {
    const key = rosterKey(botUrl, token);
    if (lastKnownGoodRoster?.key === key && Date.now() - lastKnownGoodRoster.receivedAt <= FALLBACK_TTL_MS) {
      return { source: "discord", ...lastKnownGoodRoster.roster };
    }
    return unavailableRoster();
  }
}

function joinNames(members: DiscordRosterMember[]) {
  const names = members.map((member) => member.nickname);
  if (names.length < 2) return names[0] || "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

export async function getStaffRoles(): Promise<Role[]> {
  const roster = await getWebsiteRoster();
  return staffRoleDefinitions.map((definition) => {
    const holders = roster.roles.find((role) => role.id === definition.id)?.members || [];
    const status = roster.source === "unavailable" ? "unavailable" : holders.length ? "closed" : "open";
    const lead = status === "closed"
      ? `Held by ${joinNames(holders)}. `
      : status === "open"
        ? "Position currently unassigned. "
        : "Availability is syncing from Discord. ";
    return { ...definition, status, holders, description: `${lead}${definition.description}` };
  });
}

export async function getCurrentStaff() {
  const roles = await getStaffRoles();
  return roles.flatMap((role) => role.holders.map((member) => ({
    id: `${role.id}:${member.id}`,
    name: member.nickname,
    role: role.title,
    responsibilities: staffRoleDefinitions.find((definition) => definition.id === role.id)?.responsibilities || [],
  })));
}
