"use client";

import { Button, EmptyState } from "@homi/ui";
import { useTranslations } from "next-intl";

import { brand } from "@/lib/brand";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { useScreenSearchState } from "@/lib/search/useScreenSearchState";
import { tg } from "@/lib/telegram";

/**
 * The map on a device the engine rule gives Leaflet, or after a GL failure, until WP-28 adds that engine (DEC-45):
 * `map.unavailable` and the list label of the view toggle, which switches to the list with the map's search as the
 * toggle does (`nav.tab`).
 */
export function MapUnavailable() {
  const t = useTranslations();
  const { href } = useScreenSearchState("map");
  return (
    <div data-map-unavailable="" className="fixed inset-0 flex items-center justify-center bg-bg pt-(--top-inset)">
      <EmptyState
        image={brand.assets.emptyShrug}
        title={t("map.unavailable")}
        action={
          <Button
            variant="secondary"
            className="h-[48px] px-[16px] text-[15px]"
            onClick={() => {
              tg.haptic.impact();
              nav.tab(href(routes.feed));
            }}
          >
            {t("app.view.list")}
          </Button>
        }
      />
    </div>
  );
}
