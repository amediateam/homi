"use client";

import type { MessageKey } from "@homi/i18n";
import { SegmentedControl } from "@homi/ui";
import { useTranslations } from "next-intl";

import { Section } from "./Section";
import type { SectionProps } from "./types";

const FURNITURE_CHOICES = ["any", "furnished", "unfurnished"] as const;
type FurnitureChoice = (typeof FURNITURE_CHOICES)[number];

/** The three states of `furnished`: no filter, with furniture, without. */
const VALUES: Readonly<Record<FurnitureChoice, boolean | null>> = { any: null, furnished: true, unfurnished: false };

const LABELS: Readonly<Record<FurnitureChoice, MessageKey>> = {
  any: "sheet.any",
  furnished: "sheet.furnished",
  unfurnished: "sheet.unfurnished",
};

/** Section 11 «Мебель» (SCR-014): «Не важно» / «С мебелью» / «Без мебели» as `furnished` `null` / `true` / `false`. */
export function FurnitureSection({ filters, update }: SectionProps) {
  const t = useTranslations();
  const value: FurnitureChoice = filters.furnished === null ? "any" : filters.furnished ? "furnished" : "unfurnished";
  return (
    <Section name="furniture" title={t("sheet.furniture")}>
      <SegmentedControl
        aria-label={t("sheet.furniture")}
        options={FURNITURE_CHOICES.map((choice) => ({ value: choice, label: t(LABELS[choice]) }))}
        value={value}
        onValueChange={(choice) => update({ furnished: VALUES[choice] })}
      />
    </Section>
  );
}
