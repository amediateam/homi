"use client";

import { FilterChip, PriceInput, SegmentedControl } from "@homi/ui";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { useReference } from "@/lib/reference/useReference";

import type { OwnerForm } from "../normalize";
import { Chips, Field } from "./Field";
import { PRICE_DIGITS_MAX } from "./rules";

const grouped = (value: number | null) => (value === null ? "" : new Intl.NumberFormat("ru-RU").format(value).replace(/ /g, " "));
const digits = (text: string) => {
  const only = text.replace(/\D/g, "").slice(0, PRICE_DIGITS_MAX);
  return only === "" ? null : Number(only);
};

/**
 * The price «В месяц» (digits only, at most 12, grouped), the currency «$» / «сум» (USD by default), the usual price
 * (`usual`, WP-81 step 10), the renovation chips of `renovations.owner` and the furniture in three states (a second
 * press of the chosen one clears it).
 */
export function PriceSection({
  form,
  invalid,
  edit,
  usual,
}: {
  form: OwnerForm;
  invalid: ReadonlySet<string>;
  edit: (change: Partial<OwnerForm>) => void;
  usual?: ReactNode;
}) {
  const t = useTranslations();
  const { reference } = useReference();
  const renovations = reference.renovations?.owner ?? [];
  return (
    <>
      <Field label={t("own.price")} focus="price" invalid={invalid.has("price")}>
        <div className="flex items-center gap-2">
          <PriceInput
            data-field="price"
            aria-label={t("own.perMonthLabel")}
            placeholder={t("own.perMonthLabel")}
            inputMode="numeric"
            value={form.price}
            toText={grouped}
            parse={digits}
            onValueChange={(price) => edit({ price })}
            className="flex-1"
          />
          <SegmentedControl
            aria-label={t("own.price")}
            options={[
              { value: "USD", label: "$" },
              { value: "UZS", label: t("own.sum") },
            ]}
            value={form.currency}
            onValueChange={(currency) => edit({ currency })}
          />
        </div>
        {usual}
      </Field>
      {renovations.length > 0 ? (
        <Field focus="renovation" invalid={invalid.has("renovation")}>
          <Chips>
            {renovations.map((option) => (
              <FilterChip
                key={option.code}
                data-renovation={option.code}
                pressed={form.renovation === option.code}
                onClick={() => edit({ renovation: form.renovation === option.code ? null : (option.code as OwnerForm["renovation"]) })}
              >
                {option.name}
              </FilterChip>
            ))}
          </Chips>
        </Field>
      ) : null}
      <Field focus="furniture" invalid={invalid.has("furniture")}>
        <Chips>
          <FilterChip data-furniture="yes" pressed={form.furniture === true} onClick={() => edit({ furniture: form.furniture === true ? null : true })}>
            {t("own.furniture")}
          </FilterChip>
          <FilterChip data-furniture="no" pressed={form.furniture === false} onClick={() => edit({ furniture: form.furniture === false ? null : false })}>
            {t("own.noFurniture")}
          </FilterChip>
        </Chips>
      </Field>
    </>
  );
}
