"use client";

import type { Translate } from "@homi/i18n/format";
import { cn } from "@homi/ui";
import { useTranslations } from "next-intl";

import type { OwnerListingView, OwnerStats } from "../normalize";
import { statusLabel } from "../status";

/** The status chip of an owner listing (BR-APP-094): glass over the cover, the text of `statusLabel`. */
export function OwnerStatusChip({ listing, now, className }: { listing: OwnerListingView; now: number; className?: string }) {
  const t = useTranslations();
  const label = statusLabel(listing, now);
  const days = label.values?.days;
  return (
    <span data-owner-status={listing.withdrawn ? "withdrawn" : listing.held ? "held" : listing.status} className={cn("glass rounded-pill px-[10px] py-[4px] text-[12px] font-semibold text-text", className)}>
      {days === undefined ? t(label.key) : t(label.key, { days: t("own.days", { n: days }) })}
    </span>
  );
}

/** «N получили по радару · N открыли · N в избранном» (SCR-057), the last only above 0. */
export function OwnerStatsLine({ stats }: { stats: OwnerStats }) {
  const t = useTranslations();
  const parts = [`${stats.sent} ${t("own.v.sent")}`, `${stats.opened} ${t("own.v.opened")}`];
  if (stats.favorites > 0) {
    parts.push(`${stats.favorites} ${t("own.v.fav")}`);
  }
  return (
    <p data-owner-stats="" className="text-[13px] text-hint">
      {parts.join(" · ")}
    </p>
  );
}

/** The market delta of a card (DEC-78): only where the server has a harvested median; its absence is not an error. */
export function PriceDelta({ stats }: { stats: OwnerStats | null }) {
  const delta = stats?.priceDelta ?? null;
  if (delta === null) {
    return null;
  }
  const rounded = Math.round(delta);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  const tone = stats?.priceTone === "good" || (stats?.priceTone == null && rounded < 0) ? "text-good" : rounded > 0 ? "text-danger" : "text-hint";
  return (
    <span data-price-delta={rounded} className={cn("rounded-pill bg-fill px-[8px] py-[2px] text-[12px] font-semibold", tone)}>
      {`${sign}${Math.abs(rounded)} %`}
    </span>
  );
}

/** The note under a withdrawn or a held listing (DEC-73): never its hold reason (default 26). */
export function ownerNote(listing: OwnerListingView, t: Translate): string | null {
  if (listing.withdrawn) {
    return t("own.withdrawnNote");
  }
  return listing.held ? t("own.review.text") : null;
}
