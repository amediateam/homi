"use client";

import { useRouter } from "next/navigation";

import { RequestCardTip } from "../signals/RequestTip";
import { OwnerListingsPage } from "./OwnerListingsPage";

/**
 * The route's copy of «Мои объявления» (WP-82): the page with the card tip of the signals (SCR-060). Each fresh
 * opening (a push from Settings or the tab tip) starts on «Актуальные» — keyed on `bfcacheId` — while Back from
 * «Отклики» and the `?focus=` replace keep the tab and the scroll.
 */
export function OwnerListingsRoute() {
  const { bfcacheId } = useRouter();
  return <OwnerListingsPage key={bfcacheId} cardTip={(listing) => <RequestCardTip listingId={listing.id} />} />;
}
