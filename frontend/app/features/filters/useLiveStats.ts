"use client";

import { type SearchFilters, type SearchRules, toApiQuery } from "@homi/search";
import { useEffect, useState } from "react";

import { bffFetch } from "@/lib/api/browser";

import { isCount, isRecord, type LiveFlow, normalizeFlow } from "./flow";

export { type LiveFlow, type LiveFlowOption, normalizeFlow } from "./flow";

export interface LiveStatsOptions {
  /** Also ask for the radar forecast; off by default — the quick filter counts only. */
  flow?: boolean;
  /** `searchRules(devFlags)`, so the count is of the ranges that will be applied (`dev025ValidateRanges`, LB-APP-043). */
  rules?: Partial<SearchRules>;
}

export interface LiveStats {
  /** `null` until the first answer; a failed request keeps the previous count. */
  count: number | null;
  /** `null` until the first valid answer, after an answer `normalizeFlow` refuses, and always without `flow`. */
  flow: LiveFlow | null;
}

/** After the last draft change: the count first, the forecast later (`03` §3.4). */
export const COUNT_DELAY_MS = 250;
export const FLOW_DELAY_MS = 500;

/**
 * The live result count and radar forecast of a draft (WP-25, footer of SCR-014 and SCR-015): `GET /listings/count`
 * 250 ms and `GET /listings/flow` 500 ms after the last change, both with the query of `toApiQuery`. A change is a
 * change of that query, not of the draft object; it cancels the pending timers and aborts the requests in flight, as
 * hiding or leaving the sheet does, so nothing is written afterwards. A failed request (offline, timeout, `503
 * source_unavailable`) keeps what is shown (`03` §1.6). `bffFetch` serves both session modes and reports a stub
 * answer to the demo marker.
 */
export function useLiveStats(draft: SearchFilters, options: LiveStatsOptions = {}): LiveStats {
  const withFlow = options.flow ?? false;
  const query = toApiQuery(draft, { rules: options.rules }).toString();
  const [count, setCount] = useState<number | null>(null);
  const [flow, setFlow] = useState<LiveFlow | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const read = (path: "listings/count" | "listings/flow", take: (data: unknown) => void) =>
      bffFetch(path, { query: new URLSearchParams(query), signal }).then(
        (result) => {
          if (!signal.aborted && result.ok) {
            take(result.data);
          }
        },
        () => undefined,
      );

    const timers = [
      setTimeout(() => {
        void read("listings/count", (data) => {
          const value = isRecord(data) ? data.count : undefined;
          if (isCount(value)) {
            setCount(value);
          }
        });
      }, COUNT_DELAY_MS),
    ];
    if (withFlow) {
      timers.push(setTimeout(() => void read("listings/flow", (data) => setFlow(normalizeFlow(data))), FLOW_DELAY_MS));
    }
    return () => {
      controller.abort();
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, [query, withFlow]);

  return { count, flow: withFlow ? flow : null };
}
