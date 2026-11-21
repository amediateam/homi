"use client";

import type { Locale } from "@homi/config";
import { formatResponseTime } from "@homi/i18n/format";
import { Button, ShieldCheck } from "@homi/ui";
import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";

import { RouteSheet } from "@/features/shell/RouteSheet";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { useBack } from "@/lib/navigation/useBack";
import { useCloseOnce } from "@/lib/navigation/useCloseOnce";

import type { ListingDetails } from "../listingData";
import { useListingNumber, useListingRecord } from "../useListing";
import { infoPoints } from "./ownerTier";

/**
 * «Проверенный хозяин» (WP-83, SCR-062, DEC-77): the shield, the title, the points of `infoPoints` and the foot;
 * «Понятно», the backdrop, a drag and Back close it. The shield draws in after 0.25 s (static in lite and under reduced
 * motion, `motion.css`).
 */
export function OwnerInfoSheet({ details }: { details: ListingDetails }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const { back } = useBack();
  const close = useCloseOnce(back);
  const minutes = details.owner?.response_minutes ?? null;
  const { points, foot } = infoPoints(details, minutes === null ? null : formatResponseTime(minutes, locale));
  return (
    <RouteSheet presentation="layer" variant="compact" title={t("owner.verified")} onClose={close}>
      <div data-route="listing/owner" className="flex flex-col gap-[12px] px-(--gutter) pb-[8px]">
        <ShieldCheck size={48} aria-hidden className="animate-shield-in self-center text-badge-good" />
        <ul className="flex flex-col gap-[8px]">
          {points.map((point) => (
            <li key={point.key} data-owner-point={point.key} className="text-[15px] leading-[1.45] text-text">
              {t(point.key, point.values)}
            </li>
          ))}
        </ul>
        <p data-owner-foot={foot} className="text-[13px] leading-[1.4] text-hint">
          {t(foot)}
        </p>
        <Button data-action="ok" onClick={close} className="h-[48px] w-full">
          {t("owner.info.ok")}
        </Button>
      </div>
    </RouteSheet>
  );
}

/**
 * `/listing/<number>/owner` in both trees: only with the full card and the tiers `self` and `verified`; otherwise the
 * address is replaced by the listing's.
 */
export function OwnerInfoRoute() {
  const number = useListingNumber();
  const { details } = useListingRecord(number);
  const tier = details?.owner?.tier ?? null;
  const allowed = details !== null && (tier === "self" || tier === "verified") && details.is_owner !== false;
  useEffect(() => {
    if (details !== null && !allowed && number !== null) {
      nav.replace(routes.listing(number));
    }
  }, [allowed, details, number]);
  return details !== null && allowed ? <OwnerInfoSheet details={details} /> : null;
}
