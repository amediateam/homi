import { Suspense } from "react";

import { FoundSheet } from "@/features/radars/FoundSheet";
import { RadarTabFallback } from "@/features/radars/RadarScreen";
import { RadarTabServer } from "@/features/radars/server";

/**
 * «Нашли жильё?» survey (SCR-031), direct load: the radar tab under the standalone sheet; a soft navigation shows the
 * copy in @sheet.
 */
export default function Page() {
  return (
    <>
      <Suspense fallback={<RadarTabFallback />}>
        <RadarTabServer />
      </Suspense>
      <Suspense fallback={null}>
        <FoundSheet presentation="standalone" />
      </Suspense>
    </>
  );
}
