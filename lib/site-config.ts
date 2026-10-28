import "server-only";
import type { RowDataPacket } from "mysql2";
import { getDbPool } from "@/lib/db";
import {
  configActorSchema, configKeys, configKeySchema, normalizeConfigValue,
  type ConfigActor, type ConfigKey, type ConfigValues,
} from "@/lib/site-config-validation";

type ConfigRow = RowDataPacket & { config_key: ConfigKey; config_value: string | null };

export async function getConfigs(prefix = ""): Promise<Partial<ConfigValues>> {
  const keys = configKeys.filter((key) => key.startsWith(prefix));
  if (!keys.length) return {};
  const [rows] = await getDbPool().execute<ConfigRow[]>(
    `SELECT config_key, config_value FROM site_config WHERE config_key IN (${keys.map(() => "?").join(", ")})`,
    keys,
  );
  const values: Partial<ConfigValues> = Object.fromEntries(keys.map((key) => [key, null]));
  for (const row of rows) {
    if (!keys.includes(row.config_key)) continue;
    // A manually edited or legacy row must never introduce an unsafe public URL.
    try { values[row.config_key] = normalizeConfigValue(row.config_key, row.config_value); } catch {
      values[row.config_key] = null;
    }
  }
  return values;
}

export async function getConfig(key: ConfigKey): Promise<string | null> {
  configKeySchema.parse(key);
  return (await getConfigs(key))[key] ?? null;
}

export async function setConfig(key: ConfigKey, value: string | null, actor: ConfigActor) {
  configKeySchema.parse(key);
  const checkedActor = configActorSchema.parse(actor);
  const checkedValue = normalizeConfigValue(key, value);
  const connection = await getDbPool().getConnection();
  try {
    await connection.beginTransaction();
    // This upsert also locks first-time keys: concurrent initial writes cannot
    // both record NULL as the previous value. A failed audit rolls it all back.
    await connection.execute(
      `INSERT INTO site_config (config_key, config_value, updated_by_discord_id, updated_by_name)
       VALUES (?, NULL, ?, ?) ON DUPLICATE KEY UPDATE config_key = VALUES(config_key)`,
      [key, checkedActor.discordId, checkedActor.name],
    );
    const [rows] = await connection.execute<ConfigRow[]>(
      "SELECT config_key, config_value FROM site_config WHERE config_key = ? FOR UPDATE", [key],
    );
    await connection.execute(
      `UPDATE site_config SET config_value = ?, updated_by_discord_id = ?, updated_by_name = ?,
       updated_at = CURRENT_TIMESTAMP WHERE config_key = ?`,
      [checkedValue, checkedActor.discordId, checkedActor.name, key],
    );
    await connection.execute(
      `INSERT INTO config_audit (config_key, old_value, new_value, changed_by_discord_id, changed_by_name)
       VALUES (?, ?, ?, ?, ?)`,
      [key, rows[0]?.config_value ?? null, checkedValue, checkedActor.discordId, checkedActor.name],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
