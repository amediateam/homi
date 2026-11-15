import type { ReactNode } from "react";
import { Suspense } from "react";

import { ListingPlaceholder } from "@/features/shell/RouteParamPlaceholder";

/** Listing (SCR-018, SCR-019), kept mounted under photos, location, market and actions; WP-26 replaces the placeholder. Intercepted into the overlay slot. */
export default function Layout({ children, params }: { children: ReactNode; params: Promise<{ number: string }> }) {
  return (
    <Suspense fallback={null}>
      <ListingPlaceholder params={params} layer="overlay">{children}</ListingPlaceholder>
    </Suspense>
  );
}
