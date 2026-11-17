import { Suspense } from "react";

import { FiltersSheetRoute } from "@/features/filters/FiltersSheetRoute";

/** Full filters (SCR-014), intercepted into the sheet slot over the feed or the map. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <FiltersSheetRoute presentation="layer" />
    </Suspense>
  );
}
