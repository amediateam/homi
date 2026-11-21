import type { City } from "@/lib/reference/types";

import type { OwnerForm } from "../normalize";
import type { PlaceAnswer } from "./usePlaceLabel";

/** What a place answer changes: the silent fill of empty fields, and the replacement of fields that held a value. */
export type PlaceFill = { fill: Partial<OwnerForm>; replaced: Partial<OwnerForm>; before: Partial<OwnerForm> };

/**
 * The fill after «Готово» (WP-81, BR-APP-078): a city the reference data does not know is ignored; empty fields
 * (city, district) are filled silently; fields that hold another value are replaced and their old values kept for
 * «Вернуть». When the district and the landmark were both empty before, the city counts as empty too. `null` when the
 * answer changes nothing.
 */
export function placeFill(form: OwnerForm, answer: PlaceAnswer, findCity: (code: string | null | undefined) => City | null): PlaceFill | null {
  const city = findCity(answer.city);
  if (city === null) {
    return null;
  }
  const district = city.districts.some((item) => item.code === answer.district_code) ? answer.district_code : null;
  const cityEmpty = form.city === null || (form.district_code === null && form.landmark === null);
  const fill: Partial<OwnerForm> = {};
  const replaced: Partial<OwnerForm> = {};
  const before: Partial<OwnerForm> = {};
  if (form.city !== city.code) {
    (cityEmpty ? fill : replaced).city = city.code;
    if (!cityEmpty) {
      before.city = form.city;
    }
  }
  // A new city takes the answer's district, none included: another city's district never stays.
  const cityChanges = form.city !== city.code;
  if ((district !== null || cityChanges) && form.district_code !== district) {
    if (form.district_code === null) {
      fill.district_code = district;
    } else {
      replaced.district_code = district;
      before.district_code = form.district_code;
    }
  }
  return Object.keys(fill).length === 0 && Object.keys(replaced).length === 0 ? null : { fill, replaced, before };
}
