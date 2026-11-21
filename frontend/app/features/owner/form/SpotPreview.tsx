"use client";

import type { Locale } from "@homi/config";
import { useLocale, useTranslations } from "next-intl";
import { useRef } from "react";

import { useSpotMap } from "@/features/listing/spot/useSpotMap";
import { MapAttribution } from "@/features/map/MapAttribution";
import { attributionOf } from "@/features/map/tiles";
import { useDocumentLook } from "@/features/map/useDocumentLook";
import { useReference } from "@/lib/reference/useReference";
import { tg } from "@/lib/telegram";

import type { ShownPoint } from "../normalize";

/**
 * The place's spot preview in the questionnaire (WP-81, SCR-052): the circle seekers see (`shown_point`), drawn by the
 * spot map of WP-28 without interaction in a 2:1 box; a tap opens the picker.
 */
export function SpotPreview({ point, onOpen }: { point: ShownPoint; onOpen: () => void }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const container = useRef<HTMLDivElement>(null);
  const { loaded, reference } = useReference();
  const { scheme, lite } = useDocumentLook();
  const tiles = loaded ? (reference.map?.tiles_url ?? null) : undefined;
  const { status, basemap } = useSpotMap(container, loaded ? { lat: point.lat, lon: point.lon, radius: point.radius_m } : null, {
    interactive: false,
    tiles,
    scheme,
    locale,
    lite,
  });
  const attribution = status === "ready" ? attributionOf(basemap) : null;
  return (
    <div className="relative mb-2">
      <button
        type="button"
        data-spot-preview=""
        data-no-swipe=""
        aria-label={t("own.mapBtn")}
        onClick={() => {
          tg.haptic.impact("light");
          onOpen();
        }}
        className="relative block aspect-[2/1] w-full overflow-hidden rounded-medium bg-bg2"
      >
        <div className="pointer-events-none absolute inset-0 isolate">
          <div ref={container} aria-hidden className="size-full" style={{ backgroundColor: "var(--bg2)" }} />
        </div>
      </button>
      {attribution === null ? null : (
        <div className="absolute bottom-1 left-1">
          <MapAttribution kind={attribution} />
        </div>
      )}
    </div>
  );
}
