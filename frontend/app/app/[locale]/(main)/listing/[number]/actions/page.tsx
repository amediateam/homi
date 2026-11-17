import { Suspense } from "react";

import { ListingActionsRoute } from "@/features/listing/actions/ListingActionsRoute";

/** Listing actions and report (SCR-023), direct load: the actions sheet over the standalone listing. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ListingActionsRoute />
    </Suspense>
  );
}
