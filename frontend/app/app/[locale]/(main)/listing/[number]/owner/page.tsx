import { Suspense } from "react";

import { OwnerInfoRoute } from "@/features/listing/owner/OwnerInfoSheet";

/** «Проверенный хозяин» (SCR-062, WP-83), a sheet over the listing. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <OwnerInfoRoute />
    </Suspense>
  );
}
