"use client";

import type { Locale } from "@homi/config";
import { formatKm } from "@homi/i18n/format";
import { Button, X } from "@homi/ui";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { LocateButton } from "@/features/map/LocateButton";
import { MapAttribution } from "@/features/map/MapAttribution";
import { attributionOf } from "@/features/map/tiles";
import { useDocumentLook } from "@/features/map/useDocumentLook";
import { type LocateFailure, useLocate } from "@/features/map/useLocate";
import { useReference } from "@/lib/reference/useReference";
import { tg } from "@/lib/telegram";

import { distanceKm, googleUrl, type Spot, yandexUrl } from "./spotGeometry";
import { useSpotMap } from "./useSpotMap";

export interface SpotMapFullscreenProps {
  /** The listing's place; `null` while the listing's answer is pending (a direct load): the frame without a map. */
  spot: Spot | null;
  /** «district · landmark» (`placeLine`), bold on the card; `null` leaves the line out. */
  place: string | null;
  /** ×, Escape. */
  onClose: () => void;
}

/**
 * The fullscreen spot map (WP-28, `03` SCR-021): an interactive map of the spot's circle — a swipe pans it, nothing
 * swipes it closed — with × (`common.close`), «Где я» when the adapter can locate, and the bottom card: the place in
 * bold, one line and the hand-offs «Яндекс Карты» / «Google Карты» (light haptic, `tg.openLink`). The line is
 * `listing.mapApprox` until a locate answers: a position plays the success haptic (`useLocate`), draws the blue dot,
 * fits the spot and the user and reads `listing.mapFromYou` with the distance to one decimal; `denied` and `fail`
 * (the 12 s cap included) read `map.locateDenied` and `map.locateFail`. The position stays in this component's state:
 * it is drawn on the map only, never stored or sent (TMA-035), and the route remounts this component on every
 * opening, so a closed map forgets it. The dialog takes the focus on open and gives it back on close.
 */
export function SpotMapFullscreen({ spot, place, onClose }: SpotMapFullscreenProps) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const rootRef = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const { loaded, reference } = useReference();
  const { scheme, lite } = useDocumentLook();
  const tiles = loaded ? (reference.map?.tiles_url ?? null) : undefined;
  const map = useSpotMap(container, spot, { interactive: true, tiles, scheme, locale, lite });
  const attribution = map.status === "ready" ? attributionOf(map.basemap) : null;

  const [failure, setFailure] = useState<LocateFailure | null>(null);
  const onFailure = useCallback((answer: LocateFailure) => setFailure(answer), []);
  const locate = useLocate(onFailure);
  const { me } = locate;
  // A new position replaces the failure the line showed (adjusted while rendering, as `MapScreen` does).
  const [answeredFor, setAnsweredFor] = useState(me);
  if (answeredFor !== me) {
    setAnsweredFor(me);
    setFailure(null);
  }

  const { showUser, fitSpotAndUser } = map;
  useEffect(() => {
    if (me !== null) {
      showUser({ lat: me.lat, lon: me.lon });
      fitSpotAndUser();
    }
  }, [me, showUser, fitSpotAndUser]);

  useLayoutEffect(() => {
    const before = document.activeElement;
    rootRef.current?.focus({ preventScroll: true });
    return () => {
      if (before instanceof HTMLElement && before !== document.body && before.isConnected) {
        before.focus({ preventScroll: true });
      }
    };
  }, []);

  let line = t("listing.mapApprox");
  if (failure !== null) {
    line = t(failure === "denied" ? "map.locateDenied" : "map.locateFail");
  } else if (me !== null && spot !== null) {
    line = t("listing.mapFromYou", { km: formatKm(distanceKm(spot, me), locale) });
  }

  const open = (url: string) => {
    tg.haptic.impact("light");
    tg.openLink(url);
  };

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("listing.location")}
      tabIndex={-1}
      data-spot-fullscreen=""
      data-spot-status={map.status}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
      className="relative size-full outline-none"
    >
      {/* The map's own background beats the library's grey (`.leaflet-container`), and the theme's at the first paint. */}
      <div ref={container} data-spot-map-view="" data-no-swipe="" className="absolute inset-0" style={{ backgroundColor: "var(--bg2)" }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end px-(--gutter) pt-[calc(8px+var(--top-inset))]">
        <button
          type="button"
          data-spot-close=""
          aria-label={t("common.close")}
          onClick={onClose}
          className="glass pointer-events-auto grid size-[44px] place-items-center rounded-pill text-text shadow-(--shadow-float) outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
        >
          <X size={20} strokeWidth={2.25} aria-hidden />
        </button>
      </div>
      {spot !== null ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-[10px] px-(--gutter) pb-[calc(12px+var(--bottom-inset))]">
          <div className="flex items-end justify-between gap-[12px]">
            {attribution !== null ? <MapAttribution kind={attribution} /> : <span />}
            {locate.available ? (
              <div className="pointer-events-auto">
                <LocateButton busy={locate.busy} onLocate={locate.locate} />
              </div>
            ) : null}
          </div>
          <div data-spot-card="" className="pointer-events-auto flex flex-col gap-[10px] rounded-large bg-sheet p-[16px] shadow-(--shadow-float)">
            {place ? (
              <p data-spot-place="" className="text-[16px] leading-snug font-bold">
                {place}
              </p>
            ) : null}
            <p data-spot-line="" aria-live="polite" className="text-[13px] leading-snug text-hint">
              {line}
            </p>
            <div className="grid grid-cols-2 gap-[8px]">
              <Button variant="secondary" size="md" data-spot-yandex="" onClick={() => open(yandexUrl(spot))}>
                {t("listing.openYandex")}
              </Button>
              <Button variant="secondary" size="md" data-spot-google="" onClick={() => open(googleUrl(spot))}>
                {t("listing.openGoogle")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
