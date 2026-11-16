import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { isListingNumber, isQuickFilterKind, isRadarId, routes } from "@/lib/navigation/routes";

import { type RouteLayer, RoutePlaceholder } from "./RoutePlaceholder";

/**
 * Placeholders of the addresses with a parameter (WP-20). With `cacheComponents` the parameter is runtime data, so
 * the route file passes the `params` promise here inside `<Suspense>`; an invalid value calls `notFound()`.
 */

export async function QuickFilterPlaceholder({ params, layer }: { params: Promise<{ kind: string }>; layer?: RouteLayer }) {
  const { kind } = await params;
  if (!isQuickFilterKind(kind)) {
    notFound();
  }
  return <RoutePlaceholder name={`filters/${kind}`} layer={layer} />;
}

export async function ListingPlaceholder({
  params,
  layer,
  children,
}: {
  params: Promise<{ number: string }>;
  layer?: RouteLayer;
  children: ReactNode;
}) {
  const { number } = await params;
  if (!isListingNumber(number)) {
    notFound();
  }
  const listing = Number(number);
  // Inside `RouteOverlay`, full screen in both presentations and without a top inset of its own (legacy
  // `listing-layer`: WP-26's hero runs under Telegram's header), the placeholder clears the inset itself.
  return (
    <RoutePlaceholder
      name="listing"
      layer={layer}
      links={[routes.listingPhotos(listing), routes.listingActions(listing)]}
      className="pt-[calc(16px+var(--top-inset))]"
    >
      {children}
    </RoutePlaceholder>
  );
}

export async function RadarPlaceholder({
  params,
  layer,
  children,
}: {
  params: Promise<{ id: string }>;
  layer?: RouteLayer;
  children: ReactNode;
}) {
  const { id } = await params;
  if (!isRadarId(id)) {
    notFound();
  }
  return (
    <RoutePlaceholder name="radar" layer={layer}>
      {children}
    </RoutePlaceholder>
  );
}
