"use client";

import { type SearchFilters, type SearchRules, toApiQuery } from "@homi/search";
import { useEffect, useState } from "react";

import { bffFetch } from "@/lib/api/browser";

/** One relax option of `GET /listings/flow` (`FlowOptionResource`): server strings, shown as text (SEC-REQ-021). */
export type LiveFlowOption = { code: string; label: string; rate: string; count: number | null; filters: unknown };

/** `GET /listings/flow` (`FlowResource`): the matches of the last `days` days, `week` of them in total. */
export type LiveFlow = { week: number; days: number; options: readonly LiveFlowOption[] };

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

function optionOf(value: unknown): LiveFlowOption | null {
  if (!isRecord(value)) {
    return null;
  }
  const { code, label, rate, count, filters } = value;
  if (typeof code !== "string" || typeof label !== "string" || typeof rate !== "string" || !isRecord(filters)) {
    return null;
  }
  return { code, label, rate, count: isCount(count) ? count : null, filters };
}

/**
 * The one validator of a flow answer (WP-25; WP-30 uses it for the follow nudge and the radar sheet): `null` unless
 * the value is an object with a finite, non-negative `week` and a `days` above zero, which hides the flow line and the
 * relax chips. An option is kept only when it has string `code`, `label` and `rate` and an object `filters` — the
 * filters are re-normalised by whoever takes the option (SEC-REQ-017); a malformed one is dropped, never the answer.
 */
export function normalizeFlow(value: unknown): LiveFlow | null {
  if (!isRecord(value)) {
    return null;
  }
  const { week, days, options } = value;
  if (!isCount(week) || !isCount(days) || days === 0) {
    return null;
  }
  const list = Array.isArray(options) ? options.map(optionOf).filter((option) => option !== null) : [];
  return { week, days, options: list };
}

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
