import { Suspense } from "react";

import { SortSheetRoute } from "@/features/filters/SortSheetRoute";

/** Sort (SCR-016), direct load: the standalone sheet; a soft navigation shows the copy in @sheet. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <SortSheetRoute presentation="standalone" />
    </Suspense>
  );
}
