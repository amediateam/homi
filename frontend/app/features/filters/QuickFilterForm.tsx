"use client";

import { resetQuick, type SearchFilters, type SearchRules, sectionsFor } from "@homi/search";
import { Button } from "@homi/ui";
import { useTranslations } from "next-intl";

import { type RoutePresentation, RouteSheet } from "@/features/shell/RouteSheet";
import type { QuickFilterKind } from "@/lib/navigation/routes";
import { rollText } from "@/lib/ui/rollText";
import { useCityStats, useReference } from "@/lib/reference/useReference";

import { RoomsPicker } from "./RoomsPicker";
import { OwnerControl } from "./sections/OwnerSection";
import { PriceSection, usePriceTitle } from "./sections/PriceSection";
import { SectionHint } from "./sections/Section";
import { useDraft } from "./useDraft";
import { useLiveStats } from "./useLiveStats";

export interface QuickFilterFormProps {
  kind: QuickFilterKind;
  /** The filters of the address; seeds the draft once (the route keys the form on `bfcacheId`). */
  initial: SearchFilters;
  presentation: RoutePresentation;
  /** `searchRules(devFlags)`, from the route. */
  rules: SearchRules;
  /** «Показать …»: the draft to apply; a count still on its way does not hold it back. */
  onApply: (draft: SearchFilters) => void;
}

/**
 * The quick filter sheet of a feed header chip (SCR-015, WP-25): a compact `RouteSheet` that edits one filter of a
 * local draft (`useDraft`) and applies it through `onApply`.
 *
 * - `rooms`: «Комнаты»; `RoomsPicker` and «— два числа задают диапазон»; «Сбросить» clears the rooms range.
 * - `price`: the price title of section 6 (`usePriceTitle`: «Цена за сутки, $» for daily rent); the whole
 *   `PriceSection`, its heading read, not shown; «Сбросить» clears both bounds and `below_median`.
 * - `owner`: «Кто размещает»; `OwnerControl`; «Сбросить» sets `owner` to `any`.
 *
 * «Сбросить» goes through `resetQuick` (BR-APP-022). The primary button reads «Показать» until the first count,
 * «Показать {n}», or «Ничего нет», which still applies; a failed count keeps the label. Only the count is asked for
 * (`useLiveStats` without the flow, 250 ms after the last change). `PriceSection` gets the sections of the draft from
 * `sectionsFor` here, with the city's statistics of `GET /cities`, so «Не дороже рынка», the unit hint and the typical
 * line follow the same rules as in the full sheet. No control here plays a haptic; the route plays the apply's.
 * `data-route="filters/<kind>"` (with `data-layer="sheet"` for the copy in `@sheet`) is what the end-to-end specs
 * select.
 */
export function QuickFilterForm({ kind, initial, presentation, rules, onApply }: QuickFilterFormProps) {
  const t = useTranslations();
  const { draft, update, replace } = useDraft(initial);
  const { count } = useLiveStats(draft, { rules });
  const { findCity } = useReference();
  const city = findCity(draft.city);
  const stats = useCityStats(draft.city);
  const priceTitle = usePriceTitle(draft);

  const title = kind === "rooms" ? t("sheet.rooms") : kind === "price" ? priceTitle : t("sheet.who");
  const label = count === null ? t("sheet.show") : count > 0 ? rollText((n) => t("sheet.showN", { n }), count) : t("sheet.nothing");

  const footer = (
    <div className="flex gap-[10px]">
      <Button
        variant="secondary"
        data-action="reset"
        onClick={() => replace(resetQuick(draft, kind))}
        className="h-[48px] px-[20px] text-[16px]"
      >
        {t("sheet.reset")}
      </Button>
      <Button data-action="apply" onClick={() => onApply(draft)} className="h-[48px] min-w-0 flex-1 px-[20px] text-[16px]">
        {label}
      </Button>
    </div>
  );

  return (
    <RouteSheet presentation={presentation} variant="compact" title={title} closeLabel={t("common.close")} footer={footer}>
      <div data-route={`filters/${kind}`} data-layer={presentation === "layer" ? "sheet" : undefined}>
        {kind === "rooms" ? (
          <div className="flex flex-col gap-2.5 px-(--gutter) py-3">
            <RoomsPicker filters={draft} update={update} />
            <SectionHint>{t("sheet.roomsHint")}</SectionHint>
          </div>
        ) : kind === "price" ? (
          <PriceSection
            filters={draft}
            update={update}
            city={city}
            stats={stats}
            mode="search"
            rules={rules}
            sections={sectionsFor(draft, city, "search", rules, stats)}
            titleHidden
          />
        ) : (
          <div className="px-(--gutter) py-3">
            <OwnerControl value={draft.owner} onChange={(owner) => update({ owner })} />
          </div>
        )}
      </div>
    </RouteSheet>
  );
}
