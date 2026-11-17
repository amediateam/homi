import { Suspense } from "react";

import { CitySheetRoute } from "@/features/city/CitySheetRoute";

/** City picker (SCR-017), direct load: the standalone sheet; a soft navigation shows the copy in @sheet. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <CitySheetRoute presentation="standalone" />
    </Suspense>
  );
}
