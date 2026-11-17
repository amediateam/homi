"use client";

import { FilterChip } from "@homi/ui";
import { useTranslations } from "next-intl";

import { ChipRow, Section } from "./Section";
import type { SectionProps } from "./types";

/** Section 13 «Этаж» (SCR-014): «Не первый» and «Не последний», two independent toggles. */
export function FloorSection({ filters, update }: SectionProps) {
  const t = useTranslations();
  return (
    <Section name="floor" title={t("sheet.floor")}>
      <ChipRow>
        <FilterChip
          pressed={filters.floor_not_first}
          onClick={() => update({ floor_not_first: !filters.floor_not_first })}
          className="px-[14px]"
        >
          {t("sheet.notFirst")}
        </FilterChip>
        <FilterChip
          pressed={filters.floor_not_last}
          onClick={() => update({ floor_not_last: !filters.floor_not_last })}
          className="px-[14px]"
        >
          {t("sheet.notLast")}
        </FilterChip>
      </ChipRow>
    </Section>
  );
}
