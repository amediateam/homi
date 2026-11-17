"use client";

import type { MessageKey } from "@homi/i18n";
import { applyPreset, baseDeal, type Deal, isPresetSelected, presetSource, type SearchFilters } from "@homi/search";
import { cn, FilterChip, PriceInput } from "@homi/ui";
import { useTranslations } from "next-intl";

import { useMoney } from "@/lib/money/useMoney";
import { useReference } from "@/lib/reference/useReference";
import { ChipRow, Section, SectionHint } from "./Section";
import type { SectionProps } from "./types";

const PRICE_TITLES: Readonly<Record<Deal, MessageKey>> = {
  rent_long: "sheet.priceMonth",
  rent_daily: "sheet.priceDay",
  sale: "sheet.price",
};

const TYPICAL_LINES: Readonly<Record<Deal, MessageKey>> = {
  rent_long: "sheet.typicalRent",
  rent_daily: "sheet.typicalDaily",
  sale: "sheet.typicalSale",
};

/**
 * «Цена в месяц, $» / «Цена за сутки, $» / «Цена, $», with «млн сум» for a display in сум (SCR-014 row 6, SCR-015):
 * the heading of the price section and the title of the price quick sheet.
 */
export function usePriceTitle(filters: Pick<SearchFilters, "deal">): string {
  const t = useTranslations();
  const money = useMoney();
  return t(PRICE_TITLES[filters.deal], { cur: money.unitLabel() });
}

export interface PriceSectionProps extends SectionProps {
  /**
   * The heading is read but not shown: the body of the price quick sheet, whose header already carries
   * `usePriceTitle`. Default `false`.
   */
  titleHidden?: boolean;
}

/**
 * Section 6 of the filters sheet and the body of the price quick sheet (SCR-014, SCR-015, legacy `PriceSection.jsx`,
 * `03` §3.5). Prices are whole USD in the draft and typed in the display currency of `useMoney()`: dollars, or
 * millions of сум with one decimal; `PriceInput` keeps the typed text and `parseInput` reads `1.000.000` and `1,2`
 * (fix of LB-APP-011). Text that does not parse is no bound.
 *
 * Under the inputs, in legacy order:
 * - «до N» presets (BR-APP-014, BR-APP-015): the city's list of `GET /cities` wins over the reference list
 *   (`presetSource`), `useMoney().presets` converts and rounds it for сум; a chip is on only as the maximum without a
 *   minimum, and a tap goes through `applyPreset`. The strip scrolls sideways (`data-scroll-x`, which the sheet's
 *   page lock leaves alone; a drag starts only on the sheet's header);
 * - the unit hint for land and houses on sale (`sections.unitPriceHint`, BR-APP-018);
 * - «{city}: половина квартир — до {price}…» (`sections.typicalPrice`, BR-APP-016), absent while the city's
 *   statistics load or failed;
 * - «📊 Не дороже рынка» (`sections.belowMedian`, BR-APP-017) toggling `below_median`, with its long hint while on.
 *
 * No haptic, as legacy. City names render as text (SEC-REQ-021).
 */
export function PriceSection({ filters, update, city, stats, sections, titleHidden = false }: PriceSectionProps) {
  const t = useTranslations();
  const money = useMoney();
  const { reference } = useReference();
  const title = usePriceTitle(filters);

  const source = presetSource(filters.deal, stats, reference.price_presets);
  const presets = money.presets(filters.deal, source.fromCity ? { city: source.values } : { reference: source.values });
  const inputMode = money.isUzs ? "decimal" : "numeric";
  const typical = sections.typicalPrice;

  return (
    <Section name="price" title={title} className={cn(titleHidden && "[&>h2]:sr-only")}>
      <div className="grid grid-cols-2 gap-[10px]">
        <label className="flex min-w-0 items-center gap-[8px]">
          <span className="text-[15px] text-hint">{t("sheet.from")}</span>
          <PriceInput
            name="price_min"
            placeholder="0"
            inputMode={inputMode}
            value={filters.price_min}
            toText={money.toInput}
            parse={money.parseInput}
            onValueChange={(price_min) => update({ price_min })}
          />
        </label>
        <label className="flex min-w-0 items-center gap-[8px]">
          <span className="text-[15px] text-hint">{t("sheet.to")}</span>
          <PriceInput
            name="price_max"
            placeholder={t("sheet.anyPrice")}
            inputMode={inputMode}
            value={filters.price_max}
            toText={money.toInput}
            parse={money.parseInput}
            onValueChange={(price_max) => update({ price_max })}
          />
        </label>
      </div>
      {presets.length > 0 ? (
        <div
          data-slot="price-presets"
          data-scroll-x=""
          className="-mx-(--gutter) flex gap-[8px] overflow-x-auto overscroll-x-contain px-(--gutter) [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {presets.map((preset) => (
            <FilterChip
              key={preset.usd}
              data-preset={preset.usd}
              pressed={isPresetSelected(filters, preset.usd)}
              onClick={() => update(applyPreset(filters, preset.usd))}
              className="px-[14px]"
            >
              {t("sheet.upto", { amount: preset.label })}
            </FilterChip>
          ))}
        </div>
      ) : null}
      {sections.unitPriceHint ? <SectionHint>{t("sheet.unitPriceHint")}</SectionHint> : null}
      {typical !== null ? (
        <p data-slot="typical-price" className="text-[14px] text-text">
          {t(TYPICAL_LINES[filters.deal], { city: city?.name ?? "", price: money.format(typical) })}
        </p>
      ) : null}
      {sections.belowMedian ? (
        <>
          <ChipRow>
            <FilterChip
              data-chip="below-median"
              pressed={filters.below_median}
              onClick={() => update({ below_median: !filters.below_median })}
              className="px-[14px]"
            >
              {t("sheet.belowMedian")}
            </FilterChip>
          </ChipRow>
          {filters.below_median ? (
            <SectionHint>
              {t(baseDeal(filters.deal) === "sale" ? "sheet.belowMedianHintSale" : "sheet.belowMedianHintRent")}
            </SectionHint>
          ) : null}
        </>
      ) : null}
    </Section>
  );
}
