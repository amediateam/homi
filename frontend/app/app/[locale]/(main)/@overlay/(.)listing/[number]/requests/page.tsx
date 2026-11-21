import { Suspense } from "react";

import { OwnerRequestsOverlay } from "@/features/owner/requests/OwnerRequestsOverlay";

/** «Отклики» over the user's own listing (SCR-058, WP-82), opened from its owner panel. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <OwnerRequestsOverlay />
    </Suspense>
  );
}
