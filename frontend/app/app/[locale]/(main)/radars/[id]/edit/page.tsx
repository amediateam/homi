import { Suspense } from "react";

import { RadarEditSheet } from "@/features/radars/RadarEditSheet";

/**
 * Radar editor (SCR-029), direct load: the standalone sheet over the radar sheet and the tab of its layout; a soft
 * navigation shows the copy in @sheet.
 */
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <RadarEditSheet params={params} presentation="standalone" />
    </Suspense>
  );
}
