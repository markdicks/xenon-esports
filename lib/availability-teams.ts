import { getManagementConfig, saveManagementConfig } from "@/lib/discord-management";
import { availabilityTeamsSchema } from "@/lib/availability-contract";
export async function getAvailabilityTeams(guildId: string) {
  const current = await getManagementConfig(guildId);
  return { revision: current.revision, teams: current.config?.availabilityTeams || [] };
}
export async function saveAvailabilityTeams(guildId: string, actorId: string, revision: string | null, input: unknown) {
  const teams = availabilityTeamsSchema.parse(input), current = await getManagementConfig(guildId);
  const conflict = () => Object.assign(new Error("Team groups changed. Reload before saving."), { code: "AVAILABILITY_CONFLICT" });
  if (current.revision !== revision) throw conflict();
  const config = current.config || { pillars: (["content", "operations", "competitive", "creators", "community", "staff"] as const).map((key) => ({
    key, leadRoleId: null, targets: [], permissions: [], subroles: [], pendingChannels: [], leadAccess: [], leadAccessPending: false,
  })) };
  const saved = await saveManagementConfig(guildId, revision, { ...config, availabilityTeams: teams }, actorId);
  if (!saved) throw conflict();
  return { revision: saved, teams };
}
