import { Suspense } from "react";

import { MapLoading, MapScreen } from "@/features/map/MapScreen";

/**
 * The search map (SCR-011 … SCR-013, WP-27). The route marker is in the server's HTML; the screen reads the address
 * inside `<Suspense>` (`use-search-params.md`), and every map read is a browser read through `/bff/*` (`25` §3.5).
 */
export default function MapPage() {
  return (
    <div data-route="map">
      <Suspense fallback={<MapLoading />}>
        <MapScreen />
      </Suspense>
    </div>
  );
}
