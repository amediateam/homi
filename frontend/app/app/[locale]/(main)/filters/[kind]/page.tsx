import { Suspense } from "react";

import { QuickFilterPlaceholder } from "@/features/shell/RouteParamPlaceholder";

/** Quick filter rooms, price or owner (SCR-015); WP-25 replaces the placeholder. Direct load. */
export default function Page({ params }: { params: Promise<{ kind: string }> }) {
  return (
    <Suspense fallback={null}>
      <QuickFilterPlaceholder params={params} />
    </Suspense>
  );
}
