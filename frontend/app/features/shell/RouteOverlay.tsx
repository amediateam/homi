"use client";

import { cn, useSwipeBack } from "@homi/ui";
import { type ComponentProps, useRef } from "react";

import { useBack } from "@/lib/navigation/useBack";
import { tg } from "@/lib/telegram";

import type { RoutePresentation } from "./RouteSheet";

export interface RouteOverlayProps extends Omit<ComponentProps<"div">, "ref"> {
  /** `layer` (default): the copy in the `@overlay` slot; `standalone`: the page of a listing address loaded directly. */
  presentation?: RoutePresentation;
  /**
   * A rightward swipe closes the layer (SCR-018). Off by default: the listing turns it on once its data is shown and
   * no layer is open over it (SCR-019, WP-26); the fullscreen map never does (WP-28).
   */
  swipeBack?: boolean;
}

/**
 * The listing layer (WP-23, SCR-018; WP-26 fills it): a fixed full-screen layer at `--z-overlay`, above the shell
 * and the sub-pages and below the sheets (`03` §3.6), that scrolls itself. It has no close control of its own:
 * Telegram's BackButton closes it through `TelegramButtons`, and the swipe back, when the content allows it, calls the
 * same `back()` of `useBack()` once the layer has slid out, after a light impact on the release that closes it
 * (TMA-025). The swipe is touch only and never runs on Android (TMA-041) or in the standalone presentation, which has
 * no page below to slide to; there Back goes to the parent address. The child addresses (photos, location, market,
 * actions) render inside it, so the listing stays mounted under them. `className` may raise the layer (the fullscreen
 * map of WP-28 sits at 100). The layer keeps no top inset, as legacy `listing-layer`: the hero of WP-26 runs under
 * Telegram's header, and content that must clear it pads itself with `--top-inset`.
 */
export function RouteOverlay({
  presentation = "layer",
  swipeBack = false,
  className,
  children,
  ...props
}: RouteOverlayProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const { back } = useBack();
  useSwipeBack(layerRef, back, {
    enabled: swipeBack && presentation === "layer" && !tg.isAndroid(),
    onCommit: () => tg.haptic.impact(),
  });

  return (
    <div
      ref={layerRef}
      data-slot="route-overlay"
      data-presentation={presentation}
      className={cn("fixed inset-0 z-(--z-overlay) overflow-y-auto overscroll-contain bg-bg text-text", className)}
      {...props}
    >
      {children}
    </div>
  );
}
