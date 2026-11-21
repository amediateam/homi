"use client";

import { type SearchFilters, toApiQuery } from "@homi/search";
import type { components } from "@homi/types";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { feedEpoch, subscribeFeedEpoch } from "@/features/feed/feedQuery";

import { bffFetch } from "@/lib/api/browser";
import { type ApiFailure, failureOf, type UiError } from "@/lib/api/errors";
import type { ApiResult } from "@/lib/api/types";
import { useSessionMap } from "@/lib/data/sessionMaps";
import type { DataSource } from "@/lib/data/sources";
import { type DevFlags, devFlags } from "@/lib/flags";
import { searchRules } from "@/lib/search/rules";
import { onForbidden } from "@/lib/session/bootstrap";

import { groupByLocation, mapCounts } from "./pins";
import type { MapGroup, MapPoint } from "./types";

type MapAnswer = components["schemas"]["MapPointsResource"];

const PATH = "listings/map";

export interface MapPointsOptions {
  /** Gates sending only (`useSession().status === 'ready'`); `true` by default. */
  enabled?: boolean;
  /** The app's flags; tests pass overrides (`withDevFlags`). */
  flags?: DevFlags;
}

/** `loading` while the request for these filters is pending; `empty` = no point shown and nothing without one. */
export type MapPointsStatus = "loading" | "ready" | "empty" | "error";

export interface MapPoints {
  status: MapPointsStatus;
  /** The points not hidden, one group per rounded location, cheapest first (`pins.ts`). */
  groups: MapGroup[];
  shown: number;
  /** Located listings the source left out of the answer: the «N самых свежих» note (BR-APP-062, WP-37). */
  cut: number;
  /** Listings of the search without a location: the "N of M" note (BR-APP-062). */
  missing: number;
  /** The map's v1 query these points belong to: the key of the camera memory (WP-37). */
  queryKey: string;
  /** Grows by one with each successful answer, never with a change of the hidden set: the view refits on it. */
  responseId: number;
  /** `meta.source` of the answer these points come from (`25` §4.4); `undefined` until it answered, or without one. */
  source: DataSource | undefined;
  error: UiError | null;
  /** Asks again after an error; ignored otherwise. */
  retry: () => void;
}

/**
 * A request sent: a new object per send, so an answer is matched to its request. `keepView`: the same search asked
 * again after a feed-epoch bump while its points are shown.
 */
type Request = { keepView?: true };

interface State {
  /** The query of the filters these points belong to. */
  key: string;
  points: readonly MapPoint[];
  /** `null` when the answer has none: `mapCounts` counts the points then. */
  answerTotal: number | null;
  /** The answer's `with_point`; `null` without one (an older driver). */
  withPoint: number | null;
  loaded: boolean;
  error: ApiFailure | null;
  /** The request the effect sends while `enabled`; `null` once answered. */
  request: Request | null;
  responseId: number;
  source: DataSource | undefined;
  /** The feed epoch these points were asked under (WP-38): a bump asks again, the points shown kept meanwhile. */
  epoch: number;
}

function start(key: string, responseId: number, epoch: number): State {
  return { key, points: [], answerTotal: null, withPoint: null, loaded: false, error: null, request: {}, responseId, source: undefined, epoch };
}

function settle(state: State, result: ApiResult<MapAnswer>): State {
  if (!result.ok) {
    return { ...state, error: result, request: null };
  }
  const points = Array.isArray(result.data?.points) ? result.data.points : [];
  const answerTotal = result.data?.total ?? null;
  const withPoint = typeof result.data?.with_point === "number" ? result.data.with_point : null;
  return {
    ...state,
    points,
    answerTotal,
    withPoint,
    loaded: true,
    error: null,
    request: null,
    // The same search read again (a feed-epoch bump) keeps the camera and an open card: no new response id.
    responseId: state.request?.keepView ? state.responseId : state.responseId + 1,
    source: result.meta.source,
  };
}

/**
 * `empty` = no point to show and no listing known only by district. A cut answer whose every point was hidden in this
 * launch is empty too: the map has nothing to draw and no note to give.
 */
function statusOf(state: State, counts: { shown: number; missing: number }): MapPointsStatus {
  if (state.error !== null) {
    return "error";
  }
  if (!state.loaded) {
    return "loading";
  }
  return counts.shown === 0 && counts.missing === 0 ? "empty" : "ready";
}

/**
 * The points of the map (SCR-011, BR-APP-062): one `GET /listings/map` per change of the search, with the filters'
 * v1 query (`toApiQuery`, the feed's rules) and no sort, paging or viewport. The request is keyed by that query, not
 * by `filtersKey()`, which ignores `posted_days` (`feedQuery.ts`). A change aborts the pending request and starts
 * from nothing, so no pin of the old search is shown under the new one; an answer for older filters is dropped
 * (`useCursorFeed`'s guards). Listings hidden in this launch (`useSessionMap('hidden')`) are left out when grouping:
 * a change of that set regroups and recounts without a new `responseId`, so the camera stays.
 *
 * A bump of the feed epoch (`bumpFeedEpoch`, WP-38; WP-31 bumps it when hidden listings return or the language or
 * currency changes) asks the same search again, keeping the points shown until the answer, and its answer keeps the
 * `responseId`, so the camera stays and an open card stays open.
 *
 * The request lives in an effect and is aborted by its cleanup, on unmount and while the route is hidden by
 * `cacheComponents`; a pending one is sent again when shown. A failure is a status, never an empty map (LB-APP-008),
 * and nothing retries by itself. `bffFetch` reports each answer's `meta.source` to the demo marker once; the hook
 * only keeps it in `source`, for the screen to report again whenever its own address is shown (`SourceReporter`,
 * `25` §4.4). With `dev001AnyForbiddenShowsAccess` a `forbidden` answer turns the session `denied` (LB-APP-045).
 */
export function useMapPoints(filters: SearchFilters, options: MapPointsOptions = {}): MapPoints {
  const { enabled = true, flags = devFlags } = options;
  const key = toApiQuery(filters, { rules: searchRules(flags) }).toString();
  const epoch = useSyncExternalStore(subscribeFeedEpoch, feedEpoch, () => 0);
  const [stored, setState] = useState<State>(() => start(key, 0, epoch));
  let state = stored;
  if (stored.key !== key) {
    state = start(key, stored.responseId, epoch);
    setState(state);
  } else if (stored.epoch !== epoch) {
    // Everything was read again elsewhere (a hidden listing returned, a language or currency saved — WP-31): the
    // same search is asked again when the map shows, and its points stay until the answer. Only an answer the camera
    // could fit keeps the view — one with points, or any answer for a drawn area (the camera fits the area): before the
    // first answer (pending, aborted or failed), or after one without points, the new answer must fit. (An answer whose
    // every point is hidden keeps it: a rare case.)
    const fitted = stored.points.length > 0 || (filters.polygon !== null && filters.polygon.length > 0);
    state = { ...stored, epoch, error: null, request: stored.loaded && fitted ? { keepView: true } : {} };
    setState(state);
  }

  const { request } = state;
  useEffect(() => {
    if (!enabled || request === null) {
      return undefined;
    }
    const controller = new AbortController();
    const apply = (result: ApiResult<MapAnswer>) => {
      if (!controller.signal.aborted) {
        setState((current) => (current.key === key && current.request === request ? settle(current, result) : current));
      }
    };
    bffFetch<MapAnswer>(PATH, { query: new URLSearchParams(key), signal: controller.signal }).then(apply, () => {
      // `bffFetch` rejects only for the abort of its caller; anything else is a bug, shown as "could not load".
      apply(failureOf({ method: "GET", path: PATH }, { status: 0 }));
    });
    return () => controller.abort();
  }, [enabled, request, key]);

  const forbidden = state.error?.error === "forbidden";
  useEffect(() => {
    if (enabled && forbidden && flags.dev001AnyForbiddenShowsAccess) {
      onForbidden();
    }
  }, [enabled, forbidden, flags]);

  const retry = useCallback(() => {
    setState((current) =>
      current.key === key && current.error !== null && current.request === null ? { ...current, error: null, request: {} } : current,
    );
  }, [key]);

  const hidden = useSessionMap("hidden");
  const { points, answerTotal, withPoint } = state;
  const groups = useMemo(() => groupByLocation(points, hidden), [points, hidden]);
  const counts = useMemo(() => mapCounts(points, answerTotal, withPoint, hidden), [points, answerTotal, withPoint, hidden]);

  return {
    status: statusOf(state, counts),
    groups,
    shown: counts.shown,
    cut: counts.cut,
    missing: counts.missing,
    queryKey: key,
    responseId: state.responseId,
    source: state.source,
    error: state.error?.error ?? null,
    retry,
  };
}
