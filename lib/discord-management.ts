import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { getDbPool } from "@/lib/db";

const id = z.string().regex(/^\d{17,20}$/);
const permissions = z.array(z.enum([
  "ViewChannel", "SendMessages", "ReadMessageHistory", "AddReactions", "AttachFiles", "EmbedLinks",
  "Connect", "Speak", "Stream", "UseVAD", "ManageMessages", "MuteMembers", "DeafenMembers", "MoveMembers",
])).max(14).refine((values) => new Set(values).size === values.length);
export const managementSchema = z.object({
  pillars: z.array(z.object({
    key: z.enum(["content", "operations", "competitive", "creators", "community"]),
    leadRoleId: id.nullable(),
    targets: z.array(z.object({ id, type: z.enum(["category", "channel"]) }).strict()).max(20),
    permissions,
    subroles: z.array(z.object({
      id: z.union([id, z.string().regex(/^pending:[a-f0-9-]{36}$/)]),
      name: z.string().trim().min(1).max(100), permissions,
    }).strict()).max(5),
    pendingChannels: z.array(z.object({
      id: z.string().uuid(), parentId: id, name: z.string().min(1).max(100), type: z.union([z.literal(0), z.literal(2)]),
    }).strict()).max(200).default([]),
  }).strict()).length(5).refine((pillars) => new Set(pillars.map((pillar) => pillar.key)).size === 5),
}).strict();
export type ManagementConfig = z.infer<typeof managementSchema>;
type ConfigRow = RowDataPacket & { revision: string; configuration: unknown };

export async function getManagementConfig(guildId: string) {
  const [rows] = await getDbPool().execute<ConfigRow[]>(
    "SELECT revision, configuration FROM discord_management WHERE guild_id = ?", [guildId],
  );
  if (!rows[0]) return { revision: null, config: null };
  const value = rows[0].configuration;
  return { revision: rows[0].revision, config: managementSchema.parse(typeof value === "string" ? JSON.parse(value) : value) };
}

export async function saveManagementConfig(guildId: string, revision: string | null, config: ManagementConfig, actorId: string) {
  const nextRevision = randomUUID();
  const [result] = revision === null
    ? await getDbPool().execute<ResultSetHeader>(
      "INSERT IGNORE INTO discord_management (guild_id, revision, configuration, updated_by) VALUES (?, ?, ?, ?)",
      [guildId, nextRevision, JSON.stringify(config), actorId],
    )
    : await getDbPool().execute<ResultSetHeader>(
      "UPDATE discord_management SET revision = ?, configuration = ?, updated_by = ? WHERE guild_id = ? AND revision = ?",
      [nextRevision, JSON.stringify(config), actorId, guildId, revision],
    );
  return result.affectedRows === 1 ? nextRevision : null;
}
