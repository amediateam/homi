"use client";

import { useEffect, useState } from "react";

import { bffFetch } from "@/lib/api/browser";
import { useReference } from "@/lib/reference/useReference";

import { inUzbekistanBox } from "../form/rules";
import type { GeoPoint } from "./usePickerMap";

/** The label waits this long after the map stops (BR-APP-077). */
export const LABEL_WAIT_MS = 400;

export type PlaceAnswer = { city: string | null; district_code: string | null };

/** The centre the label is read for: 3 decimals, about 100 m, enough for a district (default (f), SEC-REQ-052). */
export function roundForLabel(point: GeoPoint): GeoPoint {
  return { lat: Math.round(point.lat * 1000) / 1000, lon: Math.round(point.lon * 1000) / 1000 };
}

/** `GET /owner/place` for `point`, or `null` on any failure. */
export async function readPlace(point: GeoPoint, signal?: AbortSignal): Promise<PlaceAnswer | null> {
  const rounded = roundForLabel(point);
  const result = await bffFetch<PlaceAnswer>("owner/place", { query: { lat: rounded.lat, lon: rounded.lon }, ...(signal === undefined ? {} : { signal }) });
  return result.ok ? { city: result.data.city ?? null, district_code: result.data.district_code ?? null } : null;
}

export type PlaceLabel = { kind: "reading" } | { kind: "none" } | { kind: "place"; text: string };

/**
 * A read the effect aborted rejects (`bffFetch` rethrows the caller's abort); the effect has moved on, so the rejection
 * is dropped instead of reaching the global error report (WP-33: "signal is aborted without reason").
 */
function ignoreAbort(): void {}

/**
 * The label under the pin (WP-81, BR-APP-077, DEC-79): `GET /owner/place` 400 ms after each stop of the map, the
 * previous read aborted, only inside the rectangle of Uzbekistan (outside it `none` at once); «…» while it runs; then
 * the district and the city by their reference names, else the city, else `none`. A failed read is `none`.
 */
export function usePlaceLabel(center: GeoPoint, moving: boolean): PlaceLabel {
  const { findCity } = useReference();
  const [answer, setAnswer] = useState<{ for: string; label: PlaceLabel } | null>(null);
  const inside = inUzbekistanBox(center.lat, center.lon);
  const key = `${center.lat},${center.lon}`;

  useEffect(() => {
    if (moving || !inside) {
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setAnswer({ for: key, label: { kind: "reading" } });
      void readPlace(center, controller.signal).then((place) => {
        if (controller.signal.aborted) {
          return;
        }
        const city = findCity(place?.city);
        const district = city?.districts.find((item) => item.code === place?.district_code);
        const text = city === null ? null : district === undefined ? city.name : `${district.name} · ${city.name}`;
        setAnswer({ for: key, label: text === null ? { kind: "none" } : { kind: "place", text } });
      }, ignoreAbort);
    }, LABEL_WAIT_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `center` is read through `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, moving, inside, findCity]);

  if (!inside) {
    return { kind: "none" };
  }
  return answer !== null && answer.for === key && !moving ? answer.label : { kind: "reading" };
}
