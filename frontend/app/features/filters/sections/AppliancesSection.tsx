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
 * Section 15 «Техника» (SCR-014, BR-APP-020): one chip per appliance of the reference list, with its server name;
 * several may be on. The contract has one list for every deal (`ReferenceResource.appliances`); without it the
 * heading stands over an empty row.
 */
export function AppliancesSection({ filters, update }: SectionProps) {
  const t = useTranslations();
  const { reference } = useReference();
  const options = reference.appliances ?? [];
  return (
    <Section name="appliances" title={t("sheet.appliances")}>
      <ChipRow>
        {options.map((option) => (
          <FilterChip
            key={option.code}
            pressed={filters.appliances.includes(option.code)}
            onClick={() => update({ appliances: toggleCode(filters.appliances, option.code) })}
            className="px-[14px]"
          >
            {option.name}
          </FilterChip>
        ))}
      </ChipRow>
    </Section>
  );
}
