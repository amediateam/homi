import { Suspense } from "react";

import { QuickFilterPage } from "@/features/filters/QuickFilterPage";

/** Quick filter rooms, price or owner (SCR-015), direct load: the standalone sheet; a soft navigation shows the copy in @sheet. */
export default function Page({ params }: { params: Promise<{ kind: string }> }) {
  return (
    <Suspense fallback={null}>
      <QuickFilterPage params={params} presentation="standalone" />
    </Suspense>
  );
}
