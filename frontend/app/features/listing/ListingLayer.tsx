"use client";

import { useBodyClass } from "@homi/ui";
import { type ReactNode, Suspense, use, useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { RouteOverlay } from "@/features/shell/RouteOverlay";
import type { RoutePresentation } from "@/features/shell/RouteSheet";
import { usePathname } from "@/i18n/navigation";
import { useDepth } from "@/lib/navigation/history";
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

/** The overlay copies of a listing shown now, counted by each `layer` instance while it is visible. */
let overlayCopies = 0;
const overlayListeners = new Set<() => void>();

function countOverlayCopy(change: 1 | -1): void {
  overlayCopies += change;
  for (const listener of overlayListeners) {
    listener();
  }
}

function subscribeOverlayCopies(listener: () => void): () => void {
  overlayListeners.add(listener);
  return () => overlayListeners.delete(listener);
}

function overlayCopyShown(): boolean {
  return overlayCopies > 0;
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
 * Swipe back is on only while the screen shows data (preview or details), no child route is open and the app pushed
 * a page below (depth > 0: an overlay copy over a directly loaded listing has only that copy under it); the body
 * class `listing-open` is held while the layer is visible.
 *
 * Next intercepts every soft navigation to a listing address into `@overlay`, the direct tree's included, while the
 * `children` slot keeps the standalone tree. Once an overlay copy has shown, the standalone copy drops its child
 * routes for the rest of its life (a latch, not a toggle): after a depth-0 close of a directly loaded child its
 * portalled viewer or sheet would stay above the overlay copy, and it is never the live child again.
 */
export function ListingLayer({ params, presentation, screen, children }: ListingLayerProps) {
  const raw = use(params).number;
  const number = isListingNumber(raw) ? Number(raw) : null;
  const root = useRef<HTMLDivElement>(null);
  const [opening, setOpening] = useState(0);
  const [view, setView] = useState<ListingView["state"] | null>(null);

  const route = matchRoute(usePathname());
  const atListing = route.route === "listing" && route.child === null;
  const depth = useDepth();
  const swipe = atListing && depth > 0 && (view === "loaded" || view === "preview");
  useBodyClass("listing-open");

  // Hidden (Activity) or unmounted, an overlay copy no longer counts; the latch below stays set.
  useLayoutEffect(() => {
    if (presentation !== "layer") {
      return;
    }
    countOverlayCopy(1);
    return () => countOverlayCopy(-1);
  }, [presentation]);

  const overlayShown = useSyncExternalStore(subscribeOverlayCopies, overlayCopyShown, () => false);
  const [superseded, setSuperseded] = useState(false);
  if (presentation === "standalone" && overlayShown && !superseded) {
    setSuperseded(true);
  }

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
          {superseded ? null : children}
        </div>
      </RouteOverlay>
    </ListingLayerContext>
  );
}
