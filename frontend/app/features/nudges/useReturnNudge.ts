"use client";

import { filtersKey, isCustomFilters, sameFilters, type SearchFilters, type SearchRules, toApiQuery } from "@homi/search";
import { useEffect, useState, useSyncExternalStore } from "react";

import type { Radar } from "@/features/radars/normalize";
import { refreshRadars } from "@/features/radars/useRadars";
import { track } from "@/lib/analytics/events";
import { bffFetch } from "@/lib/api/browser";
import { type DevFlags, devFlags } from "@/lib/flags";
import { searchRules } from "@/lib/search/rules";
import { useSession } from "@/lib/session/SessionProvider";

import { RETURN_DELAY_MS } from "./constants";
import { newCount, returnDue, shouldCheckReturn } from "./returnRules";
import { markNudgeClosed, markReturnShown, readNudgeState, resetNudgeCloses } from "./storage";
import { type NudgeEnv, releaseSlot, setReturnPending, slotTicket, subscribeNudgeSlot, takeSlot } from "./store";
import { type SearchVisit, useSearchVisits } from "./visits";

/** The return banner that holds the slot: what its card shows. */
export interface ReturnView {
  /** One per banner: the card is keyed by it, so a new banner mounts afresh. */
  id: number;
  filters: SearchFilters;
  /** The positive integer count of `GET /listings/new` (LB-APP-048). */
  count: number;
}

export interface ReturnNudgeDeps {
  /**
   * `GET /listings/new` of the filters since `since` (Unix seconds): the count when it is a positive integer, else
   * `null` — for `0`, a broken answer and any failure alike (API-035); rejects on an abort.
   */
  fetchNew: (filters: SearchFilters, since: number, signal: AbortSignal) => Promise<number | null>;
}

export interface ReturnNudge {
  /** `useSearchVisits`' cue: a visit was recorded, so its search may be checked. */
  visit: (visit: SearchVisit) => void;
  /** The host's view of the app after every render. */
  sync: (env: NudgeEnv) => void;
  /** The banner that holds the slot, or `null`; the same object until it changes. */
  view: () => ReturnView | null;
  subscribe: (listener: () => void) => () => void;
  /** Listens to the slot; the returned function stops and drops everything without an event. */
  connect: () => () => void;
  /** The first render (`useMarkShownOnRender`): `back[hash]`, `lastShown`, `asked`, `return_prompt_shown`. */
  markShown: () => void;
  /** 15 s after a render: `return_prompt_expired`. */
  expire: () => void;
  /** ×: the close streak + 1 (shared with the follow nudge), `return_prompt_closed`. */
  close: () => void;
  /** «Включить» / «Настроить»: the close streak reset; answers the banner, whose filters the card acts on. */
  enable: () => ReturnView | null;
}

/**
 * `idle`: recorded, not yet started — the feed list is not shown, or the reference data or the radar list is not
 * loaded; `waiting`: the 1 800 ms; `requesting`: `GET /listings/new` in flight; `ready`: a count to show, waiting for
 * the toast to go.
 */
type Phase = "idle" | "waiting" | "requesting" | "ready";

interface Candidate {
  id: number;
  filters: SearchFilters;
  hash: string;
  /** The previous visit (ms); `returnDue` held for it at the visit. */
  previous: number;
  phase: Phase;
  count: number | null;
  /** The radar list when the candidate was made (or first loaded), as `radarsKey`. */
  radars: string | null;
}

interface Shown extends ReturnView {
  hash: string;
  ticket: number;
}

/** What makes two radar lists different for a check: ids, on or paused, filters — not a re-read of the same list. */
function radarsKey(radars: readonly Radar[] | undefined): string | null {
  return radars === undefined ? null : radars.map((radar) => `${radar.id}:${radar.active ? 1 : 0}:${filtersKey(radar.filters)}`).join("|");
}

/**
 * The return banner's timing (SCR-046, BR-APP-071; legacy `useReturnNudgeTimer`), apart from React like the follow
 * nudge's (`createFollowNudge`):
 *
 * 1. A recorded visit (`visit`) of a search whose previous visit is due (`returnDue`: ≥ 6 h ago, no silence, no
 *    cooldown, no banner for it in 2 days) makes it the candidate, while radars are switched on — else nothing, so a
 *    first visit never holds the follow nudge or the home offer back. A visit of the search whose banner is up changes
 *    nothing.
 * 2. With `nudgesAllowed`, the reference data and the radar list loaded, `shouldCheckReturn` (else dropped), then
 *    `returnPending` = the hash and the 1 800 ms wait. The map, another tab's address or a session that is not ready
 *    stops the wait or the request, and it starts afresh on the feed list; a toast does not (legacy: the toast hid
 *    only the banner).
 * 3. A change of the filters, of the radar list (`radarsKey`) or of the radars switch, a layer that opens, or another
 *    tab drops the candidate during the wait or the request (the request is aborted) and clears `returnPending`; it
 *    leaves no trace (LB-APP-050). Coming back to the search tab records a visit again. A candidate that has not
 *    started — a visit recorded while a listing or a sheet covers the search, as a new visit session's is when the
 *    app comes back under one — waits under the layer and starts once the feed list shows again (legacy kept its
 *    candidate while nudges were not allowed); a filter or radar change still drops it there.
 * 4. After the wait, `shouldCheckReturn` once more and `GET /listings/new` with `since` in whole seconds; only a
 *    positive integer count goes on (LB-APP-048), anything else ends the check silently.
 * 5. The count takes the slot once the feed list is allowed with no toast: `takeSlot("return")` always succeeds and
 *    drops a follow nudge or its candidate (BR-APP-071); a home offer hides. `returnPending` is cleared.
 *
 * The banner renders while the host allows it (`rendersIn`); a toast, a layer or another address only suspends it. A
 * filter change ends it without an event, and so does switching radars off. Its marks run on its first render
 * (`markShown` through `useMarkShownOnRender`), not here.
 */
export function createReturnNudge(deps: ReturnNudgeDeps): ReturnNudge {
  const listeners = new Set<() => void>();
  let env: NudgeEnv | null = null;
  let candidate: Candidate | null = null;
  let shown: Shown | null = null;
  let wait: ReturnType<typeof setTimeout> | null = null;
  let request: AbortController | null = null;
  let lastId = 0;
  let running = false;
  let again = false;

  const emit = () => {
    for (const listener of [...listeners]) {
      listener();
    }
  };

  const rulesHold = (of: Candidate, at: NudgeEnv): boolean =>
    at.radars !== undefined &&
    shouldCheckReturn({
      filters: of.filters,
      previous: of.previous,
      radars: at.radars,
      limit: at.limit,
      radarsEnabled: at.radarsEnabled,
      state: readNudgeState(),
      now: Date.now(),
    });

  const stopWait = () => {
    if (wait !== null) {
      clearTimeout(wait);
      wait = null;
    }
  };

  const stopRequest = () => {
    request?.abort();
    request = null;
  };

  /** The candidate leaves no trace: no cooldown, no hash, no event. */
  const drop = () => {
    stopWait();
    stopRequest();
    if (candidate !== null) {
      candidate = null;
      setReturnPending(null);
    }
  };

  /** The banner on screen goes, without an event of its own. */
  const end = () => {
    if (shown === null) {
      return;
    }
    const { ticket } = shown;
    shown = null;
    releaseSlot("return", ticket);
    emit();
  };

  const waited = (id: number) => {
    wait = null;
    if (candidate === null || candidate.id !== id || env === null) {
      return;
    }
    if (!rulesHold(candidate, env)) {
      drop();
      return;
    }
    candidate = { ...candidate, phase: "requesting" };
    const controller = new AbortController();
    request = controller;
    void deps
      .fetchNew(candidate.filters, Math.floor(candidate.previous / 1000), controller.signal)
      .then(
        (count) => count,
        () => null,
      )
      .then((count) => {
        if (controller.signal.aborted || candidate === null || candidate.id !== id) {
          return;
        }
        request = null;
        if (count === null) {
          drop();
          return;
        }
        candidate = { ...candidate, phase: "ready", count };
        evaluate();
      });
  };

  const step = () => {
    if (env === null) {
      return;
    }
    const at = env;

    if (shown !== null) {
      if (slotTicket("return") !== shown.ticket) {
        shown = null;
        emit();
      } else if (!at.radarsEnabled || (at.filters !== null && !sameFilters(at.filters, shown.filters))) {
        end();
      }
    }

    if (candidate === null) {
      return;
    }
    const radars = radarsKey(at.radars);
    const radarsChanged = candidate.radars !== null && radars !== null && radars !== candidate.radars;
    const filtersChanged = at.filters !== null && !sameFilters(at.filters, candidate.filters);
    if (!at.radarsEnabled || radarsChanged || filtersChanged || (at.filters === null && !at.layer)) {
      drop();
      return;
    }
    if (candidate.radars === null && radars !== null) {
      candidate = { ...candidate, radars };
    }
    if (at.layer) {
      if (candidate.phase !== "idle") {
        drop();
      }
      return;
    }

    const started = at.allowed && at.referenceLoaded && at.radars !== undefined;
    if (candidate.phase === "idle") {
      if (!started) {
        return;
      }
      if (!rulesHold(candidate, at)) {
        drop();
        return;
      }
      const { id, hash } = candidate;
      candidate = { ...candidate, phase: "waiting" };
      setReturnPending(hash);
      wait = setTimeout(() => waited(id), RETURN_DELAY_MS);
    } else if (candidate.phase === "waiting" || candidate.phase === "requesting") {
      if (!started) {
        stopWait();
        stopRequest();
        candidate = { ...candidate, phase: "idle" };
        setReturnPending(null);
      }
    } else if (at.allowed && !at.toast && candidate.count !== null) {
      const { id, filters, hash, count } = candidate;
      candidate = null;
      const ticket = takeSlot("return");
      setReturnPending(null);
      if (ticket !== null) {
        shown = { id, filters, count, hash, ticket };
        emit();
      }
    }
  };

  /** Runs `step` until it settles: the slot's own listeners call back in while a step writes to the slot. */
  const evaluate = () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        step();
      } while (again);
    } finally {
      running = false;
    }
  };

  const customOf = (view: Shown) => isCustomFilters(view.filters);

  return {
    visit: ({ filters, hash, previous }) => {
      if (shown !== null && shown.hash === hash) {
        return;
      }
      drop();
      if (env === null || !env.radarsEnabled || previous === null) {
        return;
      }
      if (!returnDue({ filters, previous, state: readNudgeState(), now: Date.now() })) {
        return;
      }
      lastId += 1;
      candidate = { id: lastId, filters, hash, previous, phase: "idle", count: null, radars: radarsKey(env.radars) };
      evaluate();
    },
    sync: (next) => {
      env = next;
      evaluate();
    },
    view: () => shown,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    connect: () => {
      const stop = subscribeNudgeSlot(evaluate);
      return () => {
        stop();
        drop();
        end();
      };
    },
    markShown: () => {
      if (shown !== null) {
        markReturnShown(shown.hash);
        track("return_prompt_shown", { n: shown.count, custom: customOf(shown) });
      }
    },
    expire: () => {
      if (shown !== null) {
        track("return_prompt_expired", { custom: customOf(shown) });
        end();
      }
    },
    close: () => {
      if (shown !== null) {
        markNudgeClosed();
        track("return_prompt_closed", { custom: customOf(shown) });
        end();
      }
    },
    enable: () => {
      const view = shown;
      if (view === null) {
        return null;
      }
      resetNudgeCloses();
      end();
      return { id: view.id, filters: view.filters, count: view.count };
    },
  };
}

/**
 * `GET /listings/new` through `/bff` (both session modes): the filters' query of the listing methods and `since` in
 * whole seconds; a failure or a broken count is `null`, no toast (API-035).
 */
async function readNew(filters: SearchFilters, since: number, signal: AbortSignal, rules: SearchRules): Promise<number | null> {
  const query = toApiQuery(filters, { rules });
  query.set("since", String(since));
  const result = await bffFetch<unknown>("listings/new", { query, signal });
  return result.ok ? newCount(result.data) : null;
}

export interface ReturnNudgeApi {
  view: ReturnView | null;
  markShown: () => void;
  expire: () => void;
  close: () => void;
  enable: () => ReturnView | null;
}

export interface ReturnNudgeOptions {
  /** The shell's active tab is the search tab (`NudgeHost`'s `searchTab`). */
  searchTab: boolean;
  /** The app's flags; the query is built with `searchRules(flags)`. */
  flags?: DevFlags;
  /** The long return of the search feed (`useFreshFeed`), passed to the visit tracker; stable. */
  onLongReturn?: () => void;
}

/**
 * The return banner of `NudgeHost` (WP-30 steps 14–15): the search visits (`useSearchVisits`, recorded once the
 * reference data is loaded and the session is ready; a new visit session re-reads the radar list with
 * `refreshRadars`) feed `createReturnNudge`, which gets the host's `env` after every render — before the visits, so
 * a visit always meets the env it was recorded in.
 */
export function useReturnNudge(env: NudgeEnv, { searchTab, flags = devFlags, onLongReturn }: ReturnNudgeOptions): ReturnNudgeApi {
  const [back] = useState(() =>
    createReturnNudge({ fetchNew: (filters, since, signal) => readNew(filters, since, signal, searchRules(flags)) }),
  );
  const { status } = useSession();

  useEffect(() => back.connect(), [back]);

  useEffect(() => {
    back.sync(env);
  });

  useSearchVisits(
    { searchTab, filters: env.filters, ready: env.referenceLoaded && status === "ready" },
    { onVisit: back.visit, onSession: () => refreshRadars(), onLongReturn },
  );

  const view = useSyncExternalStore(back.subscribe, back.view, () => null);
  return { view, markShown: back.markShown, expire: back.expire, close: back.close, enable: back.enable };
}

