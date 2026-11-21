"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import type { ListingDetails } from "@/features/listing/listingData";

import { PriceDelta } from "../lists/parts";
import { normalizeOwnerListing } from "../normalize";
import { useOwnerListing } from "../store";

/**
 * «Цена» of the user's own listing (WP-82, BR-APP-103), after «Факты» and above the market block: the main price and
 * its period, the market delta of the owner listing where the server has a median (DEC-78), and the price notes.
 */
export function OwnerPriceSection({ details, ownerId }: { details: ListingDetails; ownerId: string | null }) {
  const t = useTranslations();
  const resource = useOwnerListing(ownerId);
  const stats = useMemo(() => (resource.data === undefined ? null : (normalizeOwnerListing(resource.data)?.stats ?? null)), [resource.data]);
  const price = details.price;
  return (
    <section data-owner-price="" className="flex flex-col gap-[6px] px-[16px] py-[16px]">
      <h2 className="text-[17px] font-bold text-text">{t("own.price")}</h2>
      {price === null ? (
        <p className="text-[18px] font-bold text-text">{t("listing.negotiable")}</p>
      ) : (
        <p className="flex items-center gap-[8px] text-text">
          <span>
            <b className="text-[22px] leading-[1.1] font-bold tracking-[-0.04em]">{price.display}</b>
            {price.period ? <span className="text-[15px] text-hint">{price.period}</span> : null}
          </span>
          <PriceDelta stats={stats} />
        </p>
      )}
      {price !== null && price.notes.length > 0 ? <p className="text-[13px] text-hint">{price.notes.join(" · ")}</p> : null}
    </section>
  );
}
