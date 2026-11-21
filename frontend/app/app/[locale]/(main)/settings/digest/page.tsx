import { Suspense } from "react";

import { SettingsSubPage } from "@/features/settings/SettingsSubPage";

/** Settings › Digest time (SCR-038), WP-31: the page over the settings screen, which the layout keeps mounted. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <SettingsSubPage name="digest" />
    </Suspense>
  );
}
