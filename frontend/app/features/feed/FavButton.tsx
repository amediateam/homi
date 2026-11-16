"use client";

import { cn, Heart } from "@homi/ui";
import { useTranslations } from "next-intl";
import type { MouseEvent } from "react";

import { setFavorite } from "@/lib/actions/favorites";
import { useAction } from "@/lib/actions/useAction";
import { setFav, useSessionMap } from "@/lib/data/sessionMaps";
import { tg } from "@/lib/telegram";

/** Listings whose save is in flight, shared by every heart of a listing (the card and the listing screen). */
const pending = new Set<number>();

/** Forgets the saves in flight; tests only. */
export function resetPendingFavorites(): void {
  pending.clear();
}

export interface FavButtonProps {
  number: number;
  /** The card's state; the launch's choice in `favs` still wins over it. */
  favorite: boolean;
  /** `overlay`: over the card's photo, top right; `plain`: the round button of the listing's title row (WP-26). */
  variant?: "overlay" | "plain";
  /** Of the overlay: `compact` on the compact card (WP-27), 32 px with a 20 px heart, 4 px from the corner. */
  size?: "full" | "compact";
  /** Each state the heart shows: the new one at the tap, the old one again after a failed save. */
  onChange?: (on: boolean) => void;
  className?: string;
}

const ICON_PX = { full: 24, compact: 20, plain: 22 } as const;

/**
 * The heart (BR-APP-039, `03` SCR-007). A tap fills or empties it at once — medium haptic when adding, light when
 * removing — writes the choice to `favs`, where it wins over the server's flag for this launch, and sends `PUT` or
 * `DELETE` for the new state (`setFavorite`). Success keeps it; any failure restores the state before the tap, with
 * no text and no error haptic, as legacy. Taps while the listing's save runs are ignored. The click stops at the
 * button: the card renders the heart beside its link, and an enclosing link or handler elsewhere never sees it.
 */
export function FavButton({ number, favorite, variant = "overlay", size = "full", onChange, className }: FavButtonProps) {
  const t = useTranslations();
  const save = useAction(setFavorite);
  const on = useSessionMap("favs").get(number) ?? favorite;

  const press = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (pending.has(number)) {
      return;
    }
    pending.add(number);
    const next = !on;
    tg.haptic.impact(next ? "medium" : "light");
    setFav(number, next);
    onChange?.(next);
    const saved = await save({ number, on: next }).then(
      (result) => result.ok,
      () => false,
    );
    pending.delete(number);
    if (!saved) {
      setFav(number, on);
      onChange?.(on);
    }
  };

  const overlay = variant === "overlay";
  return (
    <button
      type="button"
      data-fav={variant}
      aria-label={t(on ? "fav.remove" : "fav.add")}
      aria-pressed={on}
      onClick={press}
      className={cn(
        "grid place-items-center rounded-pill outline-none select-none transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.88]",
        overlay
          ? [
              // Legacy's white heart over a photo: there is no colour role for it. Lite graphics drop the filter.
              "absolute z-2 drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)] [html.lite_&]:drop-shadow-none",
              size === "compact" ? "top-[4px] right-[4px] size-[32px]" : "top-[8px] right-[8px] size-[40px]",
              on ? "text-heart" : "text-[#fff]",
            ]
          : ["size-[44px] shrink-0 bg-fill", on ? "text-heart" : "text-text"],
        className,
      )}
    >
      <Heart
        size={overlay ? ICON_PX[size] : ICON_PX.plain}
        strokeWidth={2}
        className={cn(on ? "fill-current" : overlay && "fill-[rgba(0,0,0,0.25)] [html.lite_&]:fill-[rgba(0,0,0,0.35)]")}
      />
    </button>
  );
}
