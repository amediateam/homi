"use client";

import { FILTER_LIMITS } from "@homi/search";
import { IntInput } from "@homi/ui";
import { useTranslations } from "next-intl";

import { Section } from "./Section";
import type { SectionProps } from "./types";

/**
 * Section 14, first half: «Площадь, м²» (SCR-014, BR-APP-020, `03` §3.4), the bounds «от» and «до» as whole square
 * metres. `IntInput` drops non-digits, reads 0 as no bound and caps a value at the server's 10 000. An inverted range
 * is kept as typed; `fixRanges` decides on apply (LB-APP-043).
 */
export function AreaSection({ filters, update }: SectionProps) {
  const t = useTranslations();
  const max = FILTER_LIMITS.area[1];
  return (
    <Section name="area" title={t("sheet.area")}>
      <div className="grid grid-cols-2 gap-[10px]">
        <label className="flex min-w-0 items-center gap-[8px]">
          <span className="text-[15px] text-hint">{t("sheet.from")}</span>
          <IntInput
            name="area_min"
            placeholder="0"
            max={max}
            value={filters.area_min}
            onValueChange={(area_min) => update({ area_min })}
          />
        </label>
        <label className="flex min-w-0 items-center gap-[8px]">
          <span className="text-[15px] text-hint">{t("sheet.to")}</span>
          <IntInput
            name="area_max"
            placeholder={t("sheet.anyArea")}
            max={max}
            value={filters.area_max}
            onValueChange={(area_max) => update({ area_max })}
          />
        </label>
      </div>
    </Section>
  );
}
