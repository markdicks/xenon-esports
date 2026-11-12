export const interestRoutes = [
  ["interest-competitive", "Competitive"], ["interest-streaming", "Streaming"],
  ["interest-content-creation", "Content creation"], ["interest-video-editing", "Video editing"],
  ["interest-graphics", "Graphics"], ["interest-community-events", "Community/events"],
  ["interest-moderation", "Moderation"], ["interest-operations", "Operations"],
  ["interest-casting-broadcasting", "Casting/broadcasting"], ["interest-development-technical", "Development/technical"],
  ["interest-partnerships-networking", "Partnerships/networking"], ["interest-not-sure-yet", "Not sure yet"], ["interest-other", "Other"],
] as const;
export function selectedInterestRoutes(value: unknown) {
  let interests = value;
  if (typeof interests === "string") { try { interests = JSON.parse(interests); } catch { interests = []; } }
  return interestRoutes.filter(([, label]) => Array.isArray(interests) && interests.includes(label)).map(([key]) => key);
}
