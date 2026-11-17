"use client";

import { toggleType, TYPES_BY_DEAL } from "@homi/search";
import { FilterChip } from "@homi/ui";
import { useTranslations } from "next-intl";

import { labelFor } from "@/i18n/labels";
import { ChipRow, Section } from "./Section";
import type { SectionProps } from "./types";

/**
 * Section 3 of the filters sheet (SCR-014, legacy `DealSections.jsx`): «Жильё», a chip per type the draft's deal
 * offers (BR-APP-005) — a stored radar with a type its deal lacks still shows the deal's types. A tap goes through
 * `toggleType`: the last selected type stays, and `below_median` survives only for exactly apartments. No haptic, as
 * legacy.
 */
export function TypeSection({ filters, update }: SectionProps) {
  const t = useTranslations();

  return (
    <Section name="housing" title={t("sheet.housing")}>
      <ChipRow>
        {TYPES_BY_DEAL[filters.deal].map((type) => (
          <FilterChip
            key={type}
            data-type={type}
            pressed={filters.types.includes(type)}
            onClick={() => update(toggleType(filters, type))}
            className="px-[14px]"
          >
            {t(labelFor("type", type))}
          </FilterChip>
        ))}
      </ChipRow>
    </Section>
  );
}
