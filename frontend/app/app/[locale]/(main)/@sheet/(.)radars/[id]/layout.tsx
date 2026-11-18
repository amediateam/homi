import type { ReactNode } from "react";
import { Suspense } from "react";

import { RadarSheetServer } from "@/features/radars/server";

/** Radar sheet (SCR-028), intercepted into the sheet slot over the radar tab; it stays mounted under its editor. */
export default function Layout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <RadarSheetServer params={params} presentation="layer">
        {children}
      </RadarSheetServer>
    </Suspense>
  );
}
