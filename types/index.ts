export type Pillar = {
  title: string;
  eyebrow: string;
  description: string;
};

export type RoadmapItem = {
  quarter: string;
  day: string;
  month: string;
  title: string;
  description: string;
  label: string;
};

export type DiscordRosterMember = {
  id: string;
  nickname: string;
  username: string;
};

export type RoleStatus = "open" | "closed" | "unavailable";

export type Role = {
  id: string;
  title: string;
  department: string;
  status: RoleStatus;
  description: string;
  holders: DiscordRosterMember[];
};
