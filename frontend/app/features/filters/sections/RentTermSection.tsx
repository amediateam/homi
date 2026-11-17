"use client";

import { switchRentTerm } from "@homi/search";
import { SegmentedControl } from "@homi/ui";
import { useTranslations } from "next-intl";

import { Section } from "./Section";
import type { SectionProps } from "./types";

type RentTerm = "rent_long" | "rent_daily";

/**
 * Section 4 of the filters sheet (SCR-014, legacy `DealSections.jsx`): «Срок аренды», «Надолго» / «Посуточно». The
 * form shows it by `sections.rentTerm` (BR-APP-004). A switch goes through `switchRentTerm` (BR-APP-003): the
 * types the term allows, the price and `below_median` cleared, and for daily rent the tenant and pets too. No
 * haptic, as legacy.
 */
export function RentTermSection({ filters, update }: SectionProps) {
  const t = useTranslations();
  const term: RentTerm = filters.deal === "rent_daily" ? "rent_daily" : "rent_long";

  return (
    <Section name="rentTerm" title={t("sheet.rentTerm")}>
      <SegmentedControl<RentTerm>
        options={[
          { value: "rent_long", label: t("rent.long") },
          { value: "rent_daily", label: t("deal.rent_daily") },
        ]}
        value={term}
        onValueChange={(next) => update(switchRentTerm(filters, next))}
      />
    </Section>
  );
}
