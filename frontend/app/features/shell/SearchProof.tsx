"use client";

import { switchDeal, toApiQuery, toSearchParams } from "@homi/search";
import { Button } from "@homi/ui";
import { useTranslations } from "next-intl";

import { bffFetch } from "@/lib/api/browser";
import { useResource } from "@/lib/data/useResource";
import { useReference } from "@/lib/reference/useReference";
import { searchRules } from "@/lib/search/rules";
import { useSearchState } from "@/lib/search/useSearchState";
import { useSession } from "@/lib/session/SessionProvider";

/**
 * The visible proof of WP-22 on the feed and map placeholders, until WP-24 and WP-27 replace them: the search state
 * parsed from the address, the number of cities of the reference data, and the count of `GET /listings/count` —
 * from the server's read in cookie mode (`initial`), through `/bff` in header mode. The button switches the deal
 * through `setFilters`.
 */
export function SearchProof({ initial }: { initial?: { query: string; count: number } }) {
  const t = useTranslations();
  const { status } = useSession();
  const { filters, sort, setFilters } = useSearchState();
  const { cities } = useReference();
  const query = toApiQuery(filters, { sort, rules: searchRules() });
  const key = `listings/count?${query.toString()}`;
  const count = useResource(key, (signal) => bffFetch<{ count: number }>("listings/count", { query, signal }), {
    initial: initial?.query === query.toString() ? { count: initial.count } : undefined,
    enabled: status === "ready",
  });
  const next = filters.deal === "sale" ? "rent_long" : "sale";

  return (
    <div className="flex flex-col gap-1 text-[13px]" data-proof="">
      {/* A query (a drawn polygon above all) has no break opportunity: unwrapped it widens the phone's layout viewport. */}
      <output data-proof="filters" className="break-all">
        {toSearchParams(filters, sort).toString()}
      </output>
      <output data-proof="cities">{cities.length}</output>
      <output data-proof="count" data-status={count.status}>
        {count.data?.count ?? ""}
      </output>
      <Button variant="secondary" data-proof="deal" onClick={() => setFilters(switchDeal(filters, next))}>
        {t(`deal.${next}`)}
      </Button>
    </div>
  );
}
