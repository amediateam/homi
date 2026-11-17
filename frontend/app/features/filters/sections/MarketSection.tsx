"use client";

import type { MessageKey } from "@homi/i18n";
import { SegmentedControl } from "@homi/ui";
import { useTranslations } from "next-intl";

import { Section } from "./Section";
import type { SectionProps } from "./types";

const MARKET_CHOICES = ["any", "new", "secondary"] as const;
type MarketChoice = (typeof MARKET_CHOICES)[number];

const LABELS: Readonly<Record<MarketChoice, MessageKey>> = {
  any: "sheet.any",
  new: "sheet.market.new",
  secondary: "sheet.market.secondary",
};

/**
 * Section 14, second half: «Дом» (SCR-014, BR-APP-020) — «Не важно» / «Новостройка» / «Вторичка», `market` `null` /
 * `new` / `secondary`.
 */
export function MarketSection({ filters, update }: SectionProps) {
  const t = useTranslations();
  return (
    <Section name="market" title={t("sheet.market._")}>
      <SegmentedControl
        aria-label={t("sheet.market._")}
        options={MARKET_CHOICES.map((choice) => ({ value: choice, label: t(LABELS[choice]) }))}
        value={filters.market ?? "any"}
        onValueChange={(choice) => update({ market: choice === "any" ? null : choice })}
      />
    </Section>
  );
}
