import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db";
import { configActorSchema, type ConfigActor } from "@/lib/site-config-validation";
import { defaultSocialDestinations, defaultSocialPage, platformKeys, socialConfigKeys, socialDestinationsSchema, socialPageSchema, socialPlatforms, type SocialDestinations, type SocialPage } from "@/lib/socials-contract";

type ConfigRow = RowDataPacket & { config_key: string; config_value: string | null };
function snapshot(rows: ConfigRow[]) {
  const stored = new Map(rows.map((row) => [row.config_key, row.config_value]));
  const page = socialPageSchema.parse(stored.get("socials.page") ? JSON.parse(stored.get("socials.page")!) : defaultSocialPage);
  const destinations = socialDestinationsSchema.parse(Object.fromEntries(socialPlatforms.map((platform) => [platform, stored.has(platformKeys[platform]) ? stored.get(platformKeys[platform]) : defaultSocialDestinations[platform]])));
  const version = createHash("sha256").update(JSON.stringify({ page, destinations })).digest("hex");
  return { page, destinations, version };
}
const query = `SELECT config_key, config_value FROM site_config WHERE config_key IN (${socialConfigKeys.map(() => "?").join(",")})`;
export async function getSocialsSettings() { const [rows] = await getDbPool().execute<ConfigRow[]>(query, [...socialConfigKeys]); return snapshot(rows); }
export async function getPublicSocials() {
  try { return await getSocialsSettings(); } catch { return { page: structuredClone(defaultSocialPage), destinations: { ...defaultSocialDestinations }, version: null }; }
}
type Change = { action: "save-links"; links: SocialPage["links"]; destinations: SocialDestinations } | { action: "save-appearance"; appearance: SocialPage["appearance"] };
export async function saveSocialsSettings(version: string, change: Change, actor: ConfigActor) {
  const checkedActor = configActorSchema.parse(actor), c = await getDbPool().getConnection();
  try {
    await c.beginTransaction();
    // One fixed key serializes page edits. Platform rows are also locked so a
    // concurrent /social command cannot be overwritten by a stale editor.
    await c.execute("INSERT INTO site_config (config_key, config_value, updated_by_discord_id, updated_by_name) VALUES (?, NULL, ?, ?) ON DUPLICATE KEY UPDATE config_key = VALUES(config_key)", ["socials.page", checkedActor.discordId, checkedActor.name]);
    const [rows] = await c.execute<ConfigRow[]>(`${query} FOR UPDATE`, [...socialConfigKeys]);
    const current = snapshot(rows);
    if (current.version !== version) throw Object.assign(new Error("Socials changed in another editor or Discord command. Reload the current settings before saving."), { status: 409 });
    const page = socialPageSchema.parse({ ...current.page, revision: randomUUID(), ...(change.action === "save-links" ? { links: change.links } : { appearance: change.appearance }) });
    const values = new Map<string, string | null>([["socials.page", JSON.stringify(page)]]);
    if (change.action === "save-links") {
      const destinations = socialDestinationsSchema.parse(change.destinations);
      for (const platform of socialPlatforms) if (destinations[platform] !== current.destinations[platform] || !rows.some((row) => row.config_key === platformKeys[platform])) values.set(platformKeys[platform], destinations[platform]);
    }
    for (const [key, value] of Array.from(values)) {
      const old = rows.find((row) => row.config_key === key)?.config_value ?? null;
      await c.execute("INSERT INTO site_config (config_key, config_value, updated_by_discord_id, updated_by_name) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_by_discord_id = VALUES(updated_by_discord_id), updated_by_name = VALUES(updated_by_name), updated_at = CURRENT_TIMESTAMP", [key, value, checkedActor.discordId, checkedActor.name]);
      await c.execute("INSERT INTO config_audit (config_key, old_value, new_value, changed_by_discord_id, changed_by_name) VALUES (?, ?, ?, ?, ?)", [key, old, value, checkedActor.discordId, checkedActor.name]);
    }
    await c.commit();
    return snapshot([...rows.filter((row) => !values.has(row.config_key)), ...Array.from(values).map(([config_key, config_value]) => ({ config_key, config_value } as ConfigRow))]);
  } catch (error) { await c.rollback(); throw error; } finally { c.release(); }
}
