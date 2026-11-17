"use client";

import { cn, useBodyClass, X } from "@homi/ui";
import { useTranslations } from "next-intl";
import { type UIEvent, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { ZoomableImage } from "./ZoomableImage";

export interface PhotoViewerProps {
  /** The full set once the answer is there, the preview's photos before; may grow while open. */
  photos: readonly string[];
  /** The photo to show (the address's `i`), positioned before the first paint. */
  index: number;
  /** Each photo the user pages to; the route writes it into the address. */
  onIndexChange: (index: number) => void;
  /** ×, Escape and the swipe-down close. */
  onClose: () => void;
}

const subscribeNothing = () => () => {};

/**
 * The photo viewer (WP-26, SCR-020): a black full-screen dialog «Фото» in a portal at the end of `body` (z 100, above
 * the sheets and the toast), with a horizontal snap strip of `ZoomableImage` slides, the counter «N / M» for more
 * than one photo and the ×. The strip is positioned at `index` before the first paint, again when the viewer is
 * shown again (a cached route) and while the user has not paged yet, so a photo set that grows while open (preview →
 * full set) still opens at the asked photo; after a page the strip's own scroll is the truth. A slide and its
 * neighbours hold an image; the strip is locked while the shown photo is zoomed. A swipe down fades the background
 * and the bar through `--drag` (alpha `1 − drag`, bar `1 − 3 × drag`). While open, `body` carries `locked`; the
 * dialog takes the focus and gives it back on close. The opening fades in over 0.2 s (legacy `viewer-in`), not under
 * reduced motion.
 */
export function PhotoViewer({ photos, index, onIndexChange, onClose }: PhotoViewerProps) {
  const t = useTranslations();
  const mounted = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  /** The photo the user paged to; `null` until a page, and again once the viewer was hidden. */
  const [paged, setPaged] = useState<number | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const last = Math.max(0, photos.length - 1);
  const active = Math.min(paged ?? index, last);
  useBodyClass("locked");

  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (strip !== null && paged === null) {
      strip.scrollLeft = Math.min(index, last) * strip.clientWidth;
    }
  }, [mounted, paged, index, last]);

  // Hidden with a cached route: shown again, it opens at the address's photo, with no fade left from the swipe that
  // closed it (the slide's own reset runs once this root's ref is already detached).
  useLayoutEffect(() => () => setPaged(null), []);
  useLayoutEffect(() => {
    rootRef.current?.style.removeProperty("--drag");
  }, [mounted]);

  useLayoutEffect(() => {
    if (!mounted) {
      return undefined;
    }
    const before = document.activeElement;
    rootRef.current?.focus({ preventScroll: true });
    return () => {
      if (before instanceof HTMLElement && before !== document.body && before.isConnected) {
        before.focus({ preventScroll: true });
      }
    };
  }, [mounted]);

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const strip = event.currentTarget;
    // Not laid out (tests): no slide index to read.
    if (strip.clientWidth === 0) {
      return;
    }
    const next = Math.min(Math.max(0, Math.round(strip.scrollLeft / strip.clientWidth)), last);
    if (next !== active) {
      setPaged(next);
      onIndexChange(next);
    }
  };

  const onDrag = (progress: number) => rootRef.current?.style.setProperty("--drag", String(progress));

  if (!mounted) {
    return null;
  }
  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("viewer.title")}
      data-route="listing/photos"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
      className="fixed inset-0 z-(--z-viewer) animate-[fade_0.2s_ease-out_both] text-[#fff] outline-none"
      // Black that fades with the swipe-down close.
      style={{ background: "rgb(0 0 0 / calc(1 - var(--drag, 0)))" }}
    >
      <div
        ref={stripRef}
        data-viewer-strip=""
        data-scroll-x=""
        data-no-swipe=""
        onScroll={onScroll}
        className={cn(
          "flex size-full snap-x snap-mandatory overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          zoomed ? "overflow-x-hidden" : "overflow-x-auto overscroll-x-contain",
        )}
      >
        {photos.map((src, slide) => (
          <div key={`${slide}:${src}`} data-viewer-slide={slide} className="relative size-full shrink-0 snap-center snap-always">
            {Math.abs(slide - active) <= 1 ? (
              <ZoomableImage src={src} active={slide === active} onZoom={setZoomed} onDrag={onDrag} onClose={onClose} />
            ) : null}
          </div>
        ))}
      </div>
      <div
        data-viewer-bar=""
        className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-[12px] px-(--gutter) pt-[calc(8px+var(--top-inset))] pb-[8px]"
        style={{ opacity: "max(0, 1 - 3 * var(--drag, 0))" }}
      >
        {photos.length > 1 ? (
          <span data-viewer-counter="" className="text-[15px] font-semibold tabular-nums [text-shadow:0_1px_4px_#00000080]">
            {active + 1} / {photos.length}
          </span>
        ) : null}
        <button
          type="button"
          data-viewer-close=""
          aria-label={t("common.close")}
          onClick={onClose}
          className="pointer-events-auto ml-auto grid size-[36px] place-items-center rounded-pill bg-[#ffffff26] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X size={20} strokeWidth={2.25} aria-hidden />
        </button>
      </div>
    </div>,
    document.body,
  );
}
