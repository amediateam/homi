"use client";

import { labelFor } from "@homi/i18n";
import type { Translate } from "@homi/i18n/format";
import { cn } from "@homi/ui";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { thumbUrl } from "@/features/feed/images";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { useReference } from "@/lib/reference/useReference";
import { tg } from "@/lib/telegram";

import type { OwnerListingView, OwnerStats } from "../normalize";
import { statusLabel } from "../status";
import { useOwnerEnabled } from "../store";
import { placeText, priceText } from "./cardText";
import { OwnerActions } from "./OwnerActions";
import type { StatusChange } from "./useStatusAction";

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

/**
 * A card of «Мои объявления» (WP-82, SCR-057): the cover with the glass status chip and the red «N новых откликов»
 * chip, the price with «/мес» and the market delta, «rooms · district», the stats line of a published listing, the
 * withdrawn or held note, a rejected listing's reason line (DEV-056), and the actions. A tap on the card (light haptic;
 * not on its buttons): a draft opens the form (only while the cabinet is on, DEC-81), a published listing its public
 * page; anything else does nothing. `tip` is the card tip of SCR-060 when this card carries it.
 */
export function OwnerListingCard({
  listing,
  now,
  busy,
  onChange,
  tip,
}: {
  listing: OwnerListingView;
  now: number;
  busy: boolean;
  onChange: (change: StatusChange) => void;
  tip?: ReactNode;
}) {
  const t = useTranslations();
  const translate: Translate = (key, values) => t(key as never, values as never);
  const { findCity, ownerListingsLimit } = useReference();
  const cabinetOn = useOwnerEnabled();
  const cover = listing.photos[0] ?? null;
  const price = priceText(listing.form, translate);
  const pending = listing.stats?.pending ?? 0;
  const note = ownerNote(listing, translate);
  const opens = (listing.status === "draft" && cabinetOn) || (listing.status !== "draft" && listing.number !== null && !listing.withdrawn);

  const open = () => {
    if (!opens) {
      return;
    }
    tg.haptic.impact("light");
    nav.push(listing.status === "draft" ? routes.ownerForm(listing.id) : routes.listing(listing.number!));
  };

  return (
    <article data-owner-card={listing.id} className="relative overflow-hidden rounded-[16px] bg-fill">
      {tip}
      <div
        role={opens ? "button" : undefined}
        tabIndex={opens ? 0 : undefined}
        onClick={open}
        onKeyDown={(event) => {
          if (opens && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            open();
          }
        }}
        className={cn("block w-full text-left", opens ? "cursor-pointer" : "")}
      >
        <div className="relative aspect-[16/9] bg-bg2">
          {cover === null ? null : (
            // eslint-disable-next-line @next/next/no-img-element -- the owner's own photo from a private, temporary URL
            <img src={thumbUrl(cover.url)} alt="" className="size-full object-cover" />
          )}
          <OwnerStatusChip listing={listing} now={now} className="absolute top-[10px] left-[10px]" />
          {pending > 0 ? (
            <span data-owner-new-requests={pending} className="absolute top-[10px] right-[10px] rounded-pill bg-danger px-[10px] py-[4px] text-[12px] font-semibold text-white">
              {t("own.v.newRequests", { n: pending })}
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-[4px] p-[12px]">
          {price === null ? null : (
            <p className="flex items-center gap-[8px] text-[18px] font-bold text-text">
              <span>
                {price}
                <span className="text-[14px] font-normal text-hint">{t("own.perMonth")}</span>
              </span>
              <PriceDelta stats={listing.stats} />
            </p>
          )}
          <p className="text-[14px] text-text">{placeText(listing.form, findCity, translate)}</p>
          {listing.status !== "draft" && listing.stats !== null ? <OwnerStatsLine stats={listing.stats} /> : null}
          {note === null ? null : <p data-owner-note="" className="text-[13px] leading-[1.4] text-hint">{note}</p>}
          {listing.status === "rejected" ? (
            <p data-owner-reason={listing.rejectReason ?? "denied"} className="text-[13px] leading-[1.4] text-danger">
              {t(labelFor("rejectedReason", listing.rejectReason ?? "denied"), { max: ownerListingsLimit })}
            </p>
          ) : null}
        </div>
      </div>
      <div className="px-[12px] pb-[12px]">
        <OwnerActions listing={listing} place="card" busy={busy} onChange={onChange} onRequests={() => nav.push(routes.ownerRequests(listing.id))} />
      </div>
    </article>
  );
}
