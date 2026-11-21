"use client";

import { FilterChip } from "@homi/ui";
import { useTranslations } from "next-intl";

import type { OwnerForm, Tenant } from "../normalize";
import { Chips, Field } from "./Field";

const TENANTS: readonly Tenant[] = ["family", "students", "girls", "boys", "foreigners"];

/** «Кому сдаёте» (several, none means everyone) and the pets in three states. */
export function TenantsSection({ form, edit }: { form: OwnerForm; edit: (change: Partial<OwnerForm>) => void }) {
  const t = useTranslations();
  const toggle = (tenant: Tenant) =>
    edit({ tenants: form.tenants.includes(tenant) ? form.tenants.filter((item) => item !== tenant) : TENANTS.filter((item) => item === tenant || form.tenants.includes(item)) });
  return (
    <>
      <Field label={t("own.tenants")} focus="tenants" hint={t("own.tenantsHint")}>
        <Chips>
          {TENANTS.map((tenant) => (
            <FilterChip key={tenant} data-tenant={tenant} pressed={form.tenants.includes(tenant)} onClick={() => toggle(tenant)}>
              {t(`own.tenant.${tenant}`)}
            </FilterChip>
          ))}
        </Chips>
      </Field>
      <Field focus="pets">
        <Chips>
          <FilterChip data-pets="yes" pressed={form.pets === true} onClick={() => edit({ pets: form.pets === true ? null : true })}>
            {t("own.petsOk")}
          </FilterChip>
          <FilterChip data-pets="no" pressed={form.pets === false} onClick={() => edit({ pets: form.pets === false ? null : false })}>
            {t("own.petsNo")}
          </FilterChip>
        </Chips>
      </Field>
    </>
  );
}
