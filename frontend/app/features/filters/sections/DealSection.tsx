"use client";

import { baseDeal, type BaseDeal, switchDeal } from "@homi/search";
import { SegmentedControl } from "@homi/ui";
import { useTranslations } from "next-intl";

import { Section } from "./Section";
import type { SectionProps } from "./types";

/**
 * Section 1 of the filters sheet (SCR-014, legacy `DealSections.jsx`): «Аренда» / «Продажа»; daily rent shows
 * «Аренда». A switch goes through `switchDeal` (BR-APP-002): the new deal's defaults, the geography kept; the active
 * option does nothing; no haptic, as legacy. Legacy shows no heading here and the catalogue has none, so the
 * group is named by its two options and the heading is read, not shown.
 */
export function DealSection({ filters, update }: SectionProps) {
  const t = useTranslations();
  const rent = t("deal.rent_long");
  const sale = t("deal.sale");

  return (
    <Section name="deal" title={`${rent} / ${sale}`} className="[&>h2]:sr-only">
      <SegmentedControl<BaseDeal>
        options={[
          { value: "rent_long", label: rent },
          { value: "sale", label: sale },
        ]}
        value={baseDeal(filters.deal)}
        onValueChange={(deal) => update(switchDeal(filters, deal))}
      />
    </Section>
  );
}
