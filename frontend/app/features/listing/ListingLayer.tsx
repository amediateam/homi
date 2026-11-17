"use client";

import { useBodyClass } from "@homi/ui";
import { type ReactNode, Suspense, use, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import { RouteOverlay } from "@/features/shell/RouteOverlay";
import type { RoutePresentation } from "@/features/shell/RouteSheet";
import { usePathname } from "@/i18n/navigation";
import { isListingNumber, matchRoute } from "@/lib/navigation/routes";

import { ListingScreen } from "./ListingScreen";
import { ListingLayerContext, type ListingLayerValue, type ListingView } from "./useListing";
import { forgetView } from "./viewState";

export interface ListingLayerProps {
  /** The layout's own `params` (segment-local: a hidden copy of another listing keeps its number). */
  params: Promise<{ number: string }>;
  presentation: RoutePresentation;
  /** `ListingServer`, which streams inside the layer's boundary. */
  screen: ReactNode;
  /** The child routes: photos, location, market, actions. */
  children: ReactNode;
}

/**
 * The listing layer (WP-26, D-20): the one owner of `RouteOverlay` for a listing address, in both route trees. The
 * browser keeps a layout instance per number, so the number comes from the layout's own `params`, never from the
 * app-wide `useParams()`. The fallback screen shows while `ListingServer` streams; the child routes render inside the
 * layer, so the listing stays mounted under them, and everything inside reads the layer's context, portals included.
 *
 * Each opening starts fresh: when the route is hidden (bfcache) or unmounted, the opening count moves on, which
 * remounts the overlay — top of the scroll, photo 1, swipe-back slide reset — and the hero index is forgotten
 * (D-11). On open the layer takes the focus; on close it gives it back to what had it, if still there (D-12).
 * Swipe back is on only while the screen shows data (preview or details) and no child route is open; the body
 * class `listing-open` is held while the layer is visible.
 */
export function ListingLayer({ params, presentation, screen, children }: ListingLayerProps) {
  const raw = use(params).number;
  const number = isListingNumber(raw) ? Number(raw) : null;
  const root = useRef<HTMLDivElement>(null);
  const [opening, setOpening] = useState(0);
  const [view, setView] = useState<ListingView["state"] | null>(null);

  const route = matchRoute(usePathname());
  const atListing = route.route === "listing" && route.child === null;
  const swipe = atListing && (view === "loaded" || view === "preview");
  useBodyClass("listing-open");

  // Hidden or unmounted: the next show is a new opening.
  useLayoutEffect(
    () => () => {
      if (number !== null) {
        forgetView(number);
      }
      setView(null);
      setOpening((count) => count + 1);
    },
    [number],
  );

  useLayoutEffect(() => {
    const before = document.activeElement;
    root.current?.focus({ preventScroll: true });
    return () => {
      if (before instanceof HTMLElement && before !== document.body && document.contains(before)) {
        before.focus({ preventScroll: true });
      }
    };
  }, [opening]);

  const scrollToTop = useCallback(() => {
    root.current?.closest<HTMLElement>('[data-slot="route-overlay"]')?.scrollTo({ top: 0 });
  }, []);
  const reportView = useCallback((state: ListingView["state"]) => setView(state), []);
  const value = useMemo<ListingLayerValue>(() => ({ number, scrollToTop, reportView }), [number, scrollToTop, reportView]);

  return (
    <ListingLayerContext value={value}>
      <RouteOverlay key={`${number}:${opening}`} presentation={presentation} swipeBack={swipe}>
        <div
          ref={root}
          tabIndex={-1}
          data-route="listing"
          data-layer={presentation === "layer" ? "overlay" : undefined}
          data-listing-number={number ?? undefined}
          className="min-h-full outline-none"
        >
          <Suspense fallback={<ListingScreen number={number} />}>{screen}</Suspense>
          {children}
        </div>
      </RouteOverlay>
    </ListingLayerContext>
  );
}
