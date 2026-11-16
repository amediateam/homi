"use client";

import { useSearchParams } from "next/navigation";
import { type RefObject, useEffect } from "react";

import { usePathname } from "@/i18n/navigation";
import { reportError } from "@/lib/errors/report";
import { isRootTab, matchRoute, parentOf } from "@/lib/navigation/routes";
import { tg } from "@/lib/telegram";
import { refreshHandlerFor, useRefreshHandler } from "@/lib/ui/shellState";

/** The indicator offset, in px, past which a release refreshes (`03` §3.4). */
export const PULL_TRIGGER_PX = 72;
/** The largest indicator offset, in px. */
export const PULL_MAX_PX = 110;
/** Where the indicator stands while the spinner turns, in px. */
export const PULL_SPINNER_PX = 64;
/** The spinner shows at least this long, so a quick answer does not make it flash. */
export const PULL_MIN_SPIN_MS = 700;
/** The indicator moves at half the finger's distance. */
const PULL_RATIO = 0.5;
/** The indicator rests this far above its top edge, hidden under the top bar. */
const REST_OFFSET_PX = 60;

/** An open sheet, a full sheet holding the page and an open listing (WP-23, WP-26) each put a class on `body`. */
const BLOCKING_CLASSES = ["locked", "sheet-open", "listing-open"] as const;

/** The indicator's state, written to its `data-ptr` attribute; `PullToRefresh` styles the spinner from it. */
export type PullPhase = "idle" | "pulling" | "armed" | "refreshing";

/**
 * Whether an address takes the pull (BR-APP-058, D-SH-5): a root tab other than the map and settings, with no layer
 * parameter open over it — `parentOf` of a root tab is not `null` only then.
 */
export function pullAllowedAt(pathname: string, searchParams: URLSearchParams): boolean {
  const { route } = matchRoute(pathname);
  return isRootTab(pathname) && route !== "map" && route !== "settings" && parentOf(pathname, searchParams) === null;
}

/**
 * Pull-to-refresh on the window (WP-23, SCR-010): `indicator` follows a downward pull at the top of the page and
 * spins while the handler that the page registered for its address (`registerRefresh` of `lib/ui/shellState.ts`)
 * runs. Nothing is attached unless a handler is registered and the address allows the pull (`pullAllowedAt`); a
 * handler that registers late attaches the listeners then (`useRefreshHandler`), and the one called on a release is
 * the address's handler at that moment, so a page that registers a new function does not interrupt a pull.
 *
 * A pull starts on a one-finger touch at `scrollY = 0` while `body` has none of the classes of an open sheet or
 * listing. The indicator follows at half the finger's distance, at most 110 px; at 72 px the pull arms with one light
 * impact (TMA-025), below it disarms, and arming again plays again. A release while armed shows the spinner for at
 * least 700 ms and as long as the handler's promise runs, then the indicator settles; a rejection is reported and
 * settles the same way. A second finger, or a pull that turns back into an upward scroll, resets it without
 * refreshing; pulls during a refresh are ignored. `touchcancel` ends a pull as a release does, as in legacy.
 *
 * The listeners are passive and never cancel the scroll (D-SH-5): Telegram's own vertical swipe is off (TMA-015). They
 * live in an effect, so a hidden route (`preserving-ui-state.md`) and a change of address remove them; the
 * indicator's position, opacity and transition are written on its own element only. Under `prefers-reduced-motion`
 * the settle is instant, as motion.css drops every transition.
 */
export function usePullToRefresh(indicator: RefObject<HTMLElement | null>): void {
  const searchParams = useSearchParams();
  const path = usePathname();
  const registered = useRefreshHandler(path) !== undefined;
  const enabled = registered && pullAllowedAt(path, new URLSearchParams(searchParams?.toString() ?? ""));

  useEffect(() => {
    const element = indicator.current;
    if (!element || !enabled) {
      return undefined;
    }

    /** `clientY` where the pull started; `null` while no pull is followed. */
    let startY: number | null = null;
    let pull = 0;
    let armed = false;
    let refreshing = false;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const show = (phase: PullPhase, px: number, animate: boolean) => {
      element.dataset.ptr = phase;
      element.style.transition = animate ? "transform var(--dur-base) var(--ease-ios), opacity 0.2s" : "none";
      element.style.transform = `translate(-50%, ${px - REST_OFFSET_PX}px) rotate(${Math.min(px / PULL_TRIGGER_PX, 1) * 180}deg)`;
      element.style.opacity = px > 4 ? "1" : "0";
    };
    const reset = () => {
      startY = null;
      pull = 0;
      armed = false;
      show("idle", 0, true);
    };

    const refresh = () => {
      refreshing = true;
      show("refreshing", PULL_SPINNER_PX, true);
      const handler = refreshHandlerFor(path);
      const run = new Promise<unknown>((resolve) => resolve(handler?.())).catch((error: unknown) =>
        reportError(error, { kind: "rejection", source: "pull-to-refresh" }),
      );
      const minimum = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, PULL_MIN_SPIN_MS);
      });
      void Promise.all([run, minimum]).then(() => {
        if (!disposed) {
          refreshing = false;
          show("idle", 0, true);
        }
      });
    };

    const onTouchStart = (event: TouchEvent) => {
      if (refreshing) {
        return;
      }
      if (event.touches.length !== 1) {
        if (startY !== null) {
          reset();
        }
        return;
      }
      const blocked = BLOCKING_CLASSES.some((name) => document.body.classList.contains(name));
      if (window.scrollY > 0 || blocked) {
        return;
      }
      startY = event.touches[0].clientY;
      pull = 0;
      armed = false;
      // The indicator comes out from under the top bar, whatever its height is now.
      element.style.top = `${document.querySelector("[data-topbar]")?.getBoundingClientRect().bottom ?? 0}px`;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (startY === null) {
        return;
      }
      if (event.touches.length !== 1) {
        reset();
        return;
      }
      const dy = event.touches[0].clientY - startY;
      if (dy <= 0 || window.scrollY > 0) {
        // The pull turned into a scroll: back to rest, and a release now refreshes nothing.
        if (pull > 0) {
          show("idle", 0, false);
        }
        pull = 0;
        armed = false;
        return;
      }
      pull = Math.min(PULL_MAX_PX, dy * PULL_RATIO);
      if (pull >= PULL_TRIGGER_PX && !armed) {
        armed = true;
        tg.haptic.impact();
      } else if (pull < PULL_TRIGGER_PX) {
        armed = false;
      }
      show(armed ? "armed" : "pulling", pull, false);
    };

    const onTouchEnd = () => {
      if (startY === null) {
        return;
      }
      startY = null;
      if (armed) {
        armed = false;
        refresh();
      } else {
        show("idle", 0, true);
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      show("idle", 0, false);
    };
  }, [indicator, enabled, path]);
}
