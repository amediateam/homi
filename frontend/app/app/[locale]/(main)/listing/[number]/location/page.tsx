import { Suspense } from "react";

import { SpotMapRoute } from "@/features/listing/spot/SpotMapRoute";

/** Spot map, fullscreen (SCR-021) over the listing; Back reads the search params, so the page waits in `<Suspense>`. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <SpotMapRoute />
    </Suspense>
  );
}
