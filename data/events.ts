export type CommunityEvent = {
  title: string;
  timing: string;
  category: string;
  description: string;
};

export const upcomingEvents: CommunityEvent[] = [
  {
    title: "Community programme",
    timing: "Dates announced in Discord",
    category: "Watch parties · Game nights · Community play",
    description: "Confirmed watch parties, game nights and community sessions will be published here with the details members need to join.",
  },
];

export const pastEventRecaps: CommunityEvent[] = [];
