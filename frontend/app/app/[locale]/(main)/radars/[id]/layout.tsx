import type { ReactNode } from "react";
import { Suspense } from "react";

import { RadarPlaceholder } from "@/features/shell/RouteParamPlaceholder";

/** Radar sheet (SCR-028), kept mounted under its editor; WP-30 replaces the placeholder. Direct load. */
export default function Layout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <RadarPlaceholder params={params}>{children}</RadarPlaceholder>
    </Suspense>
  );
}
