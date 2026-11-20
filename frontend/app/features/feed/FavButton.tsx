"use client";

import { cn, Heart } from "@homi/ui";
import { useTranslations } from "next-intl";
import { type CSSProperties, type MouseEvent, useState } from "react";

import { setFavorite } from "@/lib/actions/favorites";
import { useAction } from "@/lib/actions/useAction";
import { setFav, useSessionMap } from "@/lib/data/sessionMaps";
import { type DevFlags, devFlags } from "@/lib/flags";
import { tg } from "@/lib/telegram";
import { failed } from "@/lib/ui/feedback";

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
  /** The app's flags; tests pass overrides (`withDevFlags`). */
  flags?: DevFlags;
}

const ICON_PX = { full: 24, compact: 20, plain: 22 } as const;

/** The sparks of the burst (rad): eight rays round the heart, turned a little (legacy `BURST_ANGLES`). */
const BURST_ANGLES = Array.from({ length: 8 }, (_, index) => (index / 8) * Math.PI * 2 + 0.2);

/** The last tap on this heart: its number keys the animation, so every tap plays anew. */
interface Tap {
  count: number;
  added: boolean;
  /** The burst of an add; a failed save takes it away with the flip back. */
  burst: boolean;
}

/**
 * The heart (BR-APP-039, `03` SCR-007). A tap fills or empties it at once — medium haptic when adding, light when
 * removing — writes the choice to `favs`, where it wins over the server's flag for this launch, and sends `PUT` or
 * `DELETE` for the new state (`setFavorite`). Success keeps it; any failure restores the state before the tap, then
 * `failed()`: the error haptic and «Не получилось сохранить», as legacy since `index-CIa0Ldj2.js` (LB-APP-027).
 * Taps while the listing's save runs are ignored. The click stops at the button: the card renders the heart beside
 * its link, and an enclosing link or handler elsewhere never sees it.
 *
 * Motion (WP-39, BR-APP-117; `styles/motion.css`): every tap replays the heart — `like` when it adds, `dip` when it
 * removes — and a tap that adds also bursts into eight sparks. Both follow the tap on this button, not the state:
 * the other heart of the same listing stays still, and a failed save flips the heart back without a burst
 * (LB-APP-087). None under reduced motion; lite graphics play them, as legacy.
 */
export function FavButton({ number, favorite, variant = "overlay", size = "full", onChange, className, flags = devFlags }: FavButtonProps) {
  const t = useTranslations();
  const save = useAction(setFavorite);
  const on = useSessionMap("favs").get(number) ?? favorite;
  const [tap, setTap] = useState<Tap | null>(null);

  const press = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (pending.has(number)) {
      return;
    }
    pending.add(number);
    const next = !on;
    tg.haptic.impact(next ? "medium" : "light");
    setTap((last) => ({ count: (last?.count ?? 0) + 1, added: next, burst: next }));
    setFav(number, next);
    onChange?.(next);
    const saved = await save({ number, on: next }).then(
      (result) => result.ok,
      () => false,
    );
    pending.delete(number);
    if (!saved) {
      setTap((last) => (last === null ? last : { ...last, burst: false }));
      setFav(number, on);
      onChange?.(on);
      failed({ flags });
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
          : ["relative size-[44px] shrink-0 bg-fill", on ? "text-heart" : "text-text"],
        className,
      )}
    >
      <Heart
        key={`heart-${tap?.count ?? 0}`}
        data-fav-heart={tap === null ? undefined : tap.added ? "like" : "dip"}
        size={overlay ? ICON_PX[size] : ICON_PX.plain}
        strokeWidth={2}
        className={cn(on ? "fill-current" : overlay && "fill-[rgba(0,0,0,0.25)] [html.lite_&]:fill-[rgba(0,0,0,0.35)]")}
      />
      {tap?.burst ? (
        <span key={`burst-${tap.count}`} data-fav-burst="" aria-hidden>
          {BURST_ANGLES.map((angle) => (
            <i key={angle} style={{ "--a": `${angle}rad` } as CSSProperties} />
          ))}
        </span>
      ) : null}
    </button>
  );
}
