import { Suspense } from "react";

import { ListingActionsRoute } from "@/features/listing/actions/ListingActionsRoute";

/** Listing actions and report (SCR-023): the actions sheet over the listing intercepted into the overlay slot. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ListingActionsRoute />
    </Suspense>
  );
}
