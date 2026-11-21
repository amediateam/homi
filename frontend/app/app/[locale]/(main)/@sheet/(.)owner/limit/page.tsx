import { Suspense } from "react";

import { OwnerLimitSheet } from "@/features/owner/OwnerLimitSheet";

/** The limit sheet (SCR-049, WP-82), intercepted into the sheet slot over Settings or «Мои объявления». */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <OwnerLimitSheet presentation="layer" />
    </Suspense>
  );
}
