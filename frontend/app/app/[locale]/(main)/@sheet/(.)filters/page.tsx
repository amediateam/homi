import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { RoutePlaceholder } from "@/features/shell/RoutePlaceholder";
import { RouteSheet } from "@/features/shell/RouteSheet";

/** Full filters (SCR-014); WP-25 replaces the placeholder inside the sheet. Intercepted into the sheet slot. */
export default function Page() {
  const t = useTranslations();

  return (
    <Suspense fallback={null}>
      <RouteSheet variant="full" title={t("sheet.title")} closeLabel={t("common.close")}>
        <RoutePlaceholder name="filters" layer="sheet" framed />
      </RouteSheet>
    </Suspense>
  );
}
