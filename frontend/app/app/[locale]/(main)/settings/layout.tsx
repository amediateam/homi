import type { ReactNode } from "react";
import { Suspense } from "react";

import { OwnerGroup } from "@/features/owner/settings/OwnerGroup";
import { SettingsFallback } from "@/features/settings/SettingsScreen";
import { SettingsServer } from "@/features/settings/server";

/**
 * Settings (SCR-032, WP-31): the screen is the layout of the segment, so it stays mounted and visible under its eight
 * sub-pages — the slide-in and the swipe back show it below, and its data is read once. The part that reads the cookie
 * sits under `<Suspense>`; until it streams in, a static spinner stands in (no reads of its own, which would keep the
 * server read from being adopted). The sub-page is `children`.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={<SettingsFallback />}>
        <SettingsServer ownerGroup={<OwnerGroup />} />
      </Suspense>
      {children}
    </>
  );
}
