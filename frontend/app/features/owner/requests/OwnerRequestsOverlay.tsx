"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { useListingNumber, useListingRecord } from "@/features/listing/useListing";
import { SubPage } from "@/features/shell/SubPage";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";

import { RequestList } from "./RequestList";

/**
 * «Отклики» over the user's own listing (WP-82, SCR-058), opened from its owner panel at `/listing/<number>/requests`:
 * a full-screen layer at `--z-owner-bar` inside the listing layer, with its own Back to the listing. The owner
 * listing's id is the card's `owner.listing_id`; a card without one (not the user's, or not his any more) sends the
 * address back to the listing.
 */
export function OwnerRequestsOverlay() {
  const t = useTranslations();
  const number = useListingNumber();
  const { details } = useListingRecord(number);
  const listingId = details?.owner?.mine === true ? (details.owner.listing_id ?? null) : null;
  const known = details !== null;

  useEffect(() => {
    if (known && listingId === null && number !== null) {
      nav.replace(routes.listing(number));
    }
  }, [known, listingId, number]);

  return (
    <SubPage data-route="owner/requests" title={t("own.requests")} bare className="z-(--z-owner-bar)">
      {listingId === null ? null : <RequestList listingId={listingId} />}
    </SubPage>
  );
}
