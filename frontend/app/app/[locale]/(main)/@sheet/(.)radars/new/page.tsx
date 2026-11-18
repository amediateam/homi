import { Suspense } from "react";

import { RadarCreateSheet } from "@/features/radars/RadarCreateSheet";

/** New radar (SCR-030), intercepted into the sheet slot over the page it was opened from. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <RadarCreateSheet presentation="layer" />
    </Suspense>
  );
}
