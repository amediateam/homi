import { Suspense } from "react";

import { RadarCreateSheet } from "@/features/radars/RadarCreateSheet";
import { RadarTabFallback } from "@/features/radars/RadarScreen";
import { RadarTabServer } from "@/features/radars/server";

/**
 * New radar (SCR-030), direct load: the radar tab under the standalone sheet, so a reload shows what a tap on «+»
 * showed; a soft navigation shows the copy in @sheet over the page it was opened from.
 */
export default function Page() {
  return (
    <>
      <Suspense fallback={<RadarTabFallback />}>
        <RadarTabServer />
      </Suspense>
      <Suspense fallback={null}>
        <RadarCreateSheet presentation="standalone" />
      </Suspense>
    </>
  );
}
