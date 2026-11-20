"use client";

import type { Locale } from "@homi/config";
import type { Translate } from "@homi/i18n/format";
import { cn, Eye, ShieldCheck } from "@homi/ui";
import { useLocale, useTranslations } from "next-intl";
import { memo } from "react";

import { Link } from "@/i18n/navigation";
import { setPreview } from "@/lib/data/previewCache";
import { markSeen } from "@/lib/data/sessionMaps";
import { routes } from "@/lib/navigation/routes";

import { type BadgeTone, cardBadge } from "./badges";
import { CardAge } from "./CardAge";
import { factsLine, locationLine, priceLine } from "./cardText";
import { FavButton } from "./FavButton";
import { COMPACT_PHOTO_SIZES, PHOTO_SIZES } from "./images";
import { PhotoStrip } from "./PhotoStrip";
import type { ListingPreview } from "./types";
import { marketChipText, marketVerdict, type VerdictTone } from "./verdict";

export interface ListingCardProps {
  item: ListingPreview;
  /** The state the heart starts from; the list passes `favs` over `item.favorite` (BR-APP-039). */
  favorite?: boolean;
  /** The «viewed» eye (BR-APP-040): `seen` or the server's flag; history passes `false`. Never on a compact card. */
  viewed?: boolean;
  /**
   * One photo beside the text, the short verdict only; no badge, eye, dots or age, but a shield after the price for a
   * verified owner (the map card, WP-27).
   */
  compact?: boolean;
  /** The first photo loads at once with high priority (the first two cards of a list). */
  eager?: boolean;
  /** The network rule as the server saw it, for a server-rendered card (`Photo`); the feed's first page passes it. */
  serverSmallOnly?: boolean;
  /** Where a tap goes; the listing over the current screen by default. */
  href?: string;
  /** After the card recorded `seen` and the preview, before the router push. */
  onOpen?: (number: number, item: ListingPreview) => void;
  /** Each state the heart shows: the new one at the tap, the old one again after a failed save (`FavButton`). */
  onFavorite?: (number: number, on: boolean) => void;
}

/**
 * The text over a photo: legacy's frosted light tag, which has no colour role. Lite graphics make it solid. The
 * kinds of the pinned release (`listing-card.css`): `warn` orange, `verified` with a green shield, `quiet` grey and
 * lighter; «Ниже рынка» is the plain tag (no `.tag.good`).
 */
const TAG =
  "absolute left-[12px] z-2 rounded-pill bg-[#ffffffb8] px-[10px] py-[5px] text-[13px] font-semibold text-[#111] shadow-[0_1px_6px_#0000001f] backdrop-blur-[14px] backdrop-saturate-180 [html.lite_&]:bg-[#fff] [html.lite_&]:backdrop-filter-none";
const TAG_WARN = "bg-[#fff4e6f5] text-[#9a4a00]";
const TAG_TONE: Record<BadgeTone, string | undefined> = {
  warn: TAG_WARN,
  verified: "inline-flex items-center gap-[5px] pl-[8px]",
  quiet: "font-medium text-[#4b4f57]",
  plain: undefined,
};

/** The market chip (`03` §3.6 verdict tones); an unknown tone is drawn neutral (LB-APP-039). */
const DELTA =
  "ml-[8px] inline-block flex-none self-center rounded-pill px-[9px] py-[4px] text-[12px] leading-[1.25] font-semibold tracking-normal whitespace-nowrap";
/**
 * The heart of the compact card, beside the link: the 112 px photo is centred in the row, so its top is 50 % − 56 px,
 * and the heart sits 4 px inside its top-right corner (112 − 4 − 32 = 76 px from the left).
 */
const COMPACT_HEART = "top-[calc(50%-52px)] right-auto left-[76px]";

const DELTA_TONE: Record<VerdictTone, string> = {
  good: "bg-badge-good-bg text-badge-good",
  high: "bg-badge-high-bg text-badge-high",
  suspicious: "bg-badge-warn-bg text-badge-warn",
  check: "bg-badge-warn-bg text-badge-warn",
  same: "bg-badge-same-bg font-medium text-badge-same",
  mixed: "bg-badge-same-bg font-medium text-badge-same",
  no_repair: "bg-badge-same-bg font-medium text-badge-same",
  neutral: "bg-badge-same-bg font-medium text-badge-same",
};

/**
 * The listing card (`03` SCR-007, §2.1): the photo strip with the badge (BR-APP-026), the heart, the «viewed» eye
 * and the status text; the price line with the price-kind label and the market chip (BR-APP-027); the facts line and
 * the age; the location line (BR-APP-030). Every server string renders as text. The card is a link to the listing
 * without prefetch (a feed would request one route per card); a tap records `seen` and the preview for the listing
 * screen (WP-26) and lets the router push. The heart sits beside the link, over the photo: a button inside a link
 * is not allowed and would join the link's name. Cards after the first two skip rendering while off screen
 * (`content-visibility`, 420 px; 360 px for every full card under lite). That containment clips whatever is drawn
 * outside the link's box, so the focus ring is the article's, lit while its one link has keyboard focus.
 */
export const ListingCard = memo(function ListingCard({
  item,
  favorite = item.favorite,
  viewed = item.viewed,
  compact = false,
  eager = false,
  serverSmallOnly,
  href,
  onOpen,
  onFavorite,
}: ListingCardProps) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const translate: Translate = (key, values) => t(key as never, values as never);
  const price = priceLine(item, translate);
  const verdict = marketVerdict(item, locale, translate);
  const badge = compact ? null : cardBadge(item);
  const location = locationLine(item, locale, translate);

  const open = () => {
    markSeen(item.number);
    setPreview(item.number, item);
    onOpen?.(item.number, item);
  };

  return (
    <article
      data-card={compact ? undefined : ""}
      data-listing={item.number}
      className={cn(
        "relative has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring",
        compact ? "rounded-small" : "rounded-photo",
        !compact && !eager && "[contain-intrinsic-size:auto_420px] [content-visibility:auto]",
      )}
    >
      <Link
        href={href ?? routes.listing(item.number)}
        prefetch={false}
        scroll={false}
        onClick={open}
        className={cn(
          "block outline-none",
          compact ? "grid grid-cols-[112px_1fr] items-center gap-[12px] rounded-small" : "rounded-photo",
        )}
      >
        <div
          className={cn(
            "relative isolate overflow-hidden bg-fill",
            compact ? "aspect-square rounded-small" : "aspect-[4/3] rounded-photo",
          )}
        >
          <PhotoStrip
            photos={compact ? item.photos.preview.slice(0, 1) : item.photos.preview}
            dots={!compact}
            video={item.has_video}
            sizes={compact ? COMPACT_PHOTO_SIZES : PHOTO_SIZES}
            eager={eager}
            serverSmallOnly={serverSmallOnly}
          />
          {badge ? (
            <span data-badge={badge.kind} data-badge-tone={badge.tone} className={cn(TAG, "top-[12px]", TAG_TONE[badge.tone])}>
              {badge.tone === "verified" ? (
                <ShieldCheck size={15} strokeWidth={2.4} aria-hidden className="flex-none text-[#16a34a]" />
              ) : null}
              {t(badge.key)}
            </span>
          ) : null}
          {viewed && !compact ? (
            <span
              role="img"
              data-viewed=""
              aria-label={t("card.viewedTitle")}
              title={t("card.viewedTitle")}
              className="absolute right-[12px] bottom-[12px] z-2 grid size-[32px] place-items-center rounded-pill bg-[#ffffffb8] text-[#111] shadow-[0_1px_6px_#0000001f] backdrop-blur-[14px] backdrop-saturate-180 [html.lite_&]:bg-[#fff] [html.lite_&]:backdrop-filter-none"
            >
              <Eye size={17} strokeWidth={2} aria-hidden />
            </span>
          ) : null}
          {item.status_text ? (
            <span data-status="" className={cn(TAG, TAG_WARN, "bottom-[12px] [html.lite_&]:bg-[#fff4e6]")}>
              {item.status_text}
            </span>
          ) : null}
        </div>
        <div className={cn("flex flex-col gap-[2px]", compact ? "min-w-0" : "pt-[12px]")}>
          <div
            data-price=""
            className={cn(
              "flex flex-wrap items-baseline gap-x-[3px] gap-y-[4px] text-[15px] text-hint",
              compact && "whitespace-nowrap",
            )}
          >
            <b className={cn("leading-[1.1] font-bold tracking-[-0.04em] text-text", compact ? "text-[22px]" : "text-[28px]")}>
              {price.amount}
            </b>
            {price.period ? <span>{price.period}</span> : null}
            {price.kind ? <span>· {price.kind}</span> : null}
            {verdict ? (
              <span data-tone={verdict.tone} className={cn(DELTA, DELTA_TONE[verdict.tone])}>
                {compact ? verdict.short : marketChipText(verdict, translate)}
              </span>
            ) : null}
            {compact && item.owner_verified ? (
              <span
                role="img"
                data-verified=""
                aria-label={t("card.ownerVerified")}
                title={t("card.ownerVerified")}
                className="ml-[4px] inline-grid flex-none self-center text-good"
              >
                <ShieldCheck size={16} strokeWidth={2.4} aria-hidden />
              </span>
            ) : null}
          </div>
          <div
            data-facts=""
            className={cn("mt-[4px] flex items-baseline gap-[8px] font-medium", compact ? "text-[14px]" : "text-[15px]")}
          >
            <span className={cn("min-w-0 flex-1", compact && "line-clamp-2")}>{factsLine(item, locale, translate)}</span>
            {compact ? null : <CardAge item={item} />}
          </div>
          {location ? (
            <p data-location="" className={cn("truncate text-hint", compact ? "text-[13px]" : "text-[14px]")}>
              {location}
            </p>
          ) : null}
        </div>
      </Link>
      <FavButton
        number={item.number}
        favorite={favorite}
        size={compact ? "compact" : "full"}
        onChange={onFavorite && ((on) => onFavorite(item.number, on))}
        className={compact ? COMPACT_HEART : undefined}
      />
    </article>
  );
});
