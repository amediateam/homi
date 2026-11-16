import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { RoutePlaceholder } from "@/features/shell/RoutePlaceholder";
import { SubPage } from "@/features/shell/SubPage";

/** Settings › Theme (SCR-033); WP-31 replaces the placeholder inside the sub-page. */
export default function Page() {
  const t = useTranslations();

  return (
    <Suspense fallback={null}>
      <SubPage title={t("settings.theme._")} bare>
        <RoutePlaceholder name="settings/theme" />
      </SubPage>
    </Suspense>
  );
}
