import { visibleNews } from "@/data/news";
import { recruitmentOpportunities } from "@/data/recruitment-opportunities";

export function visibleOpportunities() {
  const slugs = new Set(visibleNews().map(({ slug }) => slug));
  return recruitmentOpportunities.filter(({ article }) => slugs.has(article));
}
