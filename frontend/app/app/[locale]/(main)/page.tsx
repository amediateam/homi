import { Suspense } from "react";

import { RefreshProof } from "@/features/shell/RefreshProof";
import { RoutePlaceholder } from "@/features/shell/RoutePlaceholder";
import { SearchProofServer } from "@/features/shell/SearchProofServer";

/**
 * Feed (SCR-007 … SCR-010); WP-24 replaces the placeholder. Until then it shows the WP-22 data proof and the
 * stand-in pull-to-refresh handler of WP-23.
 */
export default function FeedPage({ searchParams }: PageProps<"/[locale]">) {
  return (
    <RoutePlaceholder name="feed">
      <Suspense fallback={null}>
        <SearchProofServer searchParams={searchParams} />
      </Suspense>
      <RefreshProof />
    </RoutePlaceholder>
  );
}
