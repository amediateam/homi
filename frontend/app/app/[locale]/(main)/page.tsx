import { Suspense } from "react";

import { RoutePlaceholder } from "@/features/shell/RoutePlaceholder";
import { SearchProofServer } from "@/features/shell/SearchProofServer";

/** Feed (SCR-007 … SCR-010); WP-24 replaces the placeholder. Until then it shows the WP-22 data proof. */
export default function FeedPage({ searchParams }: PageProps<"/[locale]">) {
  return (
    <RoutePlaceholder name="feed">
      <Suspense fallback={null}>
        <SearchProofServer searchParams={searchParams} />
      </Suspense>
    </RoutePlaceholder>
  );
}
