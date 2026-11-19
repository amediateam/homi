"use client";

import { filtersHash, filtersKey, sameFilters, type SearchFilters, type SearchRules, toApiQuery } from "@homi/search";
import { useEffect, useState, useSyncExternalStore } from "react";

import { onFiltersApplied } from "@/features/filters/applyFilters";
import { type LiveFlow, normalizeFlow } from "@/features/filters/flow";
import type { Radar } from "@/features/radars/normalize";
import { track } from "@/lib/analytics/events";
import { bffFetch } from "@/lib/api/browser";
import { type DevFlags, devFlags } from "@/lib/flags";
import { searchRules } from "@/lib/search/rules";

import { FOLLOW_DELAY_MS } from "./constants";
import { shouldShowFollowNudge } from "./followRules";
import { markFollowShown, markNudgeClosed, readNudgeState, resetNudgeCloses } from "./storage";
import { getNudgeSlot, type NudgeEnv, releaseSlot, setFollowPending, slotTicket, subscribeNudgeSlot, takeSlot } from "./store";

/** The follow nudge that holds the slot: what its card shows. */
export interface FollowView {
  /** One per nudge: the card is keyed by it, so a new nudge mounts afresh. */
  id: number;
  filters: SearchFilters;
  /** `normalizeFlow` of `GET /listings/flow`; `null` (no flow line) for an empty answer or a failed read (LB-APP-006). */
  flow: LiveFlow | null;
}

export interface FollowNudgeDeps {
  /** `GET /listings/flow` of the filters; `null` when the answer is no flow or the read failed; rejects on an abort. */
  fetchFlow: (filters: SearchFilters, signal: AbortSignal) => Promise<LiveFlow | null>;
}

export interface FollowNudge {
  /** `onFiltersApplied` listener: the applied filters become the candidate (step 1). */
  offer: (filters: SearchFilters) => void;
  /** The host's view of the app after every render. */
  sync: (env: NudgeEnv) => void;
  /** The nudge that holds the slot, or `null`; the same object until it changes. */
  view: () => FollowView | null;
  subscribe: (listener: () => void) => () => void;
  /** Listens to the slot; the returned function stops and drops everything without an event. */
  connect: () => () => void;
  /** The first render (`useMarkShownOnRender`): `asked`, `lastShown`, `follow_prompt_shown`. */
  markShown: () => void;
  /** 10 s after a render: `follow_prompt_expired`. */
  expire: () => void;
  /** ×: the close streak + 1, `follow_prompt_closed`. */
  close: () => void;
  /** «Включить»: the close streak reset; answers the nudge, whose filters the card turns a radar on for. */
  enable: () => FollowView | null;
}

type Phase = "waiting" | "requesting" | "ready";

interface Candidate {
  id: number;
  filters: SearchFilters;
  hash: string;
  /** The search root has shown these filters since the offer: from then on a change of them is a filter change. */
  seen: boolean;
  phase: Phase;
  flow: LiveFlow | null;
  /** The radar list when the candidate was made (or first loaded), as `radarsKey`. */
  radars: string | null;
}

interface Shown extends FollowView {
  hash: string;
  ticket: number;
}

/** What makes two radar lists different for a candidate: ids, on or paused, filters — not a refetch of the same list. */
function radarsKey(radars: readonly Radar[] | undefined): string | null {
  return radars === undefined ? null : radars.map((radar) => `${radar.id}:${radar.active ? 1 : 0}:${filtersKey(radar.filters)}`).join("|");
}

/**
 * The follow nudge's timing (SCR-040, BR-APP-043, BR-APP-046; legacy `useFollowNudge.js`), apart from React so the
 * rules of the contract can be followed step by step:
 *
 * 1. An apply (`offer`) ends the follow nudge on screen without an event (legacy: an apply cleared it) and makes the
 *    applied filters the candidate, when `shouldShowFollowNudge` holds for them already; `followPending` is set.
 * 2. The offer arrives before the new address lands: `applyFilters` notifies once the replace is issued, and a step back
 *    from the sheet first shows the previous search. So nothing counts as a filter change until a search root (`/`,
 *    `/map`) has shown the candidate's filters (`seen`); only an address that is neither a search root nor a layer —
 *    another tab, the apply overtaken — drops it before. From then on the candidate — waiting, requesting or ready, not
 *    rendered — is dropped without a trace by a filter change, a layer that opens, a change of the radar list or the
 *    return banner taking the slot (BR-APP-071, LB-APP-050). Another tab or the map only pauses it, as in legacy.
 * 3. The 1 800 ms wait runs while the feed list is allowed (`nudgesAllowed`), no toast is visible and no return check
 *    of the same hash is pending (BR-APP-046); anything else stops it, and it starts afresh.
 * 4. Then `shouldShowFollowNudge` once more (else dropped) and `GET /listings/flow` with an `AbortSignal`; its answer
 *    makes the candidate ready.
 * 5. A ready candidate takes the slot once the feed list is allowed and no toast is visible; a refused slot drops it.
 *
 * The nudge that holds the slot renders while the host allows it (`rendersIn`); a toast, a layer or another address
 * only suspends it. A filter change ends it, and so does a higher nudge, without an event. The marks of step 5 run on
 * its first render (`markShown` through `useMarkShownOnRender`), not here.
 */
export function createFollowNudge(deps: FollowNudgeDeps): FollowNudge {
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

  const rulesHold = (filters: SearchFilters, at: NudgeEnv) =>
    shouldShowFollowNudge({
      filters,
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

  /** The candidate leaves no trace: no cooldown, no hash, no event. */
  const drop = () => {
    stopWait();
    request?.abort();
    request = null;
    if (candidate !== null) {
      candidate = null;
      setFollowPending(false);
    }
  };

  /** The nudge on screen goes, without an event of its own. */
  const end = () => {
    if (shown === null) {
      return;
    }
    const { ticket } = shown;
    shown = null;
    releaseSlot("follow", ticket);
    emit();
  };

  const waited = (id: number) => {
    wait = null;
    if (candidate === null || candidate.id !== id || env === null) {
      return;
    }
    if (!rulesHold(candidate.filters, env)) {
      drop();
      return;
    }
    candidate = { ...candidate, phase: "requesting" };
    const controller = new AbortController();
    request = controller;
    void deps
      .fetchFlow(candidate.filters, controller.signal)
      .then(
        (flow) => flow,
        () => null,
      )
      .then((flow) => {
        if (controller.signal.aborted || candidate === null || candidate.id !== id) {
          return;
        }
        request = null;
        candidate = { ...candidate, phase: "ready", flow };
        evaluate();
      });
  };

  const step = () => {
    if (env === null) {
      return;
    }
    const at = env;
    const slot = getNudgeSlot();

    if (shown !== null) {
      if (slotTicket("follow") !== shown.ticket) {
        shown = null;
        emit();
      } else if (at.filters !== null && !sameFilters(at.filters, shown.filters)) {
        end();
      }
    }

    if (candidate === null) {
      return;
    }
    if (!candidate.seen) {
      if (at.filters === null && !at.layer) {
        drop();
        return;
      }
      if (at.filters === null || !sameFilters(at.filters, candidate.filters)) {
        return;
      }
      candidate = { ...candidate, seen: true };
    }
    const radars = radarsKey(at.radars);
    const radarsChanged = candidate.radars !== null && radars !== null && radars !== candidate.radars;
    const filtersChanged = at.filters !== null && !sameFilters(at.filters, candidate.filters);
    if (slot.active === "return" || at.layer || filtersChanged || radarsChanged) {
      drop();
      return;
    }
    if (candidate.radars === null && radars !== null) {
      candidate = { ...candidate, radars };
    }

    if (candidate.phase === "waiting") {
      if (!at.allowed || at.toast || slot.returnPending === candidate.hash) {
        stopWait();
      } else if (wait === null) {
        const { id } = candidate;
        wait = setTimeout(() => waited(id), FOLLOW_DELAY_MS);
      }
    } else if (candidate.phase === "ready" && at.allowed && !at.toast) {
      const { id, filters, hash, flow } = candidate;
      candidate = null;
      const ticket = takeSlot("follow");
      setFollowPending(false);
      if (ticket !== null) {
        shown = { id, filters, flow, hash, ticket };
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

  return {
    offer: (filters) => {
      end();
      drop();
      if (env !== null && !rulesHold(filters, env)) {
        return;
      }
      lastId += 1;
      candidate = { id: lastId, filters, hash: filtersHash(filters), seen: false, phase: "waiting", flow: null, radars: radarsKey(env?.radars) };
      setFollowPending(true);
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
        markFollowShown(shown.hash);
        track("follow_prompt_shown");
      }
    },
    expire: () => {
      if (shown !== null) {
        track("follow_prompt_expired");
        end();
      }
    },
    close: () => {
      if (shown !== null) {
        markNudgeClosed();
        track("follow_prompt_closed");
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
      return { id: view.id, filters: view.filters, flow: view.flow };
    },
  };
}

/** `GET /listings/flow` through `/bff` (both session modes) with the query of the filters sheet's forecast. */
async function readFlow(filters: SearchFilters, signal: AbortSignal, rules: SearchRules): Promise<LiveFlow | null> {
  const result = await bffFetch<unknown>("listings/flow", { query: toApiQuery(filters, { rules }), signal });
  return result.ok ? normalizeFlow(result.data) : null;
}

export interface FollowNudgeApi {
  view: FollowView | null;
  markShown: () => void;
  expire: () => void;
  close: () => void;
  enable: () => FollowView | null;
}

/**
 * The follow nudge of `NudgeHost` (WP-30 step 13): `onFiltersApplied(offer)` registered once — `applyFilters` of WP-25
 * notifies for the filters sheet, the quick filter sheet and the lasso, so no apply handler knows the nudge — and the
 * host's `env` handed over after every render. The flow is read with `searchRules(flags)`.
 */
export function useFollowNudge(env: NudgeEnv, { flags = devFlags }: { flags?: DevFlags } = {}): FollowNudgeApi {
  const [follow] = useState(() => createFollowNudge({ fetchFlow: (filters, signal) => readFlow(filters, signal, searchRules(flags)) }));

  useEffect(() => {
    const disconnect = follow.connect();
    const stop = onFiltersApplied(follow.offer);
    return () => {
      stop();
      disconnect();
    };
  }, [follow]);

  useEffect(() => {
    follow.sync(env);
  });

  const view = useSyncExternalStore(follow.subscribe, follow.view, () => null);
  return { view, markShown: follow.markShown, expire: follow.expire, close: follow.close, enable: follow.enable };
}
