"use client";

import { ChevronRight } from "@homi/ui";
import { useTranslations } from "next-intl";

import { useReference } from "@/lib/reference/useReference";
import { tg } from "@/lib/telegram";

import { Section } from "./Section";
import type { SectionProps } from "./types";

export interface CitySectionProps extends SectionProps {
  /** Opens the nested city picker over the sheet (`pick=city`); its pick changes the draft only (BR-APP-009). */
  onOpenCity: () => void;
}

/**
 * Section 2 of the filters sheet (SCR-014, legacy `LocationSections.jsx`): the field «Город» with the draft's city and
 * a chevron. A tap plays a light impact and asks `onOpenCity`. With at most one city in the reference data there is
 * nothing to choose and the section renders nothing (edge case "only one city"). The field carries its own label, so
 * the section's heading is read, not shown. The city name is the server's and renders as text (SEC-REQ-021).
 */
export function CitySection({ city, onOpenCity }: CitySectionProps) {
  const t = useTranslations();
  const { cities } = useReference();
  if (cities.length <= 1) {
    return null;
  }

  return (
    <Section name="city" title={t("sheet.city")} className="[&>h2]:sr-only">
      <button
        type="button"
        data-field="city"
        aria-haspopup="dialog"
        onClick={() => {
          tg.haptic.impact("light");
          onOpenCity();
        }}
        className="flex h-[48px] w-full items-center gap-[10px] rounded-medium bg-fill px-[14px] text-left text-[16px] text-text outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-70"
      >
        <span className="flex-none">{t("sheet.city")}</span>{" "}
        <span className="min-w-0 flex-1 truncate text-right text-hint">{city?.name ?? ""}</span>
        <ChevronRight size={18} aria-hidden className="flex-none text-hint" />
      </button>
    </Section>
  );
}
