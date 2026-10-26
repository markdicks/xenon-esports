export type StaffRoleDefinition = {
  id: string;
  title: string;
  department: string;
  description: string;
  responsibilities: string[];
};

export const staffRoleDefinitions: StaffRoleDefinition[] = [
  {
    id: "founder",
    title: "Founder",
    department: "Leadership",
    description: "Owns Xenon's direction, web presence and community event foundations.",
    responsibilities: ["Web Development", "Community Events"],
  },
  {
    id: "content-lead",
    title: "Content Lead",
    department: "Content",
    description: "Leads creative direction, short-form content and editing standards.",
    responsibilities: ["Creative Direction", "Short-form Content", "Editing"],
  },
  {
    id: "head-of-operations",
    title: "Head of Operations",
    department: "Operations",
    description: "Owns internal coordination, staff support, cross-department communication and day-to-day execution across Xenon.",
    responsibilities: ["Staff Support", "Cross-department Communication", "Day-to-day Execution"],
  },
  {
    id: "competitive-director",
    title: "Competitive Director",
    department: "Competitive",
    description: "Builds and oversees Xenon's competitive divisions and team leadership.",
    responsibilities: ["Competitive Divisions", "Team Leadership", "Roster Standards"],
  },
  {
    id: "creator-director",
    title: "Creator Director",
    department: "Creators",
    description: "Builds Xenon's creator direction, creator programme and creator relationships.",
    responsibilities: ["Creative Direction", "Creator Programme", "Creator Relationships"],
  },
  {
    id: "community-manager",
    title: "Community Manager",
    department: "Community",
    description: "Keeps Discord, events and member communication active, clear and welcoming.",
    responsibilities: ["Discord Activity", "Community Events", "Member Communication"],
  },
];
