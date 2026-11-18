import { Suspense } from "react";

import { FoundSheet } from "@/features/radars/FoundSheet";

/** «Нашли жильё?» survey (SCR-031), intercepted into the sheet slot over the radar tab. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <FoundSheet presentation="layer" />
    </Suspense>
  );
}
