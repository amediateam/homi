"use client";

import { cn, useSwipeBack } from "@homi/ui";
import { type ComponentProps, useLayoutEffect, useRef } from "react";

import { useBack } from "@/lib/navigation/useBack";
import { tg } from "@/lib/telegram";

import { FallbackClose } from "./FallbackClose";
import type { RoutePresentation } from "./RouteSheet";

/** How the listing layer is asked to close: the swipe has already slid it out (`ListingCloseKind` of the listing). */
export type RouteOverlayCloseKind = "leave" | "swipe";

export interface RouteOverlayProps extends Omit<ComponentProps<"div">, "ref"> {
  /** `layer` (default): the copy in the `@overlay` slot; `standalone`: the page of a listing address loaded directly. */
  presentation?: RoutePresentation;
  /**
   * A rightward swipe closes the layer (SCR-018). Off by default: the listing turns it on once its data is shown and
   * no layer is open over it (SCR-019, WP-26); the fullscreen map never does (WP-28).
   */
  swipeBack?: boolean;
  /**
   * The listing layer's own close (WP-36): the swipe calls it with `swipe` once the layer has slid out, and the
   * fallback cross, shown while the Telegram SDK is absent, with `leave`. Without it the swipe calls `back()` and there
   * is no cross (the fullscreen map has its own ×).
   */
  onClose?: (kind: RouteOverlayCloseKind) => void;
  /** The listing layer's entrance (WP-36): it slides in from 24 % and fades in, none in lite graphics. */
  entrance?: boolean;
  /** The listing layer's leave is playing: it slides out and takes no taps, until the route change removes it. */
  leaving?: boolean;
}

/**
 * The listing layer (WP-23, SCR-018; WP-26 fills it): a fixed full-screen layer at `--z-overlay`, above the shell
 * and the sub-pages and below the sheets (`03` §3.6), that scrolls itself. Telegram's BackButton closes it through
 * `TelegramButtons`, and the swipe back, when the content allows it, closes it once the layer has slid out, after a
 * light impact on the release that closes it (TMA-025) — through `onClose` when the layer has its own close (the
 * listing, WP-36), else `back()` of `useBack()`. With `onClose` the layer also carries the fallback cross while the
 * Telegram SDK is absent (`FallbackClose`, TMA-047). The swipe is touch only and never runs on Android (TMA-041) or in
 * the standalone presentation, which has no page below to slide to; there Back goes to the parent address. The child
 * addresses (photos, location, market, actions) render inside it, so the listing stays mounted under them.
 * `className` may raise the layer (the fullscreen map of WP-28 sits at 100). The layer keeps no top inset, as legacy
 * `listing-layer`: the hero of WP-26 runs under Telegram's header, and content that must clear it pads itself with
 * `--top-inset`. `entrance` and `leaving` play the listing's motion (`animate-listing-in`, `animate-listing-out`);
 * `data-layer-motion` lets lite graphics stop both, and reduced motion stops every animation.
 */
export function RouteOverlay({
  presentation = "layer",
  swipeBack = false,
  onClose,
  entrance = false,
  leaving = false,
  className,
  children,
  ...props
}: RouteOverlayProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const { back } = useBack();
  useSwipeBack(layerRef, onClose === undefined ? back : () => onClose("swipe"), {
    enabled: swipeBack && presentation === "layer" && !tg.isAndroid(),
    onCommit: () => tg.haptic.impact(),
  });
  // A swipe that started and slid back leaves `animation: none` inline (it stops the entrance while the finger
  // moves the layer); the leave must not be stopped by it.
  useLayoutEffect(() => {
    if (leaving) {
      layerRef.current?.style.removeProperty("animation");
    }
  }, [leaving]);

  return (
    <div
      ref={layerRef}
      data-slot="route-overlay"
      data-presentation={presentation}
      data-layer-motion={entrance || leaving ? "" : undefined}
      data-leaving={leaving ? "" : undefined}
      className={cn(
        "fixed inset-0 z-(--z-overlay) overflow-x-hidden overflow-y-auto overscroll-contain bg-bg text-text",
        // One animation at a time: both utilities set `animation`, and `cn` does not drop either.
        entrance && !leaving && "animate-listing-in",
        leaving && "pointer-events-none animate-listing-out",
        className,
      )}
      {...props}
    >
      {children}
      {onClose === undefined ? null : <FallbackClose onClose={() => onClose("leave")} />}
    </div>
  );
}
