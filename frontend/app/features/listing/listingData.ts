import type { components } from "@homi/types";

import type { ListingPreview } from "@/features/feed/types";
import { failureOf } from "@/lib/api/errors";
import type { ApiResult } from "@/lib/api/types";
import type { DataSource } from "@/lib/data/sources";

/**
 * The data of the listing screen (WP-26): the contract types it reads, the resource record and the few helpers the
 * server part and the client part share. No `"use client"`: `ListingServer` imports it too.
 */

export type { ListingPreview } from "@/features/feed/types";

/** The full answer of `GET /listings/{number}`. */
export type ListingDetails = components["schemas"]["ListingDetailsResource"];
/** The 200 of `v1.listings.show` is a union in the contract: the details, or a preview body. */
export type ListingShowData = ListingDetails | ListingPreview;
export type ListingFact = components["schemas"]["ListingFactResource"];
export type ListingNearby = components["schemas"]["ListingNearbyResource"];
export type ListingOffer = components["schemas"]["ListingOfferResource"];
export type ListingSourceLink = components["schemas"]["ListingSourceLinkResource"];
/** One price history event; `change_pct` is a percent (`-7.4` = −7.4 %), not a fraction. */
export type PriceEvent = components["schemas"]["PriceEventResource"];
export type ListingComparison = NonNullable<ListingDetails["comparison"]>;
export type ListingAuthor = NonNullable<ListingDetails["author"]>;
export type ContactData = components["schemas"]["ContactResource"];
export type TranslationData = components["schemas"]["TranslationResource"];
export type PreparedShare = components["schemas"]["PreparedShareResource"];
export type BlockedAuthorResult = components["schemas"]["BlockedAuthorResultResource"];
export type ReportResult = components["schemas"]["ReportResultResource"];
export type ReportReason = components["schemas"]["StoreReportRequest"]["reason"];
export type ReportDetail = NonNullable<components["schemas"]["StoreReportRequest"]["detail"]>;

/** The resource value of `listingKey(number)`: `useResource` keeps only `data`, so `meta.source` rides along. */
export interface ListingRecord {
  listing: ListingDetails;
  source?: DataSource;
}

/** What `ListingServer` passes down; serialisable. */
export type ListingInitial = ApiResult<ListingRecord>;

const SEPARATOR = " · ";

/** The resource key of a listing: a string, so the feed's and the listing's keys never collide. */
export function listingKey(number: number): string {
  return `listing:${number}`;
}

/** Only the details carry `facts`; the preview has none. */
export function isListingDetails(data: ListingShowData): data is ListingDetails {
  return "facts" in data;
}

/**
 * A show answer as a record. A preview body is never asked for (the screen reads the details), so it counts as a
 * server failure rather than a screen without its sections; a failure is passed on as it is.
 */
export function toRecord(result: ApiResult<ListingShowData>): ApiResult<ListingRecord> {
  if (!result.ok) {
    return result;
  }
  if (!isListingDetails(result.data)) {
    return failureOf({ method: "GET", path: "listings/:number" }, { status: 500 });
  }
  const { source } = result.meta;
  return { ok: true, data: { listing: result.data, ...(source === undefined ? {} : { source }) }, meta: result.meta };
}

/**
 * «district · landmark» of the title row and the location block (legacy). The contract sends `place` when the
 * district is unknown, so it stands in for the district; a missing part is left out, `null` when nothing is known.
 */
export function placeLine(item: Pick<ListingPreview, "district" | "place" | "landmark">): string | null {
  return [item.district?.name ?? item.place, item.landmark].filter(Boolean).join(SEPARATOR) || null;
}
