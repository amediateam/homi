"use client";

import dynamic from "next/dynamic";

import { useListingNumber, useListingRecord } from "../useListing";

const MarketSheet = dynamic(() => import("./MarketSheet").then((module) => module.MarketSheet), { ssr: false });

/**
 * The market sheet at `/listing/{number}/market` (WP-26, SCR-022), loaded with `next/dynamic` on the client only, in
 * both route trees: it reads the listing's resource without reading itself, so it shows a skeleton until the
 * listing's answer is there.
 */
export function MarketSheetRoute() {
  const { details } = useListingRecord(useListingNumber());
  return <MarketSheet details={details} />;
}
