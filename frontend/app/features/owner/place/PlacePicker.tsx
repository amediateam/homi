"use client";

import type { Locale } from "@homi/config";
import { Button, House, LocateFixed, useSwipeBack } from "@homi/ui";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { MapAttribution } from "@/features/map/MapAttribution";
import { attributionOf } from "@/features/map/tiles";
import { useDocumentLook } from "@/features/map/useDocumentLook";
import { useLocate } from "@/features/map/useLocate";
import { useReference } from "@/lib/reference/useReference";
import { tg } from "@/lib/telegram";

import { inUzbekistanBox } from "../form/rules";
import { type GeoPoint, type PickStart, usePickerMap } from "./usePickerMap";
import { usePlaceLabel } from "./usePlaceLabel";

/** A position worse than this is «примерно» (BR-APP-097). */
export const ROUGH_ACCURACY_M = 100;
/** A saved point or a found position opens at this zoom (app zoom scale). */
export const PLACE_ZOOM = 17;

export type PickerNote = "pickDenied" | "pickFailed" | "pickFarMe" | "pickRough" | "pickOutside";

/**
 * The place picker (WP-81, SCR-051, BR-APP-076 … BR-APP-078, BR-APP-097): a full-screen map portalled at
 * `--z-backdrop` with a fixed pin (lifted while the map moves), the label under it, «Найти меня» when Telegram can
 * locate, and a glass panel with «Где квартира?», the hint, «Готово» (disabled until the map is there) and «Указать
 * вручную» or «Отмена». Both engines failing shows `own.pickFailed` instead of a blank map. A swipe from the left
 * edge cancels; the map takes every other touch.
 */
export function PlacePicker({
  start,
  first,
  onDone,
  onManual,
  onCancel,
  onSwipe,
}: {
  start: PickStart;
  first: boolean;
  onDone: (point: GeoPoint, located: boolean) => void;
  onManual: () => void;
  onCancel: () => void;
  /** The edge swipe: `closeOwnerForm` at step «where», else `onCancel`. */
  onSwipe: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const { reference } = useReference();
  const container = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const { scheme, lite } = useDocumentLook();
  const map = usePickerMap(container, start, { tiles: reference.map?.tiles_url, scheme, locale, lite });
  const label = usePlaceLabel(map.center, map.moving);
  const [note, setNote] = useState<PickerNote | null>(null);
  const located = useRef(false);

  // The swipe is the picker's Back: step «where» closes the form, from the questionnaire it cancels; never on Android
  // (TMA-041), as the other layers.
  useSwipeBack(layer, onSwipe, { edgeOnly: true, enabled: !tg.isAndroid(), onCommit: () => tg.haptic.impact() });

  const onLocateFailure = useCallback((failure: "denied" | "fail") => {
    tg.haptic.warning();
    setNote(failure === "denied" ? "pickDenied" : "pickFailed");
  }, []);
  const locate = useLocate(onLocateFailure);
  const { flyTo, showUser } = map;
  // A found position: outside the box it only warns; else the dot and the flight (the notes are derived below).
  const me = locate.me;
  const meOutside = me !== null && !inUzbekistanBox(me.lat, me.lon);
  useEffect(() => {
    if (me === null) {
      return;
    }
    if (meOutside) {
      tg.haptic.warning();
      return;
    }
    showUser(me);
    flyTo(me, PLACE_ZOOM);
    located.current = true;
  }, [me, meOutside, flyTo, showUser]);
  const meRough = me !== null && !meOutside && me.accuracy !== null && me.accuracy > ROUGH_ACCURACY_M;
  const shownNote: PickerNote | null = note ?? (meOutside ? "pickFarMe" : meRough ? "pickRough" : null);

  const done = () => {
    const point = map.read();
    if (point === null) {
      return;
    }
    if (!inUzbekistanBox(point.lat, point.lon)) {
      tg.haptic.warning();
      setNote("pickOutside");
      return;
    }
    tg.haptic.impact("medium");
    onDone({ lat: Math.round(point.lat * 1e5) / 1e5, lon: Math.round(point.lon * 1e5) / 1e5 }, located.current);
  };

  const attribution = attributionOf(map.basemap);
  const labelText = label.kind === "reading" ? "…" : label.kind === "none" ? t("own.pickNoAddr") : label.text;

  const picker = (
    <div ref={layer} data-owner-picker="" className="fixed inset-0 z-(--z-backdrop) flex flex-col bg-bg text-text">
      <div className="relative flex-1">
        {map.status === "failed" ? (
          <p data-picker-failed role="alert" className="grid h-full place-items-center px-8 text-center text-[15px] text-hint">
            {t("own.pickFailed")}
          </p>
        ) : (
          <div ref={container} data-no-swipe="" data-map="" className="absolute inset-0" />
        )}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="flex -translate-y-1/2 flex-col items-center">
            <span
              data-pin=""
              data-moving={map.moving ? "" : undefined}
              className="grid size-11 place-items-center rounded-pill bg-accent text-accent-text shadow-lg transition-transform duration-200 data-moving:-translate-y-2"
            >
              <House size={22} aria-hidden />
            </span>
            <span className="mt-1 size-1.5 rounded-pill bg-text" aria-hidden />
          </div>
        </div>
        <p data-picker-label="" className="glass absolute inset-x-6 top-[calc(12px+var(--top-inset))] rounded-pill px-3 py-1.5 text-center text-[14px]">
          {labelText}
        </p>
        {locate.available ? (
          <button
            type="button"
            data-action="locate"
            aria-label={t("own.pickMe")}
            disabled={locate.busy}
            onClick={() => {
              setNote(null);
              locate.locate();
            }}
            className="glass absolute right-4 bottom-4 grid size-11 place-items-center rounded-pill text-text"
          >
            <LocateFixed size={20} aria-hidden />
          </button>
        ) : null}
        {attribution === null ? null : (
          <div className="absolute bottom-1 left-2">
            <MapAttribution kind={attribution} />
          </div>
        )}
      </div>
      <div className="glass flex flex-col gap-2 px-(--gutter) pt-4 pb-[calc(12px+var(--bottom-inset))]">
        <h2 className="text-[20px] font-bold">{t("own.whereTitle")}</h2>
        <p className="text-[13px] leading-[1.4] text-hint">{t("own.pickHint")}</p>
        {shownNote === null ? null : (
          <p data-picker-note={shownNote} role="status" className="text-[13px] leading-[1.4] text-warn">
            {t(`own.${shownNote}`)}
          </p>
        )}
        <Button data-action="pick-done" disabled={map.status !== "ready"} onClick={done}>
          {t("own.pickDone")}
        </Button>
        <Button variant="text" data-action={first ? "pick-manual" : "pick-cancel"} className="self-center" onClick={first ? onManual : onCancel}>
          {first ? t("own.whereManual") : t("own.pickCancel")}
        </Button>
      </div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(picker, document.body);
}
