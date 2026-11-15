import { toApiQuery } from "@homi/search";

import { serverApi } from "@/lib/api/server";
import { searchRules } from "@/lib/search/rules";
import { readSearchState } from "@/lib/search/readSearchState";
import { getSessionToken } from "@/lib/session/server";

import { SearchProof } from "./SearchProof";
import { SourceReporter } from "./SourceReporter";

/**
 * The server half of the WP-22 proof (inside `<Suspense>`: it reads the cookie and the address). With a session
 * cookie it reads `GET /me` and `GET /listings/count` and hands the count over as `initial`; without one (header
 * mode, or before the first sign-in) the client reads through `/bff`.
 */
export async function SearchProofServer({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if ((await getSessionToken()) === null) {
    return <SearchProof />;
  }
  const api = await serverApi();
  const me = await api.me();
  const state = readSearchState(await searchParams, me.ok ? me.data : null);
  const query = toApiQuery(state.filters, { sort: state.sort, rules: searchRules() });
  const count = await api.listingsCount(query);
  if (!count.ok) {
    return <SearchProof />;
  }
  return (
    <>
      <SearchProof initial={{ query: query.toString(), count: count.data.count }} />
      <SourceReporter source={count.meta.source} />
    </>
  );
}
