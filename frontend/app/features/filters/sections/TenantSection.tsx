"use client";

import type { MessageKey } from "@homi/i18n";
import { type Tenant, TENANT_OPTIONS } from "@homi/search";
import { FilterChip } from "@homi/ui";
import { useTranslations } from "next-intl";

import { ChipRow, Section } from "./Section";
import type { SectionProps } from "./types";

const TENANT_LABELS: Readonly<Record<Tenant, MessageKey>> = {
  family: "tenant.family",
  men: "tenant.men",
  women: "tenant.women",
};

/**
 * Section 9 «Кто будет жить» (SCR-014, BR-APP-019): one of «Семья», «Парни», «Девушки», or none; a tap on the chosen
 * chip clears it.
 */
export function TenantSection({ filters, update }: SectionProps) {
  const t = useTranslations();
  return (
    <Section name="tenant" title={t("sheet.tenant")}>
      <ChipRow>
        {TENANT_OPTIONS.map((tenant) => (
          <FilterChip
            key={tenant}
            pressed={filters.tenant === tenant}
            onClick={() => update({ tenant: filters.tenant === tenant ? null : tenant })}
            className="px-[14px]"
          >
            {t(TENANT_LABELS[tenant])}
          </FilterChip>
        ))}
      </ChipRow>
    </Section>
  );
}
