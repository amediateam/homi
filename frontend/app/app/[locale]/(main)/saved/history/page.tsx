import { Suspense } from "react";

import { FeedSkeleton } from "@/features/feed/ListingCardSkeleton";
import { HistoryServer } from "@/features/saved/server";

/**
 * History «Смотрели» (SCR-025, WP-29): a static shell, and under `<Suspense>` the part that reads the cookie (DEC-44,
 * `authentication-with-cache-components.md`). Nothing per-user is cached.
 */
export default function HistoryPage() {
  return (
    <div data-route="saved/history">
      <Suspense fallback={<FeedSkeleton />}>
        <HistoryServer />
      </Suspense>
    </div>
  );
}
