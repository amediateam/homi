import { Suspense } from "react";

import { SortSheetRoute } from "@/features/filters/SortSheetRoute";

/** Sort (SCR-016), intercepted into the sheet slot over the feed. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <SortSheetRoute presentation="layer" />
    </Suspense>
  );
}
