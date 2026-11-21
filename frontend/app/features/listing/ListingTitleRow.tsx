"use client";

import { Ellipsis, Share } from "@homi/ui";
import { useTranslations } from "next-intl";

import { FavButton } from "@/features/feed/FavButton";
import { tg } from "@/lib/telegram";

export interface ListingTitleRowProps {
  number: number;
  /** The contract's short title, rendered whole; empty → no heading. */
  title: string;
  /** «district · landmark» (`placeLine`), or `null`. */
  place: string | null;
  favorite: boolean;
  /** Set only when a share link can be built (a bot name is known); the share hook plays its own haptic. */
  onShare?: () => void;
  onMenu: () => void;
  /** The user's own listing (WP-82, BR-APP-103): only «Поделиться» — no heart, no «⋯». */
  mine?: boolean;
}

const ROUND = "grid size-[44px] shrink-0 place-items-center rounded-pill bg-fill text-text outline-none select-none transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.88]";

/**
 * The title row (SCR-018 block 3): the title and «district · landmark», then share, the heart and «⋯» in legacy's
 * order. «⋯» plays the light haptic and opens the actions sheet.
 */
export function ListingTitleRow({ number, title, place, favorite, onShare, onMenu, mine = false }: ListingTitleRowProps) {
  const t = useTranslations();
  return (
    <div data-title-row="" className="flex items-start gap-[12px]">
      <div className="min-w-0 flex-1 pt-[4px]">
        {title ? (
          <h1 data-listing-title="" className="text-[22px] leading-[1.25] font-bold tracking-[-0.02em] text-text">
            {title}
          </h1>
        ) : null}
        {place ? (
          <p data-listing-place="" className="mt-[4px] text-[15px] text-hint">
            {place}
          </p>
        ) : null}
      </div>
      <div className="flex flex-none gap-[8px]">
        {onShare ? (
          <button type="button" data-action="share" aria-label={t("listing.share")} onClick={onShare} className={ROUND}>
            <Share size={20} strokeWidth={2} aria-hidden />
          </button>
        ) : null}
        {mine ? null : <FavButton variant="plain" number={number} favorite={favorite} />}
        {mine ? null : (
        <button
          type="button"
          data-action="menu"
          aria-label={t("actions.menu")}
          onClick={() => {
            tg.haptic.impact("light");
            onMenu();
          }}
          className={ROUND}
        >
          <Ellipsis size={22} strokeWidth={2} aria-hidden />
        </button>
        )}
      </div>
    </div>
  );
}
