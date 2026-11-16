"use client";

import { cn, Play } from "@homi/ui";
import { type UIEvent, useState } from "react";

import { Photo, PhotoBackdrop, PhotoPlaceholder } from "./Photo";

export interface PhotoStripProps {
  /** The addresses of `photos.preview`: the strip can show only these, so the dots count them, not `photos.count`. */
  photos: readonly string[];
  /** Dots when there is more than one photo (the full card; not the compact one). */
  dots?: boolean;
  /** The listing has a video: ▶ over the strip, each photo framed on its blurred copy (legacy `vframe`). */
  video?: boolean;
  /** `sizes` of every photo. */
  sizes?: string;
  /** The first photo loads at once with high priority (the first two cards). */
  eager?: boolean;
  /** The network rule as the server saw it, for the server and hydration renders (`Photo`). */
  serverSmallOnly?: boolean;
}

/**
 * The photo strip of a card (`03` SCR-007, BR-APP-059): horizontal scroll-snap, one photo per slide. Slides mount
 * lazily: the first at once, then each one seen and the one after it; a pointer-down mounts the next, so it starts
 * loading before the swipe. `data-scroll-x` and `data-no-swipe` keep a sideways swipe inside the strip (swipe back,
 * sheet drag). No photos → the placeholder. The overlays are positioned by the card's photo box. A slide is keyed by
 * its address too: a new address (a re-signed one after a refresh) is a new photo, not the failed one again.
 */
export function PhotoStrip({ photos, dots = false, video = false, sizes, eager = false, serverSmallOnly }: PhotoStripProps) {
  const [active, setActive] = useState(0);
  const [mountedUpTo, setMountedUpTo] = useState(0);
  const mountNextAfter = (index: number) =>
    setMountedUpTo((upTo) => Math.max(upTo, Math.min(index + 1, photos.length - 1)));

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const strip = event.currentTarget;
    // Not laid out (hidden route, tests): no slide index to read.
    if (strip.clientWidth === 0) {
      return;
    }
    const index = Math.round(strip.scrollLeft / strip.clientWidth);
    setActive(index);
    mountNextAfter(index);
  };

  if (photos.length === 0) {
    return <PhotoPlaceholder />;
  }
  return (
    <>
      <div
        data-scroll-x=""
        data-no-swipe=""
        onScroll={onScroll}
        onPointerDown={() => mountNextAfter(active)}
        className="flex size-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {photos.map((src, index) => (
          <div
            key={`${index}:${src}`}
            data-slide={index}
            className={cn("relative h-full w-full shrink-0 snap-center snap-always", video && "overflow-hidden bg-[#000]")}
          >
            {index <= mountedUpTo ? (
              <>
                {video ? <PhotoBackdrop src={src} eager={eager && index === 0} /> : null}
                <Photo
                  src={src}
                  sizes={sizes}
                  eager={eager && index === 0}
                  fit={video ? "contain" : "cover"}
                  serverSmallOnly={serverSmallOnly}
                />
              </>
            ) : null}
          </div>
        ))}
      </div>
      {/* A mark, not a control: the card's link opens the listing, not the video. Hidden from assistive technology, as
          legacy's role-less label was; «Смотреть видео в Telegram» belongs to the listing screen's button (WP-26). */}
      {video ? (
        <span data-video="" aria-hidden className="pointer-events-none absolute inset-0 z-2 grid place-items-center">
          {/* Legacy's light disc over a photo: there is no colour role for it. Lite graphics make it solid. */}
          <span className="grid size-[48px] place-items-center rounded-pill bg-[#ffffffc7] text-[#111] shadow-[0_2px_12px_#00000040] backdrop-blur-[14px] backdrop-saturate-180 [html.lite_&]:bg-[#fff] [html.lite_&]:backdrop-filter-none">
            <Play size={20} fill="currentColor" strokeWidth={0} className="ml-[3px]" aria-hidden />
          </span>
        </span>
      ) : null}
      {dots && photos.length > 1 ? (
        <div data-dots="" aria-hidden className="pointer-events-none absolute inset-x-0 bottom-[10px] z-2 flex justify-center gap-[5px]">
          {photos.map((_, index) => (
            <span
              key={index}
              data-on={index === active ? "" : undefined}
              className={cn(
                "size-[6px] rounded-pill bg-[#ffffff99] shadow-[0_0_2px_#0000004d] transition-[transform,background-color] duration-200",
                index === active && "scale-[1.2] bg-[#fff]",
              )}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}
