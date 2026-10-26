import type { RowDataPacket } from "mysql2";
import { getDbPool } from "@/lib/db";

export type DiscordRoleLink = {
  roleKey: string;
  discordRoleId: string;
};

type RoleLinkRow = RowDataPacket & {
  role_key: string;
  discord_role_id: string;
};

export async function getDiscordRoleLinks(guildId: string): Promise<DiscordRoleLink[]> {
  const [rows] = await getDbPool().execute<RoleLinkRow[]>(
    `SELECT role_key, discord_role_id
     FROM discord_role_links
     WHERE guild_id = ?
     ORDER BY role_key ASC`,
    [guildId],
  );
  return rows.map((row) => ({ roleKey: row.role_key, discordRoleId: row.discord_role_id }));
}

export async function replaceDiscordRoleLinks(guildId: string, links: DiscordRoleLink[]) {
  const connection = await getDbPool().getConnection();
  try {
    await connection.beginTransaction();
    if (links.length) {
      const keys = links.map((link) => link.roleKey);
      await connection.execute(
        `DELETE FROM discord_role_links
         WHERE guild_id = ? AND role_key NOT IN (${keys.map(() => "?").join(", ")})`,
        [guildId, ...keys],
      );
    } else {
      await connection.execute("DELETE FROM discord_role_links WHERE guild_id = ?", [guildId]);
    }
    for (const link of links) {
      await connection.execute(
        `INSERT INTO discord_role_links (guild_id, role_key, discord_role_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE discord_role_id = VALUES(discord_role_id)`,
        [guildId, link.roleKey, link.discordRoleId],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
