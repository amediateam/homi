import type { ReactNode } from "react";
import { Suspense } from "react";

import { SettingsScreen } from "@/features/settings/SettingsScreen";
import { SettingsServer } from "@/features/settings/server";

/**
 * Settings (SCR-032, WP-31): the screen is the layout of the segment, so it stays mounted and visible under its eight
 * sub-pages — the slide-in and the swipe back show it below, and its data is read once. The part that reads the cookie
 * sits under `<Suspense>`; until it streams in, the screen shows its spinner. The sub-page is `children`.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={<SettingsScreen />}>
        <SettingsServer />
      </Suspense>
      {children}
    </>
  );
}
