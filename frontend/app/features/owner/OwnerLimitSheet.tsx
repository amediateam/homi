"use client";

import { Button } from "@homi/ui";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { RouteSheet, type RoutePresentation } from "@/features/shell/RouteSheet";
import { track } from "@/lib/analytics/events";
import { backBy } from "@/lib/navigation/history";
import { nav } from "@/lib/navigation/nav";
import { useBack } from "@/lib/navigation/useBack";
import { routes } from "@/lib/navigation/routes";
import { useReference } from "@/lib/reference/useReference";
import { tg } from "@/lib/telegram";

import { useOwnerPending } from "./pending";
import { useOwnerListings } from "./store";

/**
 * Opens «Мои объявления» from the limit sheet (WP-82, default (d)): back over the sheet, then a push of the list, so
 * Back from the list returns to Settings (`closeThen` would replace Settings); a direct load, with no step behind the
 * sheet, replaces it.
 */
export async function openListFromSheet(): Promise<void> {
  const taken = await backBy(1);
  if (taken === 0) {
    nav.replace(routes.ownerListings());
  } else {
    nav.push(routes.ownerListings());
  }
}

/**
 * `/owner/limit` (WP-82, SCR-049, BR-APP-089): a compact sheet «Сдаются {max} из {max} квартир» with legacy's text and
 * one button — «Мои объявления» with `where=settings`, «Понятно» with `where=mine` (any other value reads `mine`).
 * The button gives a light haptic; the backdrop, the drag and Back close it too. `owner_limit_sheet {where}` on every
 * mount. The limit is the list's `max`, else the reference data's.
 */
export function OwnerLimitSheet({ presentation }: { presentation: RoutePresentation }) {
  const t = useTranslations();
  const where = useSearchParams()?.get("where") === "settings" ? "settings" : "mine";
  const { ownerListingsLimit } = useReference();
  const { back } = useBack();
  const { hasListings } = useOwnerPending();
  const max = useOwnerListings({ enabled: hasListings }).data?.max ?? ownerListingsLimit;

  useEffect(() => track("owner_limit_sheet", { where }), [where]);

  return (
    <RouteSheet presentation={presentation} variant="compact" title={t("own.limitSheetTitle", { n: max, max })}>
      <div data-route="owner/limit" data-limit-where={where} className="flex flex-col gap-[16px] px-(--gutter) pt-[4px] pb-[8px]">
        <p className="text-[15px] leading-[1.45] text-text">{t("own.limitSheetText")}</p>
        {where === "settings" ? (
          <Button
            data-action="mine"
            onClick={() => {
              tg.haptic.impact("light");
              void openListFromSheet();
            }}
          >
            {t("own.mine")}
          </Button>
        ) : (
          <Button
            data-action="ok"
            onClick={() => {
              tg.haptic.impact("light");
              // `useBack()`: on a direct load, with nothing behind the sheet, it goes to the parent.
              back();
            }}
          >
            {t("owner.info.ok")}
          </Button>
        )}
      </div>
    </RouteSheet>
  );
}
