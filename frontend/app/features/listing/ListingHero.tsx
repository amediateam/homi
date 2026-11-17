"use client";

import { Play } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { PhotoPlaceholder } from "@/features/feed/Photo";
import { PhotoStrip } from "@/features/feed/PhotoStrip";
import { tg } from "@/lib/telegram";

export interface ListingHeroProps {
  /** The preview's photos while the answer is pending, then the full set. */
  photos: readonly string[];
  /** M of «N / M»: the preview's `photos.count` while pending, then the length of the full set (D-24). */
  total: number;
  video: boolean;
  initialIndex: number;
  onActiveChange: (index: number) => void;
  /** After the light haptic of a slide or video tap. */
  onOpenPhoto: (index: number) => void;
  /** Set only with the answer loaded, the post not deleted and its address known: then a tap opens the post. */
  onOpenVideo?: () => void;
  /** The accessible name of a tappable slide. */
  photoLabel: string;
}

const HERO_PHOTO_SIZES = "(min-width: 608px) 608px, 100vw";

/**
 * The hero (SCR-018 block 1): the photo strip of the card in a 4:3 box under Telegram's header, the counter «N / M»
 * when the strip has more than one photo, and «Смотреть видео в Telegram» under the strip's ▶ for a video. A tap
 * plays the light haptic (also when it then opens the post), then opens the viewer at that photo, or the post of a
 * video whose answer is loaded. The hero never follows the viewer: it stays on the photo it showed. No photos → the
 * placeholder alone.
 */
export function ListingHero({ photos, total, video, initialIndex, onActiveChange, onOpenPhoto, onOpenVideo, photoLabel }: ListingHeroProps) {
  const t = useTranslations();
  const [active, setActive] = useState(() => Math.min(Math.max(0, initialIndex), Math.max(0, photos.length - 1)));

  const open = (index: number) => {
    tg.haptic.impact("light");
    if (onOpenVideo) {
      onOpenVideo();
    } else {
      onOpenPhoto(index);
    }
  };

  return (
    <div data-hero="" className="relative isolate mx-auto aspect-[4/3] w-full max-w-[608px] overflow-hidden bg-fill">
      {photos.length === 0 ? (
        <PhotoPlaceholder />
      ) : (
        <PhotoStrip
          photos={photos}
          video={video}
          sizes={HERO_PHOTO_SIZES}
          eager
          initialIndex={initialIndex}
          onActiveChange={(index) => {
            setActive(index);
            onActiveChange(index);
          }}
          onPhotoTap={open}
          tapLabel={photoLabel}
        />
      )}
      {photos.length > 1 ? (
        <span
          data-hero-counter=""
          className="pointer-events-none absolute right-[12px] bottom-[12px] z-2 rounded-pill bg-[#00000080] px-[10px] py-[4px] text-[13px] font-semibold text-[#fff] tabular-nums"
        >
          {active + 1} / {total}
        </span>
      ) : null}
      {video ? (
        <button
          type="button"
          data-hero-video=""
          onClick={() => open(active)}
          className="absolute inset-x-0 top-[calc(50%+36px)] z-3 mx-auto flex w-fit items-center gap-[8px] rounded-pill bg-[#000000a6] px-[16px] py-[10px] text-[15px] font-semibold text-[#fff] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Play size={16} fill="currentColor" strokeWidth={0} aria-hidden />
          {t("listing.watchVideo")}
        </button>
      ) : null}
    </div>
  );
}
