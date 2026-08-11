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

export type Role = {
  title: string;
  department: string;
  status: "open" | "closed";
  description: string;
};
