"use client";

import { Button, Spinner, X } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useRef, useState } from "react";

import { ListingCard } from "@/features/feed/ListingCard";
import type { ListingPreview } from "@/features/feed/types";
import { bffFetch } from "@/lib/api/browser";
import { useResource } from "@/lib/data/useResource";
import { tg } from "@/lib/telegram";

export interface MapSelectionCardProps {
  /** The listings of the card in track order, cheapest first, and the slot the track shows. */
  selection: { numbers: number[]; at: number };
  /** The user swiped the track to another slot. */
  onIndex(at: number): void;
  onClose(): void;
}

/** A slot: the compact card's height, so a slot without content keeps the size of its neighbours. */
const SLOT = "grid min-h-[112px] w-full shrink-0 snap-center snap-always place-items-center";

/** The preview of a listing for the card: `GET /listings/{number}?preview=1`, which records no view (WP-12). */
function previewFetcher(number: number) {
  return (signal: AbortSignal) => bffFetch<ListingPreview>(`listings/${number}`, { query: { preview: 1 }, signal });
}

/**
 * One slot (SCR-013). Off the shown slot and its neighbours (`active` false) it is an empty box of the same size that
 * reads nothing. Otherwise it reads its own preview, once while it is fresh: a centred spinner while it loads, the
 * inline «Не загрузилось — повторить» that repeats this slot's read alone when it failed (LB-APP-017), else the
 * compact `ListingCard`, whose own handler opens the listing, marks it seen and seeds the preview. The card shows
 * whatever listing the answer names: a merged duplicate answers with another number. The box stays the same element
 * either way, so the track keeps its scroll position and slot offsets as the window moves.
 */
function PreviewSlot({ number, index, active = true }: { number: number; index: number; active?: boolean }) {
  const t = useTranslations();
  const preview = useResource(active ? `listing-preview:${number}` : null, previewFetcher(number));
  const [retrying, setRetrying] = useState(false);
  if (!active) {
    return <div data-map-card-slot={index} className={SLOT} />;
  }
  const failed = preview.data === undefined && preview.status === "error" && !retrying;
  const status = preview.data !== undefined ? "success" : failed ? "error" : "loading";

  const retry = () => {
    setRetrying(true);
    void preview.refetch().finally(() => setRetrying(false));
  };

  return (
    <div data-map-card-slot={index} data-status={status} className={SLOT}>
      {preview.data !== undefined ? (
        <div className="w-full">
          <ListingCard item={preview.data} compact />
        </div>
      ) : failed ? (
        <Button variant="secondary" data-retry="" className="h-auto px-[16px] py-[10px] text-[15px]" onClick={retry}>
          {t("feed.retry", { error: t("common.loadFailed") })}
        </Button>
      ) : (
        <Spinner aria-label={t("feed.loading")} className="size-[22px] border-[2.5px] text-accent" />
      )}
    </div>
  );
}

/** The distance between two slot starts, which is how far the track scrolls per slot; `0` while not laid out. */
function slotStep(track: HTMLElement): number {
  const [first, second] = track.children;
  if (!(first instanceof HTMLElement) || !(second instanceof HTMLElement)) {
    return 0;
  }
  return second.offsetLeft - first.offsetLeft;
}

/**
 * The stack's track (SCR-013): horizontal scroll-snap with one slot per listing, each slot 88 % of the track so the
 * neighbours peek, and content only within one slot of `at` — the others are empty boxes of the same size, so only
 * the shown preview and its neighbours are read. A swipe that settles on another slot plays a light haptic and
 * reports it; a change of `at` from outside (a spread pin, WP-27 "Actions") scrolls the track there at once without
 * a report. A new track starts at the first slot (the card keys it by its numbers).
 */
function StackTrack({ numbers, at, onIndex }: { numbers: number[]; at: number; onIndex(at: number): void }) {
  const track = useRef<HTMLDivElement>(null);
  /** The slot the track is at: what the user swiped to or what `at` was scrolled to; `0` for a new track. */
  const shown = useRef(0);

  useLayoutEffect(() => {
    const element = track.current;
    if (element === null || at === shown.current) {
      return;
    }
    shown.current = at;
    const step = slotStep(element);
    if (step > 0) {
      element.scrollLeft = at * step;
    }
  }, [at]);

  const onScroll = () => {
    const element = track.current;
    const step = element === null ? 0 : slotStep(element);
    // Not laid out (a hidden route): no slot to read.
    if (element === null || step <= 0) {
      return;
    }
    const index = Math.min(numbers.length - 1, Math.max(0, Math.round(element.scrollLeft / step)));
    if (index === shown.current) {
      return;
    }
    shown.current = index;
    tg.haptic.impact();
    onIndex(index);
  };

  return (
    <div
      ref={track}
      data-scroll-x=""
      data-no-swipe=""
      onScroll={onScroll}
      className="relative flex snap-x snap-mandatory gap-[8px] overflow-x-auto overscroll-x-contain px-[6%] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {numbers.map((number, index) => (
        <PreviewSlot key={number} number={number} index={index} active={Math.abs(index - at) <= 1} />
      ))}
    </div>
  );
}

function CloseButton({ onClose }: { onClose(): void }) {
  const t = useTranslations();
  return (
    <button
      type="button"
      data-map-card-close=""
      aria-label={t("common.close")}
      onClick={onClose}
      className="grid size-[32px] flex-none place-items-center rounded-pill bg-fill text-text outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <X size={18} strokeWidth={2.25} aria-hidden />
    </button>
  );
}

/**
 * The selection card of the map (`03` SCR-013): a glass card the width of the column above the tab bar and the
 * bottom inset (z-index 31, `03` §3.6), rising in (motion.css stops it under reduced motion). One listing: its compact
 * card and a ×. Several (a stack, or a cluster at maximum zoom): the header «{n} из {total}» with the × and the track
 * of `StackTrack`. The selection is state of `MapScreen`; the card reports the slot swiped to and the ×.
 */
export function MapSelectionCard({ selection, onIndex, onClose }: MapSelectionCardProps) {
  const t = useTranslations();
  const { numbers } = selection;
  if (numbers.length === 0) {
    return null;
  }
  const at = Math.min(numbers.length - 1, Math.max(0, selection.at));
  return (
    <div
      data-map-card=""
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-h)+var(--bottom-inset)+20px)] z-(--z-map-card) mx-auto w-full max-w-(--feed-max) px-(--gutter)"
    >
      {numbers.length === 1 ? (
        <div className="glass pointer-events-auto relative animate-rise-in rounded-large p-[12px] pr-[44px] shadow-(--shadow-float)">
          <PreviewSlot number={numbers[0]} index={0} />
          <div className="absolute top-[8px] right-[8px]">
            <CloseButton onClose={onClose} />
          </div>
        </div>
      ) : (
        <div className="glass pointer-events-auto animate-rise-in rounded-large pt-[8px] pb-[12px] shadow-(--shadow-float)">
          <div data-map-card-header="" className="flex items-center justify-between gap-[8px] pr-[8px] pb-[6px] pl-[16px]">
            <span className="text-[13px] font-semibold text-hint tabular-nums">
              {t("map.stackOf", { n: at + 1, total: numbers.length })}
            </span>
            <CloseButton onClose={onClose} />
          </div>
          <StackTrack key={numbers.join(",")} numbers={numbers} at={at} onIndex={onIndex} />
        </div>
      )}
    </div>
  );
}
