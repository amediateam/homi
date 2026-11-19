import { Suspense } from "react";

import { FeedSkeleton } from "@/features/feed/ListingCardSkeleton";
import { FavoritesServer } from "@/features/saved/server";

/**
 * Favourites (SCR-024, WP-29): a static shell, and under `<Suspense>` the part that reads the cookie (DEC-44,
 * `authentication-with-cache-components.md`). Nothing per-user is cached.
 */
export default function FavoritesPage() {
  return (
    <div data-route="saved">
      <Suspense fallback={<FeedSkeleton />}>
        <FavoritesServer />
      </Suspense>
    </div>
  );
}
