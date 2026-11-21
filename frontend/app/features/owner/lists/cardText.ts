import type { Translate } from "@homi/i18n/format";

import type { City } from "@/lib/reference/types";

import type { OwnerForm } from "../normalize";

const grouped = (value: number) => new Intl.NumberFormat("ru-RU").format(value).replace(/ | /g, " ");

/** The asking price as the owner typed it — «$600» or «6 000 000 сум» — without the period; `null` without one. */
export function priceText(form: OwnerForm, t: Translate): string | null {
  if (form.price === null) {
    return null;
  }
  return form.currency === "UZS" ? `${grouped(form.price)} ${t("own.sum")}` : `$${grouped(form.price)}`;
}

/**
 * «rooms · district» of an owner card (SCR-057): the district of the reference data, falling back to the landmark,
 * then to the city's name; the rooms as «Комната» or «N-комн.». Empty parts are left out.
 */
export function placeText(form: OwnerForm, findCity: (code: string | null | undefined) => City | null, t: Translate): string {
  const city = findCity(form.city);
  const district = city?.districts.find((item) => item.code === form.district_code)?.name ?? null;
  const rooms = form.room ? t("own.whatRoom") : form.rooms === null ? null : t("own.whatRooms", { n: form.rooms });
  return [rooms, district ?? form.landmark ?? city?.name ?? null].filter((part): part is string => part !== null && part !== "").join(" · ");
}
