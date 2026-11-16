import type { ReactNode } from "react";
import { Suspense } from "react";

import { ListingPlaceholder } from "@/features/shell/RouteParamPlaceholder";
import { RouteOverlay } from "@/features/shell/RouteOverlay";

/** Listing (SCR-018, SCR-019), kept mounted under photos, location, market and actions; WP-26 replaces the placeholder. Direct load, shown as the standalone layer. */
export default function Layout({ children, params }: { children: ReactNode; params: Promise<{ number: string }> }) {
  return (
    <Suspense fallback={null}>
      <RouteOverlay presentation="standalone">
        <ListingPlaceholder params={params}>{children}</ListingPlaceholder>
      </RouteOverlay>
    </Suspense>
  );
}
