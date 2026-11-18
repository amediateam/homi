import type { ReactNode } from "react";
import { Suspense } from "react";

import { RadarTabFallback } from "@/features/radars/RadarScreen";
import { RadarSheetServer, RadarTabServer } from "@/features/radars/server";

/**
 * Radar sheet (SCR-028), direct load: the radar tab under the standalone sheet, as a tap on a tile shows it; the sheet
 * stays mounted under its editor (`children`).
 */
export default function Layout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  return (
    <>
      <Suspense fallback={<RadarTabFallback />}>
        <RadarTabServer />
      </Suspense>
      <Suspense fallback={null}>
        <RadarSheetServer params={params} presentation="standalone">
          {children}
        </RadarSheetServer>
      </Suspense>
    </>
  );
}
