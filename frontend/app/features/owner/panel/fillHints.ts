import type { MessageKey } from "@homi/i18n";

import type { OwnerListingView } from "../normalize";

/** The fields a fill hint opens the form on (`?focus=`, WP-81 BR-APP-093). */
export type HintField = "photos" | "area_m2" | "floor" | "renovation" | "description";

export interface FillHint {
  field: HintField;
  key: MessageKey;
  values?: Record<string, number>;
  done: boolean;
}

/** Photos count as filled from five on (SCR-059). */
export const PHOTOS_FILLED = 5;

/**
 * The fill hints of the owner panel (WP-82, SCR-059, BR-APP-093): five items — photos («Добавьте фото — сейчас n из
 * 10» below five, else «Фото — n из 10»), area, floor, renovation, description — the open ones first, each in its
 * order; `filled` counts the done ones out of five.
 */
export function fillHints(listing: OwnerListingView): { filled: number; total: number; items: FillHint[] } {
  const { form } = listing;
  const photos = listing.photos.length;
  const all: FillHint[] = [
    photos >= PHOTOS_FILLED
      ? { field: "photos", key: "own.panel.photosDone", values: { n: photos }, done: true }
      : { field: "photos", key: "own.panel.addPhotos", values: { n: photos }, done: false },
    { field: "area_m2", key: "own.panel.addArea", done: form.area_m2 !== null },
    { field: "floor", key: "own.panel.addFloor", done: form.floor !== null },
    { field: "renovation", key: "own.panel.addRepair", done: form.renovation !== null },
    { field: "description", key: "own.panel.addDescription", done: form.description !== null && form.description.trim() !== "" },
  ];
  return { filled: all.filter((item) => item.done).length, total: all.length, items: [...all.filter((item) => !item.done), ...all.filter((item) => item.done)] };
}
