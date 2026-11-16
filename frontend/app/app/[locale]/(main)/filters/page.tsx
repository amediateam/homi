import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { RoutePlaceholder } from "@/features/shell/RoutePlaceholder";
import { RouteSheet } from "@/features/shell/RouteSheet";

/**
 * Full filters (SCR-014); WP-25 replaces the placeholder inside the sheet. Direct load, shown as the standalone sheet;
 * a soft navigation shows the copy in @sheet.
 */
export default function Page() {
  const t = useTranslations();

  return (
    <Suspense fallback={null}>
      <RouteSheet presentation="standalone" variant="full" title={t("sheet.title")} closeLabel={t("common.close")}>
        <RoutePlaceholder name="filters" />
      </RouteSheet>
    </Suspense>
  );
}
