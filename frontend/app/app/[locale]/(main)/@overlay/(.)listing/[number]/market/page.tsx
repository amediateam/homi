import { Suspense } from "react";

import { MarketSheetRoute } from "@/features/listing/market/MarketSheetRoute";

/** Market explanation «Откуда эта цифра» (SCR-022), a sheet over the listing. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <MarketSheetRoute />
    </Suspense>
  );
}
