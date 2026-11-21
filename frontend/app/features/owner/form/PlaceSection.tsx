"use client";

import { Button } from "@homi/ui";
import { useTranslations } from "next-intl";

import type { OwnerForm, ShownPoint } from "../normalize";
import { Field } from "./Field";
import { SpotPreview } from "./SpotPreview";
import { LANDMARK_MAX } from "./rules";

/**
 * The place (SCR-052): the landmark «Адрес или ориентир» (at most 120 characters, public, `own.landmarkHint`), and
 * «Карта» to the picker. With a saved point the note of the circle seekers see (`own.mapNote`); the spot preview of
 * `shown_point` joins with the picker (WP-81 step 9).
 */
export function PlaceSection({
  form,
  shownPoint,
  saved,
  invalid,
  pointRefused = false,
  onLandmark,
  onMap,
}: {
  form: OwnerForm;
  shownPoint: ShownPoint | null;
  /** The point of the saved listing (the server's copy). */
  saved: { lat: number | null; lon: number | null } | null;
  invalid: boolean;
  /** The server refused the point (`422` with `errors.point`, LB-APP-063): `own.pointOutside` under the field. */
  pointRefused?: boolean;
  onLandmark: (text: string | null) => void;
  onMap: () => void;
}) {
  const t = useTranslations();
  // The preview shows while the form's point is the one the server shows (`shown_point` is drawn around it).
  const preview = form.lat !== null && form.lon !== null && saved !== null && saved.lat === form.lat && saved.lon === form.lon;
  return (
    <Field label={t("own.address")} focus="landmark" invalid={invalid} hint={t("own.landmarkHint")}>
      {preview && shownPoint !== null ? (
        <>
          <SpotPreview point={shownPoint} onOpen={onMap} />
          <p className="mb-2 text-[13px] leading-[1.4] text-hint">{t("own.mapNote")}</p>
        </>
      ) : null}
      <div className="flex gap-2">
        <input
          type="text"
          data-field="landmark"
          value={form.landmark ?? ""}
          maxLength={LANDMARK_MAX}
          placeholder={t("own.addressPh")}
          onChange={(event) => onLandmark(event.target.value === "" ? null : event.target.value.slice(0, LANDMARK_MAX))}
          className="h-11 min-w-0 flex-1 rounded-medium border border-sep bg-fill px-3 text-[16px] text-text outline-none placeholder:text-hint focus-visible:ring-2 focus-visible:ring-ring"
        />
        {preview ? null : (
          <Button variant="secondary" data-action="map" onClick={onMap}>
            {t("own.mapBtn")}
          </Button>
        )}
      </div>
      {pointRefused ? (
        <p data-point-refused role="alert" className="mt-1.5 text-[13px] text-danger">
          {t("own.pointOutside")}
        </p>
      ) : null}
    </Field>
  );
}
