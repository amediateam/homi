"use client";

import { FilterChip } from "@homi/ui";
import { useTranslations } from "next-intl";

import { useReference } from "@/lib/reference/useReference";

import type { OwnerForm } from "../normalize";
import { Chips, Field } from "./Field";

/**
 * Where (SCR-052): the city chips, only with more than one city, and the district chips of the form's city, which
 * toggle (a second press clears it). Another city clears the district and the point (DEV-058; the questionnaire
 * offers «Вернуть»).
 */
export function WhereSection({
  form,
  invalid,
  onCity,
  onDistrict,
}: {
  form: OwnerForm;
  invalid: ReadonlySet<string>;
  onCity: (code: string) => void;
  onDistrict: (code: string | null) => void;
}) {
  const t = useTranslations();
  const { cities, findCity } = useReference();
  const districts = findCity(form.city)?.districts ?? [];
  return (
    <>
      {cities.length > 1 ? (
        <Field label={t("own.where")} focus="city" invalid={invalid.has("city")}>
          <Chips>
            {cities.map((city) => (
              <FilterChip key={city.code} data-city={city.code} pressed={form.city === city.code} onClick={() => onCity(city.code)}>
                {city.name}
              </FilterChip>
            ))}
          </Chips>
        </Field>
      ) : null}
      {districts.length > 0 ? (
        <Field label={t("own.district")} focus="district_code" invalid={invalid.has("district_code")}>
          <Chips>
            {districts.map((district) => (
              <FilterChip
                key={district.code}
                data-district={district.code}
                pressed={form.district_code === district.code}
                onClick={() => onDistrict(form.district_code === district.code ? null : district.code)}
              >
                {district.name}
              </FilterChip>
            ))}
          </Chips>
        </Field>
      ) : null}
    </>
  );
}
