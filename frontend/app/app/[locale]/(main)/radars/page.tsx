import { Suspense } from "react";

import { RadarTabFallback } from "@/features/radars/RadarScreen";
import { RadarTabServer } from "@/features/radars/server";

/**
 * Radar tab (SCR-026, SCR-027, WP-30): a static shell, and under `<Suspense>` the part that reads the cached reference
 * data and the cookie (DEC-44, DEC-51). Nothing per-user is cached.
 */
export default function RadarsPage() {
  return (
    <Suspense fallback={<RadarTabFallback />}>
      <RadarTabServer />
    </Suspense>
  );
}
