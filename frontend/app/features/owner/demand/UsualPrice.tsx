"use client";

import { useTranslations } from "next-intl";

import { useReference } from "@/lib/reference/useReference";

import type { OwnerForm } from "../normalize";
import type { Demand } from "./useDemand";

/** A dollar amount in millions of sum, one decimal, with a comma. */
function millions(usd: number, rate: number): string {
  const value = Math.round((usd * rate) / 100_000) / 10;
  return String(value).replace(".", ",");
}

/**
 * «≈ обычная цена: {range} — {what}, {place}» (WP-81, BR-APP-083, DEC-78): only when the demand answer gives both
 * bounds and a rooms choice exists; in a UZS form the range is in millions through `rates.usd_uzs`, else «$low–high».
 * Without a harvested median it is absent.
 */
export function UsualPrice({ demand, form }: { demand: Demand | null; form: OwnerForm }) {
  const t = useTranslations();
  const { usdUzs, findCity } = useReference();
  if (demand === null || demand.usualLowUsd === null || demand.usualHighUsd === null || (!form.room && form.rooms === null)) {
    return null;
  }
  const low = demand.usualLowUsd;
  const high = demand.usualHighUsd;
  const range =
    form.currency === "UZS" && usdUzs > 0
      ? t("money.mln", { value: millions(low, usdUzs) + "–" + millions(high, usdUzs) })
      : "$" + String(low) + "–" + String(high);
  const what = form.room ? t("own.whatRoom") : t("own.whatRooms", { n: form.rooms ?? 0 });
  const city = findCity(form.city);
  const district = city?.districts.find((item) => item.code === form.district_code);
  const place = district?.name ?? city?.name ?? "";
  return (
    <p data-usual-price="" className="mt-1.5 text-[13px] leading-[1.4] text-hint">
      {t("own.usual", { range, what, place })}
    </p>
  );
}
