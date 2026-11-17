"use client";

import { FilterChip } from "@homi/ui";
import { useTranslations } from "next-intl";

import { useReference } from "@/lib/reference/useReference";

import { ChipRow, Section } from "./Section";
import type { SectionProps } from "./types";

/** A code in or out of a multi-select list, appended at the end. */
function toggleCode(list: readonly string[], code: string): string[] {
  return list.includes(code) ? list.filter((item) => item !== code) : [...list, code];
}

/**
 * Section 12 «Ремонт» (SCR-014): one chip per renovation of the reference list of the draft's deal, with its server
 * name; several may be on. A deal without a list (renovations for daily rent) shows the heading over an empty row.
 */
export function RenovationSection({ filters, update }: SectionProps) {
  const t = useTranslations();
  const { reference } = useReference();
  const options = reference.renovations?.[filters.deal] ?? [];
  return (
    <Section name="renovation" title={t("sheet.renovation")}>
      <ChipRow>
        {options.map((option) => (
          <FilterChip
            key={option.code}
            pressed={filters.renovation.includes(option.code)}
            onClick={() => update({ renovation: toggleCode(filters.renovation, option.code) })}
            className="px-[14px]"
          >
            {option.name}
          </FilterChip>
        ))}
      </ChipRow>
    </Section>
  );
}
