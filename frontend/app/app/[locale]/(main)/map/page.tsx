import { Suspense } from "react";

import { RoutePlaceholder } from "@/features/shell/RoutePlaceholder";
import { SearchProofServer } from "@/features/shell/SearchProofServer";

/** Search map, lasso and selection card (SCR-011 … SCR-013); WP-27 replaces the placeholder. Until then it shows the WP-22 data proof. */
export default function Page({ searchParams }: PageProps<"/[locale]/map">) {
  return (
    <RoutePlaceholder name="map">
      <Suspense fallback={null}>
        <SearchProofServer searchParams={searchParams} />
      </Suspense>
    </RoutePlaceholder>
  );
}
