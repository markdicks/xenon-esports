import { isEditorialReview } from "@/data/news";
import { publicCommunityEvent } from "@/lib/community-events";
import { publicEventSchema, valorantEventId } from "@/lib/community-contract";

export async function editorialValorantEvent(includeResults = true) {
  if (isEditorialReview()) {
    // Local editorial previews can read actual public status without production database credentials.
    try {
      const response = await fetch("https://xenonesports.online/api/events/valorant?results=1", {
        cache: "no-store", signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const { event } = await response.json();
        const result = publicEventSchema.safeParse(event);
        if (result.success && result.data.id === valorantEventId && result.data.available) return result.data;
      }
    } catch {
      // The regular event reader provides the same unavailable state if storage is offline.
    }
  }
  return publicCommunityEvent(valorantEventId, includeResults);
}
