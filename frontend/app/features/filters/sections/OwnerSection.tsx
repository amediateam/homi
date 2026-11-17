"use client";

import type { MessageKey } from "@homi/i18n";
import { type Owner, OWNER_OPTIONS } from "@homi/search";
import { SegmentedControl } from "@homi/ui";
import { useTranslations } from "next-intl";

import { Section } from "./Section";
import type { SectionProps } from "./types";

const OWNER_LABELS: Readonly<Record<Owner, MessageKey>> = {
  any: "owner.any",
  no_agents: "owner.no_agents",
  owners: "owner.owners",
};

/**
 * «Все» / «Без риелторов» / «Только хозяева» (SCR-014 row 8, SCR-015): the control alone, for the owner quick sheet,
 * whose header already says «Кто размещает».
 */
export function OwnerControl({ value, onChange }: { value: Owner; onChange: (owner: Owner) => void }) {
  const t = useTranslations();
  return (
    <SegmentedControl
      aria-label={t("sheet.who")}
      options={OWNER_OPTIONS.map((owner) => ({ value: owner, label: t(OWNER_LABELS[owner]) }))}
      value={value}
      onValueChange={onChange}
    />
  );
}

/** Section 8 «Кто размещает» (SCR-014): sets `owner`. */
export function OwnerSection({ filters, update }: SectionProps) {
  const t = useTranslations();
  return (
    <Section name="owner" title={t("sheet.who")}>
      <OwnerControl value={filters.owner} onChange={(owner) => update({ owner })} />
    </Section>
  );
}
