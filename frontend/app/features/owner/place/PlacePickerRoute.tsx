"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { track } from "@/lib/analytics/events";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { useReference } from "@/lib/reference/useReference";
import { tg } from "@/lib/telegram";
import { showToast } from "@/lib/ui/toast";

import { closeOwnerForm } from "../closeOwnerForm";
import { useOwnerForm } from "../form/context";
import { placeFill } from "./applyPlace";
import { PLACE_ZOOM, PlacePicker } from "./PlacePicker";
import type { GeoPoint, PickStart } from "./usePickerMap";
import { readPlace } from "./usePlaceLabel";

/** A city without a zoom of its own opens at this one (app zoom scale). */
const DEFAULT_CITY_ZOOM = 12;

/**
 * `/owner/<id>/place` (WP-81, SCR-051): the picker over the questionnaire. Its start view is the saved point at zoom
 * 17, else the centre of the form's city or the first city of the reference data at that city's zoom + 1 (DEV-061:
 * no start call). «Готово» saves the point (5 decimals) through the questionnaire's autosave, sends
 * `owner_place_set`, and fills the place from `GET /owner/place` (BR-APP-078). `?first=1` is step «where»: «Указать
 * вручную» and «Готово» replace it with the questionnaire; from the questionnaire «Отмена» and «Готово» go back.
 */
export function PlacePickerRoute() {
  const t = useTranslations();
  const owner = useOwnerForm();
  const { cities, findCity } = useReference();
  const first = useSearchParams().has("first");
  if (owner === null) {
    return null;
  }
  const { listing, form, restore } = owner;
  const city = findCity(form.city) ?? cities[0] ?? null;
  const start: PickStart =
    form.lat !== null && form.lon !== null
      ? { lat: form.lat, lon: form.lon, zoom: PLACE_ZOOM }
      : city !== null
        ? { lat: city.center.lat, lon: city.center.lon, zoom: (city.zoom || DEFAULT_CITY_ZOOM - 1) + 1 }
        : { lat: 41.3111, lon: 69.2797, zoom: DEFAULT_CITY_ZOOM };

  const leave = () => (first ? nav.replace(routes.ownerForm(listing.id)) : nav.back());

  const fill = async (point: GeoPoint) => {
    const answer = await readPlace(point);
    const now = owner.current();
    // The point changed meanwhile, or the read failed: the answer is dropped.
    if (answer === null || now.lat !== point.lat || now.lon !== point.lon) {
      return;
    }
    const change = placeFill(now, answer, findCity);
    if (change === null) {
      return;
    }
    restore({ ...change.fill, ...change.replaced });
    if (Object.keys(change.replaced).length > 0) {
      track("owner_place_autofill", { result: "applied" });
      showToast({
        text: t("own.placeUpdated"),
        action: t("own.placeUndo"),
        run: () => {
          restore(change.before);
          track("owner_place_autofill", { result: "reverted" });
        },
      });
    } else {
      track("owner_place_autofill", { result: "applied" });
      showToast({ key: "own.placeNote" });
    }
  };

  return (
    <PlacePicker
      start={start}
      first={first}
      onDone={(point, located) => {
        restore({ lat: point.lat, lon: point.lon });
        track("owner_place_set", { source: located ? "locate" : "map" });
        void fill(point);
        leave();
      }}
      onManual={() => {
        tg.haptic.impact("light");
        track("owner_place_set", { source: "manual" });
        nav.replace(routes.ownerForm(listing.id));
      }}
      onCancel={() => {
        tg.haptic.impact("light");
        leave();
      }}
      onSwipe={() => (first ? void closeOwnerForm() : leave())}
    />
  );
}
