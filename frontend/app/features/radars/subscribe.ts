"use client";

import type { Locale } from "@homi/config";
import type { Translate } from "@homi/i18n/format";
import { filtersKey, sameFilters, type SearchFilters, type SearchRules, toRadarFilters } from "@homi/search";
import type { components } from "@homi/types";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { createRadar, patchRadar, relaxRadar, replaceRadar } from "@/lib/actions/radars";
import { type Action, invokeAction } from "@/lib/actions/useAction";
import type { ApiResult } from "@/lib/api/types";
import { readResource } from "@/lib/data/useResource";
import { type DevFlags, devFlags } from "@/lib/flags";
import { useReference } from "@/lib/reference/useReference";
import { searchRules } from "@/lib/search/rules";
import { tg } from "@/lib/telegram";
import { isNoChat, withChatAccess } from "@/lib/telegram/chatAccess";
import { showToast, type ToastMessage, type ToastScope } from "@/lib/ui/toast";

import { normalizeMutation, normalizePatch, type Radar, type RadarMutation, type RadarOption } from "./normalize";
import {
  alertOnToast,
  alreadyOnToast,
  limitToast,
  noChatToast,
  type RelaxRun,
  relaxedEmptyToast,
  saveFailedToast,
  savedEmptyToast,
  savedFewToast,
  savedToast,
  soonToast,
  updatedEmptyToast,
  updatedFewToast,
  updatedToast,
} from "./toasts";
import { fetchRadarList, RADARS_KEY, refreshRadars } from "./useRadars";

/**
 * Where a radar was turned on (BR-APP-041, BR-API-086): the filters footer, the new-radar sheet, the few-results
 * note, the follow nudge, the radar card in the feed and the return banner.
 */
export type RadarEntry = components["schemas"]["StoreRadarRequest"]["entry"];

/** What a caller of `useSubscribe()` learns: the sheet that asked closes on `ok`. */
export interface SubscribeResult {
  ok: boolean;
}

/**
 * The end of one flow, before anything is shown: whether it succeeded, the toast and the haptic it calls for, and the
 * radar it ended on when the answer named one. `useSubscribe()` presents it.
 */
export interface Outcome {
  ok: boolean;
  toast: ToastMessage | null;
  haptic: "success" | "error" | null;
  radar?: Radar;
}

/**
 * What the pure flow needs from the app; `useSubscribe()` binds it, tests pass fakes.
 *
 * - `invoke`: a Server Action call (`invokeAction` with the page's locale).
 * - `listRadars`: a fresh `GET /radars` (`fetchRadarList`), `null` on failure; `cached`: the cached plain list.
 * - `t`, `locale`: the toasts' texts and the `{count}` of the starter toasts.
 * - `rules`: `searchRules(devFlags)` (`dev005RadarDropsPostedDays` reaches the body through `toRadarFilters`).
 * - `limit`: `useReference().radarLimit` (`limits.radars`, fallback 10), the `{max}` of the limit toast.
 * - `restartText`: `t("chat.restart")` for the chat-access flow.
 * - `onSuccess`: re-reads the radar lists (`refreshRadars`) — after every write that succeeded, and after an answer
 *   that the radar is gone (`not_found`), so a radar deleted elsewhere leaves the screens.
 * - `relax`: what «Расширить» of a few toast runs; the hook binds its own `relax`, which shows the widen's outcome.
 */
export interface SubscribeDeps {
  invoke: <I, T>(action: Action<I, T>, input: I) => Promise<ApiResult<T>>;
  listRadars: () => Promise<Radar[] | null>;
  cached: () => Radar[] | undefined;
  t: Translate;
  locale: Locale;
  rules: SearchRules;
  limit: number;
  restartText: string;
  onSuccess: () => void;
  relax: (id: string, code: string) => Promise<unknown>;
}

/** A few toast's option needs at least this many listings to be the one offered (legacy `emptyResultToast`). */
export const FEW_OPTION_MIN = 7;

const success = (toast: ToastMessage, radar: Radar | null | undefined, haptic: Outcome["haptic"] = "success"): Outcome => ({
  ok: true,
  toast,
  haptic,
  ...(radar ? { radar } : {}),
});

/**
 * Subscribe flow step 7 (the fix of LB-API-033: the `409` codes of WP-13 instead of "any other 409 is the limit"),
 * for every write of the flow: `no_chat` after the chat-access flow → «Радар не включён…»; `radar_limit` → the limit
 * toast with the reference's maximum; `radar_duplicate` (an edit or a widen that matches another radar) →
 * «…уже включён», still a failure: nothing was saved; `radars_disabled` → «Радар скоро заработает»; anything else,
 * `not_found` included → «Не получилось сохранить». An unknown radar also re-reads the lists. Always the error haptic.
 */
function failure(result: ApiResult<unknown>, deps: SubscribeDeps): Outcome {
  if (!result.ok && result.error === "not_found") {
    deps.onSuccess();
  }
  return { ok: false, toast: failureToast(result, deps.limit), haptic: "error" };
}

function failureToast(result: ApiResult<unknown>, limit: number): ToastMessage {
  if (result.ok) {
    return saveFailedToast();
  }
  if (isNoChat(result)) {
    return noChatToast();
  }
  if (result.error === "conflict" && result.code === "radar_limit") {
    return limitToast(limit);
  }
  if (result.error === "conflict" && result.code === "radar_duplicate") {
    return alreadyOnToast();
  }
  if (result.error === "radars_disabled") {
    return soonToast();
  }
  return saveFailedToast();
}

/** Step 5: the first option with `count ≥ 7`, else the last one, else none (legacy `emptyResultToast`). */
function fewOption(options: readonly RadarOption[]): RadarOption | null {
  return options.find((option) => option.count !== null && option.count >= FEW_OPTION_MIN) ?? options.at(-1) ?? null;
}

/**
 * Step 5 for a create (`saved…`) or an edit (`updated…`): `starter > 0` → the count toast; else the few toast of
 * `fewOption` with «Расширить» = `deps.relax(id, option.code)` (text alone when the answer named no radar to widen);
 * else the empty toast with the first relaxed condition as its hint. `normalizeMutation` already made `options` and
 * `relaxed` arrays and `starter` a whole number (step 6).
 */
function resultToast(kind: "saved" | "updated", mutation: RadarMutation, id: string | null, deps: SubscribeDeps): ToastMessage {
  const { t, locale } = deps;
  if (mutation.starter > 0) {
    return kind === "saved" ? savedToast(mutation.starter, locale, t) : updatedToast(mutation.starter, locale, t);
  }
  const option = fewOption(mutation.options);
  if (option !== null) {
    const run: RelaxRun | null = id === null ? null : () => deps.relax(id, option.code);
    return kind === "saved" ? savedFewToast(option, t, run) : updatedFewToast(option, t, run);
  }
  return kind === "saved" ? savedEmptyToast(mutation.relaxed) : updatedEmptyToast(mutation.relaxed);
}

/** The steps of one subscribe; `runSubscribe` shares it between equal searches. */
async function subscribeOnce(deps: SubscribeDeps, filters: SearchFilters, entry: RadarEntry, relaxed?: string | null): Promise<Outcome> {
  const restart = { restartText: deps.restartText };
  const list = (await deps.listRadars()) ?? deps.cached() ?? [];
  const twin = list.find((radar) => sameFilters(radar.filters, filters));

  if (twin?.active) {
    return success(alreadyOnToast(), twin, null);
  }
  if (twin !== undefined) {
    const patched = await withChatAccess(() => deps.invoke(patchRadar, { id: twin.id, active: true }), restart);
    if (!patched.ok) {
      return failure(patched, deps);
    }
    deps.onSuccess();
    return success(alertOnToast(), normalizePatch(patched.data).radar ?? { ...twin, active: true });
  }

  const input = {
    filters: toRadarFilters(filters, deps.rules),
    entry,
    ...(typeof relaxed === "string" && relaxed !== "" ? { relaxed } : {}),
  };
  const created = await withChatAccess(() => deps.invoke(createRadar, input), restart);
  if (!created.ok) {
    return failure(created, deps);
  }
  deps.onSuccess();
  const mutation = normalizeMutation(created.data);
  if (mutation.kind === "existing") {
    return success(alreadyOnToast(), mutation.radar, null);
  }
  if (mutation.kind === "reactivated") {
    return success(alertOnToast(), mutation.radar);
  }
  return success(resultToast("saved", mutation, mutation.radar?.id ?? null, deps), mutation.radar);
}

/** Subscribes in flight, by `filtersKey` (step 8). */
const inflight = new Map<string, Promise<Outcome>>();

/**
 * The subscribe flow of every radar entry point (WP-30 "Subscribe flow", BR-APP-041, BR-APP-042), without UI:
 *
 * 1. Re-read `GET /radars` (`deps.listRadars`); when that fails, the cached list.
 * 2. A radar with `sameFilters` (`posted_days` ignored) that is active → no request, «…уже включён», `ok`, no haptic
 *    (legacy).
 * 3. The same but paused → `patchRadar({ id, active: true })` through `withChatAccess` → «Радар снова включён».
 * 4. Otherwise `createRadar({ filters: toRadarFilters(filters, rules), entry, relaxed? })` through `withChatAccess`
 *    (`relaxed` left out when no relax chip was chosen). The server repeats steps 2 and 3 and says so in `kind`:
 *    `existing` → «…уже включён» (no haptic, as step 2), `reactivated` → «Радар снова включён», `created` → step 5.
 * 5. `starter > 0` → the count toast; else the few toast with «Расширить»; else the empty toast (`resultToast`).
 * 6. Every success is `ok` with a success toast, whatever the answer lacks (the fix of LB-APP-005).
 * 7. A failure maps by its code (`failure`), with the error haptic.
 * 8. Two calls with the same `filtersKey` while one is in flight share one promise, so one request and one outcome.
 * 9. After every write that succeeded: `deps.onSuccess()`, the re-read of the radar lists.
 */
export function runSubscribe(deps: SubscribeDeps, filters: SearchFilters, entry: RadarEntry, relaxed?: string | null): Promise<Outcome> {
  const key = filtersKey(filters);
  const running = inflight.get(key);
  if (running !== undefined) {
    return running;
  }
  const flow = subscribeOnce(deps, filters, entry, relaxed).finally(() => inflight.delete(key));
  inflight.set(key, flow);
  return flow;
}

/**
 * «Сохранить» of the radar editor (SCR-029): `replaceRadar({ id, filters: toRadarFilters(filters, rules), relaxed? })`
 * through `withChatAccess`, then step 5 with the `updated…` toasts and «Расширить» on this radar. No twin check here
 * (legacy `saveEdit`): the server answers `radar_duplicate` for filters another radar has. An unknown radar →
 * «Не получилось сохранить» and the lists are read again.
 */
export async function runSaveEdit(deps: SubscribeDeps, id: string, filters: SearchFilters, relaxed?: string | null): Promise<Outcome> {
  const input = {
    id,
    filters: toRadarFilters(filters, deps.rules),
    ...(typeof relaxed === "string" && relaxed !== "" ? { relaxed } : {}),
  };
  const replaced = await withChatAccess(() => deps.invoke(replaceRadar, input), { restartText: deps.restartText });
  if (!replaced.ok) {
    return failure(replaced, deps);
  }
  deps.onSuccess();
  const mutation = normalizeMutation(replaced.data);
  return success(resultToast("updated", mutation, mutation.radar?.id ?? id, deps), mutation.radar);
}

/**
 * «Расширить» of a few toast: `relaxRadar({ id, code })` through `withChatAccess`; `starter > 0` → «Радар обновлён.
 * {count} …», else «Радар расширен — …» (legacy `relax`). Failures as step 7.
 */
export async function runRelax(deps: SubscribeDeps, id: string, code: string): Promise<Outcome> {
  const relaxed = await withChatAccess(() => deps.invoke(relaxRadar, { id, code }), { restartText: deps.restartText });
  if (!relaxed.ok) {
    return failure(relaxed, deps);
  }
  deps.onSuccess();
  const patch = normalizePatch(relaxed.data);
  return success(patch.starter > 0 ? updatedToast(patch.starter, deps.locale, deps.t) : relaxedEmptyToast(), patch.radar);
}

/** Forgets the subscribes in flight; tests only. */
export function resetSubscribes(): void {
  inflight.clear();
}

export interface SubscribeOptions {
  /** Where a failure's toast shows: the filters sheet and the radar forms pass `"sheet"`, so it shows over them. */
  scope?: ToastScope;
}

export interface Subscriber {
  subscribe: (filters: SearchFilters, entry: RadarEntry, relaxed?: string | null, options?: SubscribeOptions) => Promise<SubscribeResult>;
  saveEdit: (id: string, filters: SearchFilters, relaxed?: string | null, options?: SubscribeOptions) => Promise<SubscribeResult>;
  relax: (id: string, code: string) => Promise<SubscribeResult>;
}

/** Outcomes already shown: callers that shared one subscribe (step 8) show it once, not once each. */
const presented = new WeakSet<Outcome>();

/**
 * Plays the outcome's haptic, then shows its toast — in the app's host on success (the sheet that asked closes on
 * `ok`), in `scope` on failure (the sheet stays open) — and answers `{ ok }`.
 */
function present(outcome: Outcome, scope: ToastScope): SubscribeResult {
  if (!presented.has(outcome)) {
    presented.add(outcome);
    if (outcome.haptic === "success") {
      tg.haptic.success();
    } else if (outcome.haptic === "error") {
      tg.haptic.error();
    }
    if (outcome.toast !== null) {
      showToast(outcome.toast, outcome.ok ? "app" : scope);
    }
  }
  return { ok: outcome.ok };
}

/**
 * The subscribe flow bound to the page (WP-30): the locale, the catalogue, the reference's radar limit and
 * `searchRules(flags)`; each call runs the pure flow and presents its outcome (`present`). `subscribe` and `saveEdit`
 * take the toast scope of a failure (`"app"` by default); `relax` is «Расширить» of a few toast, so it always shows
 * in the app. The results resolve `{ ok }`.
 */
export function useSubscribe({ flags = devFlags }: { flags?: DevFlags } = {}): Subscriber {
  const locale = useLocale() as Locale;
  const t = useTranslations();
  const { radarLimit } = useReference();

  return useMemo(() => {
    const translate: Translate = (key, values) => t(key, values);
    const deps: SubscribeDeps = {
      invoke: (action, input) => invokeAction(action, input, locale),
      listRadars: fetchRadarList,
      cached: () => readResource<Radar[]>(RADARS_KEY),
      t: translate,
      locale,
      rules: searchRules(flags),
      limit: radarLimit,
      restartText: translate("chat.restart"),
      onSuccess: refreshRadars,
      relax: (id, code) => relax(id, code),
    };
    const relax = (id: string, code: string) => runRelax(deps, id, code).then((outcome) => present(outcome, "app"));
    return {
      subscribe: (filters, entry, relaxed, options) =>
        runSubscribe(deps, filters, entry, relaxed).then((outcome) => present(outcome, options?.scope ?? "app")),
      saveEdit: (id, filters, relaxed, options) =>
        runSaveEdit(deps, id, filters, relaxed).then((outcome) => present(outcome, options?.scope ?? "app")),
      relax,
    };
  }, [locale, t, radarLimit, flags]);
}
