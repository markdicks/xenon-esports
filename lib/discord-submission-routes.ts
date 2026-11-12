import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db";
import { interestRoutes } from "@/data/interest-routing";

export const submissionRouteKeys = [
  "application",
  "interest",
  "contact-partnerships",
  "contact-business",
  "contact-media",
  "contact-general-enquiry",
] as const;

export type SubmissionRouteKey = typeof submissionRouteKeys[number];
export type SubmissionRoutes = Record<SubmissionRouteKey, string[]> & Partial<Record<typeof interestRoutes[number][0], string[]>>;

type RouteRow = RowDataPacket & { routes: unknown };

function parseRoutes(value: unknown): SubmissionRoutes {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Stored Discord submission routes are invalid.");
  }

  const keys = [...submissionRouteKeys, ...interestRoutes.map(([key]) => key).filter((key) => Object.hasOwn(parsed, key))];
  return Object.fromEntries(keys.map((key) => {
    const roleIds = (parsed as Record<string, unknown>)[key];
    if (!Array.isArray(roleIds) || roleIds.some((id) => typeof id !== "string")) {
      throw new Error("Stored Discord submission routes are invalid.");
    }
    return [key, roleIds];
  })) as SubmissionRoutes;
}

export async function getDiscordSubmissionRoutes(guildId: string) {
  const [rows] = await getDbPool().execute<RouteRow[]>(
    "SELECT routes FROM discord_submission_routes WHERE guild_id = ?",
    [guildId],
  );
  if (!rows[0]) return { configured: false, routes: null };
  return { configured: true, routes: parseRoutes(rows[0].routes) };
}

export async function saveDiscordSubmissionRoutes(guildId: string, routes: SubmissionRoutes) {
  await getDbPool().execute(
    `INSERT INTO discord_submission_routes (guild_id, routes)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE routes = VALUES(routes)`,
    [guildId, JSON.stringify(routes)],
  );
}
