import { Suspense } from "react";

import { FiltersSheetRoute } from "@/features/filters/FiltersSheetRoute";

/** Full filters (SCR-014), direct load: the standalone sheet; a soft navigation shows the copy in @sheet. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <FiltersSheetRoute presentation="standalone" />
    </Suspense>
  );
}
