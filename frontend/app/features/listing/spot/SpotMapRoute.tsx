"use client";

import { useContext, useEffect, useEffectEvent, useLayoutEffect, useMemo, useState } from "react";

import { listingKey, type ListingRecord, placeLine } from "@/features/listing/listingData";
import { ListingLayerContext, type ListingView, useListingNumber, useListingRecord } from "@/features/listing/useListing";
import { RouteOverlay } from "@/features/shell/RouteOverlay";
import { useResource } from "@/lib/data/useResource";
import { useBack } from "@/lib/navigation/useBack";
import { useCloseOnce } from "@/lib/navigation/useCloseOnce";

import { spotOf } from "./spotGeometry";
import { SpotMapFullscreen } from "./SpotMapFullscreen";

/** Never called: the listing's own screen reads the resource, this route only watches it. */
const neverRead = () => Promise.reject(new Error("the spot map never reads the listing"));

/** The listing screen's error states (SCR-019): its read failed. */
function failedView(view: ListingView["state"] | null): boolean {
  return view === "not_found" || view === "offline" || view === "server";
}

/**
 * `/listing/{number}/location` (WP-28, `03` SCR-021) in both route trees: the fullscreen spot map in a `RouteOverlay`
 * at z-index 100, over the listing of this layer, which stays mounted under it. It reads the listing's resource
 * without reading itself (`useListingRecord`, as the photos, market and actions children do), so the mini map's tap
 * opens it at once and a direct load shows its frame — ×, the map's background — over the listing page until the
 * listing's answer is there. A listing without coordinates, a listing read that failed with nothing to show, or an
 * address without a valid number goes back at once (`back()`, once per address). The failure is the resource's (a
 * browser read) or the state the listing screen reports through the layer (`view`), as the server's read in cookie
 * mode never reaches the resource. The overlay never swipes back and the listing's swipe back is off under a child
 * route (`ListingLayer`); Telegram's Back closes it first through the app's history (it was pushed), or replaces it
 * with the listing at depth 0 (`parentOf`). Every opening remounts the map, so a position found on the last opening
 * is gone (TMA-035): hidden with its route (Activity) or unmounted, the next show is a new opening.
 */
export function SpotMapRoute() {
  const number = useListingNumber();
  const { details } = useListingRecord(number);
  const { error } = useResource<ListingRecord>(number === null ? null : listingKey(number), neverRead, { enabled: false });
  const { view } = useContext(ListingLayerContext);
  const { back } = useBack();
  const close = useCloseOnce(back);
  const [opening, setOpening] = useState(0);

  const location = details?.location ?? null;
  const radius = details?.geo_radius_m ?? null;
  const lat = location?.lat ?? null;
  const lon = location?.lon ?? null;
  const spot = useMemo(() => (lat === null || lon === null ? null : spotOf({ lat, lon }, radius)), [lat, lon, radius]);
  // A failed refetch keeps the details on screen (`useResource`): only a failure without them leaves.
  const leave = number === null || (details === null ? error !== null || failedView(view) : location === null);

  const leaveNow = useEffectEvent(() => close());
  useEffect(() => {
    if (leave) {
      leaveNow();
    }
  }, [leave]);

  useLayoutEffect(() => () => setOpening((count) => count + 1), []);

  return (
    <RouteOverlay data-route="listing/location" className="z-(--z-viewer) overflow-hidden bg-bg2">
      <SpotMapFullscreen key={opening} spot={leave ? null : spot} place={details === null ? null : placeLine(details)} onClose={close} />
    </RouteOverlay>
  );
}
