import { Suspense } from "react";

import { ContactRequestRoute } from "@/features/listing/contact/ContactRequestRoute";

/** «Отклик хозяину» (SCR-061, WP-83), a sheet over the listing. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ContactRequestRoute />
    </Suspense>
  );
}
