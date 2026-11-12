import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { getDbPool } from "@/lib/db";

const id = z.string().regex(/^\d{17,20}$/);
const pillarKeys = ["content", "operations", "competitive", "creators", "community", "staff"] as const;
const permissions = z.array(z.enum([
  "ViewChannel", "SendMessages", "ReadMessageHistory", "AddReactions", "AttachFiles", "EmbedLinks",
  "Connect", "Speak", "Stream", "UseVAD", "ManageMessages", "MuteMembers", "DeafenMembers", "MoveMembers",
])).max(14).refine((values) => new Set(values).size === values.length);
const leadAccessSchema = z.object({
  channelId: id, roleId: id, managed: permissions, allow: permissions, deny: permissions,
}).strict().refine((entry) => entry.allow.every((key) => entry.managed.includes(key) && !entry.deny.includes(key))
  && entry.deny.every((key) => entry.managed.includes(key)));
const ownedRoleSchema = z.object({
  id: z.union([id, z.string().regex(/^pending:[a-f0-9-]{36}$/)]), name: z.string().trim().min(1).max(100), permissions,
}).strict();
const teamSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(100), categoryId: id.nullable(),
  status: z.enum(["creating", "active", "deleting"]), roles: z.array(ownedRoleSchema).min(1).max(3),
  pendingChannels: z.array(z.object({ id: z.string().uuid(), name: z.string().min(1).max(100), type: z.union([z.literal(0), z.literal(2)]) }).strict()).max(7),
}).strict().refine((team) => new Set(team.roles.map((role) => role.id)).size === team.roles.length);
const pillarSchema = z.object({
    key: z.enum(pillarKeys),
    leadRoleId: id.nullable(),
    targets: z.array(z.object({
      id, type: z.enum(["category", "channel"]), modPermissions: z.boolean().optional(), permissions: permissions.optional(),
    }).strict()).max(20).refine((targets) => new Set(targets.map((target) => target.id)).size === targets.length),
    permissions,
    subroles: z.array(z.object({
      id: z.union([id, z.string().regex(/^pending:[a-f0-9-]{36}$/)]),
      name: z.string().trim().min(1).max(100), permissions,
    }).strict()).max(5),
    pendingChannels: z.array(z.object({
      id: z.string().uuid(), parentId: id, name: z.string().min(1).max(100), type: z.union([z.literal(0), z.literal(2)]),
    }).strict()).max(200).default([]),
    leadAccess: z.array(leadAccessSchema).max(1000).refine(
      (entries) => new Set(entries.map((entry) => `${entry.channelId}:${entry.roleId}`)).size === entries.length,
    ).default([]),
    leadAccessPending: z.boolean().default(false),
    teams: z.array(teamSchema).max(3).optional(),
}).strict().refine((pillar) => (!pillar.teams?.length || pillar.key === "competitive")
  && new Set(pillar.teams?.map((team) => team.id)).size === (pillar.teams?.length || 0)
  && new Set(pillar.teams?.map((team) => team.categoryId).filter(Boolean)).size === (pillar.teams?.filter((team) => team.categoryId).length || 0));
export const managementSchema = z.object({
  pillars: z.array(pillarSchema).length(pillarKeys.length).refine((pillars) => new Set(pillars.map((pillar) => pillar.key)).size === pillarKeys.length
    && pillars.reduce((total, pillar) => total + pillar.leadAccess.length, 0) <= 1000
    && (() => { const ids = pillars.flatMap((pillar) => [...pillar.subroles, ...(pillar.teams || []).flatMap((team) => team.roles)]).map((role) => role.id); return new Set(ids).size === ids.length; })()),
}).strict();
const storedManagementSchema = z.union([
  managementSchema,
  managementSchema.extend({
    pillars: z.array(pillarSchema).length(pillarKeys.length - 1).refine(
      (pillars) => !pillars.some((pillar) => pillar.key === "staff") && new Set(pillars.map((pillar) => pillar.key)).size === pillarKeys.length - 1,
    ).transform((pillars) => [...pillars, {
      key: "staff" as const, leadRoleId: null, targets: [], permissions: [], subroles: [], pendingChannels: [], leadAccess: [], leadAccessPending: false,
    }]),
  }),
]);
export type ManagementConfig = z.infer<typeof managementSchema>;
type ConfigRow = RowDataPacket & { revision: string; configuration: unknown };

export async function getManagementConfig(guildId: string) {
  const [rows] = await getDbPool().execute<ConfigRow[]>(
    "SELECT revision, configuration FROM discord_management WHERE guild_id = ?", [guildId],
  );
  if (!rows[0]) return { revision: null, config: null };
  const value = rows[0].configuration;
  return { revision: rows[0].revision, config: storedManagementSchema.parse(typeof value === "string" ? JSON.parse(value) : value) };
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
