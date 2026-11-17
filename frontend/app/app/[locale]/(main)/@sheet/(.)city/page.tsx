import { Suspense } from "react";

import { CitySheetRoute } from "@/features/city/CitySheetRoute";

/** City picker (SCR-017), intercepted into the sheet slot over the feed. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <CitySheetRoute presentation="layer" />
    </Suspense>
  );
}
