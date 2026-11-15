import "server-only";

import type { Locale } from "@homi/config";
import { cacheLife, cacheTag } from "next/cache";

import { publicApi } from "@/lib/api/server";

import { EMPTY_REFERENCE } from "./empty";
import type { Cached, CityStats, Reference } from "./types";

export { EMPTY_REFERENCE };

/**
 * The reference data, cached per locale (WP-22, DEC-44): the only cached reads of the app. A cached function cannot
 * read the cookie, so both calls go without a user token — `GET /reference` and `GET /cities` are public (WP-11) —
 * and never with a stub scenario; a per-user token never becomes part of a cache key.
 *
 * Neither throws. `next build` has no API (the `Build` step of CI, `make ci-frontend`), and the running app may not
 * reach it for a moment: then the empty value is returned with the `seconds` profile, whose expiry under five
 * minutes keeps it out of prerenders (`cacheLife.md`, "Prerendering behavior"), so the next request asks again.
 * `ReferenceProvider` therefore sits inside `<Suspense>`. A change of `radars_enabled` on the server reaches a running
 * app when the entry is revalidated, after about ten minutes.
 */
export const REFERENCE_LIFE = { stale: 300, revalidate: 600, expire: 3600 } as const;

export async function getReference(locale: Locale): Promise<Cached<Reference>> {
  "use cache";
  cacheTag("reference");
  const result = await publicApi(locale).reference();
  if (!result.ok) {
    cacheLife("seconds");
    return { loaded: false, data: EMPTY_REFERENCE };
  }
  cacheLife(REFERENCE_LIFE);
  return { loaded: true, data: result.data, ...(result.meta.source === undefined ? {} : { source: result.meta.source }) };
}

export async function getCities(locale: Locale): Promise<Cached<CityStats[]>> {
  "use cache";
  cacheTag("reference");
  const result = await publicApi(locale).cities();
  if (!result.ok) {
    cacheLife("seconds");
    return { loaded: false, data: [] };
  }
  cacheLife(REFERENCE_LIFE);
  return { loaded: true, data: result.data, ...(result.meta.source === undefined ? {} : { source: result.meta.source }) };
}
