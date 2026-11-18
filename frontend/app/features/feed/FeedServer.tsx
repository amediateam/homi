import { headers } from "next/headers";

import { serverApi } from "@/lib/api/server";
import { isLowEndDevice } from "@/lib/device";
import { addressCity, readSearchState } from "@/lib/search/readSearchState";
import { getSessionToken } from "@/lib/session/server";

import { FeedScreen, type FeedScreenProps } from "./FeedScreen";
import { FIRST_VERSION, feedListKey, feedQuery } from "./feedQuery";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The photos of the server's page one take the small variant only (BR-APP-059): the request says `Save-Data: on`, or
 * Telegram for Android names a performance class below `HIGH` in its User-Agent. What only the browser knows (a lite
 * choice in storage, a slow connection, the cores and memory of the device) applies from hydration on.
 */
export async function smallPhotosOnly(): Promise<boolean> {
  const request = await headers();
  return request.get("save-data")?.trim().toLowerCase() === "on" || isLowEndDevice({ userAgent: request.get("user-agent") ?? "" });
}

/**
 * Page one with the session cookie (DEC-44, `25` §3.4), or `null`. It is read for the search the browser's first two
 * renders list, because only a page one of that key is adopted (`useCursorFeed`). An address that names its city
 * gives it; without one the city is the profile's (BR-APP-010), so `/me` is read first and its city goes to the
 * screen as `profileCity`, which both early renders take while the session does not know `me` yet. No `/me`, or a
 * profile without a city, leaves page one to the browser, as does a request without the cookie (header mode, the
 * first request of a launch) and an `unauthorized` answer: the browser asks once the bootstrap has signed in again
 * (WP-21). Any other failure is passed on, not thrown: the list shows its error state and «Повторить» asks the
 * browser.
 */
export async function readFirstPage(searchParams: SearchParams): Promise<FeedScreenProps> {
  const serverSmallOnly = await smallPhotosOnly();
  if ((await getSessionToken()) === null) {
    return { initial: null, serverSmallOnly };
  }
  const api = await serverApi();
  let profileCity: string | undefined;
  if (addressCity(searchParams) === null) {
    const me = await api.me();
    if (!me.ok || !me.data.city) {
      return { initial: null, serverSmallOnly };
    }
    profileCity = me.data.city;
  }
  const { filters, sort } = readSearchState(searchParams, { city: profileCity });
  const result = await api.listings(feedQuery(filters, sort));
  if (!result.ok && result.error === "unauthorized") {
    return { initial: null, serverSmallOnly, profileCity };
  }
  return { initial: { key: feedListKey(filters, sort, FIRST_VERSION), result }, serverSmallOnly, profileCity };
}

/**
 * The part of the search list that reads the cookie and the address, inside the page's `<Suspense>` (`streaming.md`,
 * "Push dynamic access down"). Nothing here is cached.
 */
export async function FeedServer({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const props = await readFirstPage(await searchParams);
  return <FeedScreen {...props} />;
}
