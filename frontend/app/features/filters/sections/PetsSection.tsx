"use client";

import type { MessageKey } from "@homi/i18n";
import type { SearchFilters } from "@homi/search";
import { SegmentedControl } from "@homi/ui";
import { useTranslations } from "next-intl";

import { useReference } from "@/lib/reference/useReference";
import { dismissToast, showToast } from "@/lib/ui/toast";

import { markFeatureSeen, useNewFeature } from "../newFeatures";
import { Section } from "./Section";
import type { SectionProps } from "./types";

const PETS_CHOICES = ["any", "pets", "only"] as const;
type PetsChoice = (typeof PETS_CHOICES)[number];

/** «Не важно», «Не запрещены», «Разрешены» as filters: `pets_only` is the stricter one and never comes with `pets`. */
const CHOICES: Readonly<Record<PetsChoice, Pick<SearchFilters, "pets" | "pets_only">>> = {
  any: { pets: false, pets_only: false },
  pets: { pets: true, pets_only: false },
  only: { pets: false, pets_only: true },
};

const LABELS: Readonly<Record<PetsChoice, MessageKey>> = {
  any: "sheet.any",
  pets: "sheet.pets",
  only: "sheet.petsOnly",
};

/** What a non-neutral choice explains in the sheet's toast (SCR-042). */
const TIPS: Readonly<Partial<Record<PetsChoice, MessageKey>>> = {
  pets: "sheet.petsTip",
  only: "sheet.petsOnlyTip",
};

function choiceOf(filters: Pick<SearchFilters, "pets" | "pets_only">): PetsChoice {
  return filters.pets_only ? "only" : filters.pets ? "pets" : "any";
}

/**
 * Section 10 «Животные» (SCR-014, `PreferenceSections.jsx:62-94`, BR-APP-057). Marked `focus="pets"`, the section the
 * `news=pets` launch scrolls to. The «Новое» pill shows while the server announces `pets` in `features` and the user
 * has not tried the control (`homi-new-pets`); any tap on the control marks it. A change to «Не запрещены» or
 * «Разрешены» explains itself in the sheet's toast, replacing the previous tip; «Не важно» takes the tip away.
 */
export function PetsSection({ filters, update }: SectionProps) {
  const t = useTranslations();
  const { reference } = useReference();
  const unseen = useNewFeature("pets");
  const announced = Array.isArray(reference.features) && reference.features.includes("pets");

  const choose = (choice: PetsChoice) => {
    markFeatureSeen("pets");
    update(CHOICES[choice]);
    const tip = TIPS[choice];
    if (tip === undefined) {
      dismissToast("sheet");
    } else {
      showToast({ key: tip }, "sheet");
    }
  };

  return (
    <Section
      name="pets"
      focus="pets"
      title={t("sheet.petsTitle")}
      pill={
        announced && unseen ? (
          <span
            data-slot="new-pill"
            className="rounded-pill bg-accent px-[7px] text-[11px] leading-[18px] font-bold text-accent-text"
          >
            {t("sheet.new")}
          </span>
        ) : null
      }
    >
      <SegmentedControl
        aria-label={t("sheet.petsTitle")}
        options={PETS_CHOICES.map((choice) => ({ value: choice, label: t(LABELS[choice]) }))}
        value={choiceOf(filters)}
        onValueChange={choose}
        onClick={() => markFeatureSeen("pets")}
      />
    </Section>
  );
}
