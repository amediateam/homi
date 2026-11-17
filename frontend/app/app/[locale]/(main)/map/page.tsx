import { Suspense } from "react";

import { MapScreen } from "@/features/map/MapScreen";

/** Search map (SCR-011 … SCR-013, WP-27): every map read is a browser read through `/bff/*` (`25` §3.5). */
export default function MapPage() {
  return (
    <div data-route="map">
      <Suspense fallback={null}>
        <MapScreen />
      </Suspense>
    </div>
  );
}
