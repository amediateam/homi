"use client";

import type { MessageKey } from "@homi/i18n";
import { type PostedDays, POSTED_DAYS_OPTIONS } from "@homi/search";
import { FilterChip } from "@homi/ui";
import { useTranslations } from "next-intl";

import { ChipRow, Section, SectionHint } from "./Section";
import type { SectionProps } from "./types";

const POSTED_LABELS: Readonly<Record<PostedDays, MessageKey>> = {
  1: "sheet.posted.1",
  3: "sheet.posted.3",
  7: "sheet.posted.7",
};

/**
 * Section 16 «Опубликовано» (SCR-014, BR-APP-021; search mode only): «За сутки», «За 3 дня», «За неделю» or none; a
 * tap on the chosen chip clears it. While a value is set, the hint says it filters only the feed — a radar sends new
 * listings anyway.
 */
export function PostedSection({ filters, update }: SectionProps) {
  const t = useTranslations();
  return (
    <Section name="posted" title={t("sheet.posted._")}>
      <ChipRow>
        {POSTED_DAYS_OPTIONS.map((days) => (
          <FilterChip
            key={days}
            pressed={filters.posted_days === days}
            onClick={() => update({ posted_days: filters.posted_days === days ? null : days })}
            className="px-[14px]"
          >
            {t(POSTED_LABELS[days])}
          </FilterChip>
        ))}
      </ChipRow>
      {filters.posted_days !== null ? <SectionHint>{t("sheet.postedHint")}</SectionHint> : null}
    </Section>
  );
}
