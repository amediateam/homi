"use client";

import type { Locale } from "@homi/config";
import { Maximize2 } from "@homi/ui";
import { useLocale, useTranslations } from "next-intl";
import { type RefObject, useEffect, useRef, useState } from "react";

import { MapAttribution } from "@/features/map/MapAttribution";
import { attributionOf } from "@/features/map/tiles";
import { useDocumentLook } from "@/features/map/useDocumentLook";
import { useRouter } from "@/i18n/navigation";
import { routes } from "@/lib/navigation/routes";
import { useReference } from "@/lib/reference/useReference";
import { tg } from "@/lib/telegram";

import type { Spot } from "./spotGeometry";
import { useSpotMap } from "./useSpotMap";

/** The mini map mounts once its box is this close to the visible part of the listing (legacy). */
export const NEAR_MARGIN = "300px";

/**
 * `true` from the first time `ref` comes within `NEAR_MARGIN` of the listing layer's visible box, and from then on. The
 * listing scrolls inside its `RouteOverlay`, not the window, so that scroller is the observer's root: a margin on the
 * viewport would not reach past the scroller's clip. Without `IntersectionObserver` the box never counts as near.
 */
function useNearViewport(ref: RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (near || element === null || typeof IntersectionObserver === "undefined") {
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
        }
      },
      { root: element.closest('[data-slot="route-overlay"]'), rootMargin: NEAR_MARGIN },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, near]);
  return near;
}

/**
 * The listing's mini map (WP-28, `03` SCR-018 block 9): a button named `listing.mapOpen` around a 2:1 box with an
 * expand icon. The static map — the spot's circle, no pan and no zoom — mounts once the box comes within 300 px of the
 * visible part of the listing and reference data is loaded; until then, and when both engines failed, the box keeps
 * the map's background colour, with no spinner. A tap plays the light haptic and pushes `/listing/{n}/location`, the
 * fullscreen map over the listing, which tries the engines again. `data-no-swipe` keeps a swipe that starts on it from
 * closing the listing. The attribution sits over the box beside the button, as a button holds no links.
 */
export function SpotMap({ number, spot }: { number: number; spot: Spot }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null);
  const near = useNearViewport(container);
  const { loaded, reference } = useReference();
  const { scheme, lite } = useDocumentLook();
  const tiles = loaded ? (reference.map?.tiles_url ?? null) : undefined;
  const { status, basemap } = useSpotMap(container, near && loaded ? spot : null, { interactive: false, tiles, scheme, locale, lite });
  const attribution = status === "ready" ? attributionOf(basemap) : null;

  return (
    <div className="relative">
      <button
        type="button"
        data-spot-map=""
        data-spot-status={status}
        data-no-swipe=""
        aria-label={t("listing.mapOpen")}
        onClick={() => {
          tg.haptic.impact("light");
          router.push(routes.listingLocation(number));
        }}
        className="relative block aspect-[2/1] w-full overflow-hidden rounded-medium bg-bg2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* The map's own background beats the library's grey (`.leaflet-container`), and the theme's at the first paint.
            The box positions and the container is sized by it: both libraries' CSS give the container `position:
            relative` (`.maplibregl-map`, `.leaflet-container`), which would beat insets on the container itself. */}
        <div className="pointer-events-none absolute inset-0">
          <div ref={container} data-spot-map-view="" aria-hidden className="size-full" style={{ backgroundColor: "var(--bg2)" }} />
        </div>
        <span
          data-spot-expand=""
          className="glass absolute top-[8px] right-[8px] grid size-[32px] place-items-center rounded-pill text-text shadow-(--shadow-float)"
        >
          <Maximize2 size={16} strokeWidth={2.25} aria-hidden />
        </span>
      </button>
      {attribution !== null ? (
        <div className="pointer-events-none absolute bottom-[4px] left-[4px]">
          <MapAttribution kind={attribution} />
        </div>
      ) : null}
    </div>
  );
}
