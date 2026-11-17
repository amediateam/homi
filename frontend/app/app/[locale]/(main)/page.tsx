import { Suspense } from "react";

import { FeedServer } from "@/features/feed/FeedServer";
import { FeedSkeleton } from "@/features/feed/ListingCardSkeleton";

/**
 * Search list (SCR-007 … SCR-010, WP-24): a static shell, and under `<Suspense>` the part that reads the cookie and
 * the address (DEC-44, `streaming.md`); the `searchParams` promise is passed down unawaited. Nothing per-user is
 * cached.
 */
export default function FeedPage({ searchParams }: PageProps<"/[locale]">) {
  return (
    <div data-route="feed">
      <Suspense fallback={<FeedSkeleton />}>
        <FeedServer searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
