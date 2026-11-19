import { Suspense } from "react";

import { RadarEditSheet } from "@/features/radars/RadarEditSheet";

/** Radar editor (SCR-029), intercepted into the sheet slot over the radar sheet, which its layout keeps mounted. */
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <RadarEditSheet params={params} presentation="layer" />
    </Suspense>
  );
}
