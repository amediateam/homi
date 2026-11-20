"use client";

import { useBodyClass } from "@homi/ui";
import { type ReactNode, Suspense, use, useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { RouteOverlay } from "@/features/shell/RouteOverlay";
import type { RoutePresentation } from "@/features/shell/RouteSheet";
import { usePathname } from "@/i18n/navigation";
import { takeOverBack } from "@/lib/navigation/backHandler";
import { depth as historyDepth, useDepth } from "@/lib/navigation/history";
import { isListingNumber, matchRoute } from "@/lib/navigation/routes";

import { LISTING_LEAVE_MS, type ListingCloseKind, leaveListingRoute, listingLeavePlays } from "./closeListing";
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
 * How long after its step back a layer whose address has not changed takes taps and Back again: a history step the
 * client refused must not leave it latched (or faded out) for good. Longer than `backBy`'s wait for its `popstate`.
 * A replace is never released: Next keeps the old address until the new page is there, however long that takes.
 */
export const LISTING_CLOSE_SETTLE_MS = 1000;

/**
 * The listing layer (WP-26, D-20): the one owner of `RouteOverlay` for a listing address, in both route trees. The
 * browser keeps a layout instance per number, so the number comes from the layout's own `params`, never from the
 * app-wide `useParams()`. The fallback screen shows while `ListingServer` streams; the child routes render inside the
 * layer, so the listing stays mounted under them, and everything inside reads the layer's context, portals included:
 * its number and the state the screen reports, which tells a child route of a server read that failed (cookie mode).
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
 *
 * The close (WP-36, `close` of the context): Telegram's Back at the layer's own address (`takeOverBack`, while no
 * child route is open and no overlay copy covers this standalone one), the fallback cross, «Смотреть свежие» and
 * `closeListing()` all end in this one function, once per opening. It plays the leave (`animate-listing-out`, 200 ms)
 * and then changes the route (`leaveListingRoute`); in lite graphics, under reduced motion or after a swipe, which has
 * already slid the layer out, it changes the route at once, and so does an overlay copy at the app's depth 0, which
 * lies over a standalone copy rather than over the page Back reveals. When the address or the app's history moved
 * during the leave (a new opening, a browser Back), the leave is cancelled and the route is left alone; a hidden or
 * unmounted layer drops a pending leave. The overlay copy enters with `animate-listing-in`; a direct load does not.
 */
export function ListingLayer({ params, presentation, screen, children }: ListingLayerProps) {
  const raw = use(params).number;
  const number = isListingNumber(raw) ? Number(raw) : null;
  const root = useRef<HTMLDivElement>(null);
  const [opening, setOpening] = useState(0);
  const [view, setView] = useState<ListingView["state"] | null>(null);

  const [leaving, setLeaving] = useState(false);
  const closing = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const route = matchRoute(usePathname());
  const atListing = route.route === "listing" && route.child === null;
  const ownAddress = atListing && route.number === raw;
  const depth = useDepth();
  const swipe = atListing && depth > 0 && (view === "loaded" || view === "preview");
  useBodyClass("listing-open");

  const clearTimers = useCallback(() => {
    for (const timer of [leaveTimer, settleTimer]) {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    }
  }, []);

  const changeRoute = useCallback(() => {
    const from = window.location.href;
    if (leaveListingRoute() !== "back") {
      return;
    }
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      if (window.location.href === from) {
        closing.current = false;
        setLeaving(false);
      }
    }, LISTING_CLOSE_SETTLE_MS);
  }, []);

  const close = useCallback(
    (kind: ListingCloseKind = "leave") => {
      if (closing.current) {
        return;
      }
      closing.current = true;
      // An overlay copy at depth 0 (a replace onto a listing address: a merged number, a depth-0 close of a child)
      // lies over a standalone copy, not over what Back reveals: no leave there.
      const nothingBelow = presentation === "layer" && historyDepth() === 0;
      if (kind === "swipe" || nothingBelow || !listingLeavePlays()) {
        changeRoute();
        return;
      }
      const from = window.location.href;
      const level = historyDepth();
      setLeaving(true);
      leaveTimer.current = setTimeout(() => {
        leaveTimer.current = null;
        if (window.location.href === from && historyDepth() === level) {
          changeRoute();
          return;
        }
        closing.current = false;
        setLeaving(false);
      }, LISTING_LEAVE_MS);
    },
    [changeRoute, presentation],
  );

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

  // Telegram's Back closes this copy only at its own address, and a standalone copy only while no overlay covers it.
  const ownsBack = ownAddress && !(presentation === "standalone" && overlayShown);
  useLayoutEffect(() => (ownsBack ? takeOverBack(() => close()) : undefined), [ownsBack, close]);

  // Hidden or unmounted: the next show is a new opening, and a pending leave is dropped with its route change.
  useLayoutEffect(
    () => () => {
      if (number !== null) {
        forgetView(number);
      }
      clearTimers();
      closing.current = false;
      setLeaving(false);
      setView(null);
      setOpening((count) => count + 1);
    },
    [number, clearTimers],
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
  const value = useMemo<ListingLayerValue>(
    () => ({ number, scrollToTop, reportView, view, close }),
    [number, scrollToTop, reportView, view, close],
  );

  return (
    <ListingLayerContext value={value}>
      <RouteOverlay
        key={`${number}:${opening}`}
        presentation={presentation}
        swipeBack={swipe}
        onClose={close}
        entrance={presentation === "layer"}
        leaving={leaving}
      >
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
