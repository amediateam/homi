import { Suspense } from "react";

import { QuickFilterPage } from "@/features/filters/QuickFilterPage";

/** Quick filter rooms, price or owner (SCR-015), intercepted into the sheet slot over the feed. */
export default function Page({ params }: { params: Promise<{ kind: string }> }) {
  return (
    <Suspense fallback={null}>
      <QuickFilterPage params={params} presentation="layer" />
    </Suspense>
  );
}
