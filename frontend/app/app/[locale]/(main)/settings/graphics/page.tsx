import { Suspense } from "react";

import { SettingsSubPage } from "@/features/settings/SettingsSubPage";

/** Settings › Graphics (SCR-034), WP-31: the page over the settings screen, which the layout keeps mounted. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <SettingsSubPage name="graphics" />
    </Suspense>
  );
}
