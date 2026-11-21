import { Suspense } from "react";

import { OwnerLimitSheet } from "@/features/owner/OwnerLimitSheet";

/** The limit sheet (SCR-049, WP-82), direct load: the standalone sheet; a soft navigation shows the copy in @sheet. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <OwnerLimitSheet presentation="standalone" />
    </Suspense>
  );
}
