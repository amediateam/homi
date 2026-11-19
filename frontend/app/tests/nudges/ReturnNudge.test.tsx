import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { formatNumber } from "@homi/i18n/format";
import { defaultFilters, filtersHash, type SearchFilters, toApiQuery, toSearchParams } from "@homi/search";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BffOptions } from "@/lib/api/browser";
import type { ApiResult } from "@/lib/api/types";

/** One `bffFetch` the host sent; the test answers it when it wants. */
interface Sent {
  path: string;
  query: BffOptions["query"];
  signal: AbortSignal | undefined;
  resolve: (answer: ApiResult<unknown>) => void;
}

const state = vi.hoisted(() => ({
  pathname: "/",
  query: "",
  status: "ready" as string,
  radars: [] as unknown[] | undefined,
  sent: [] as Sent[],
  subscribe: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.query) }));
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: vi.fn(), reauthenticate: vi.fn() }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: state.status, me: null, renewed: false }) }));
vi.mock("@/lib/navigation/nav", () => ({ nav: { push: (href: string) => state.push(href), replace: vi.fn(), back: vi.fn(), tab: vi.fn() } }));
vi.mock("@/lib/api/browser", () => ({
  bffFetch: (path: string, options: BffOptions = {}) =>
    new Promise<ApiResult<unknown>>((resolve, reject) => {
      state.sent.push({ path, query: options.query, signal: options.signal, resolve });
      options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }),
}));
/** The radar list is `useRadars()`'s (tested in `tests/radars/useRadars.test.tsx`); a new visit session re-reads it. */
vi.mock("@/features/radars/useRadars", () => ({
  useRadars: () => ({ radars: state.radars, status: "success", error: null, refreshing: false, refetch: vi.fn(), replace: vi.fn(), remove: vi.fn() }),
  refreshRadars: () => state.refresh(),
}));
/** The flow is `useSubscribe()`'s (tested in `tests/radars/subscribe.test.ts`); the banner only calls it. */
vi.mock("@/features/radars/subscribe", () => ({
  useSubscribe: () => ({ subscribe: (...args: unknown[]) => state.subscribe(...args), saveEdit: vi.fn(), relax: vi.fn() }),
}));

import { CLOSE_QUIET_MS, FOLLOW_DELAY_MS, RETURN_DELAY_MS, RETURN_SHOW_MS } from "@/features/nudges/constants";
import { NudgeHost } from "@/features/nudges/NudgeHost";
import { ReturnNudge } from "@/features/nudges/ReturnNudge";
import { emptyNudgeState, readNudgeState, resetNudgeMemory } from "@/features/nudges/storage";
import { getNudgeSlot, resetNudgeSlot, slotTicket, takeSlot } from "@/features/nudges/store";
import { resetVisitSession } from "@/features/nudges/visits";
import { normalizeRadar } from "@/features/radars/normalize";
import { applyFilters } from "@/features/filters/applyFilters";
import { clearTracked, recentTracked } from "@/lib/analytics/events";
import { routes } from "@/lib/navigation/routes";
import { resetReference } from "@/lib/reference/useReference";
import { searchRules } from "@/lib/search/rules";
import { dismissToast, showToast } from "@/lib/ui/toast";

import { translator } from "../helpers/listing";
import { feedReference } from "../helpers/reference";

const NOW = Date.parse("2026-11-18T09:00:00Z");
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DEFAULT: SearchFilters = defaultFilters("rent_long", "tashkent");
/** Two-room long-term rent in Tashkent: a custom search. */
const CUSTOM: SearchFilters = { ...DEFAULT, rooms_min: 2, rooms_max: 2 };
const OTHER: SearchFilters = { ...defaultFilters("sale", "tashkent"), rooms_min: 3, rooms_max: 3 };

const card = () => document.querySelector<HTMLElement>('[data-nudge="return"]');
const followCard = () => document.querySelector<HTMLElement>('[data-nudge="follow"]');
const newRequests = () => state.sent.filter((request) => request.path === "listings/new");
const events = () => recentTracked().map((event) => ({ name: event.name, props: event.props }));
const impacts = (fake: FakeTelegram | null) =>
  fake?.calls.filter((entry) => entry.member === "HapticFeedback.impactOccurred").map((entry) => entry.args[0]);

async function flush() {
  await act(async () => {
    for (let index = 0; index < 5; index += 1) {
      await Promise.resolve();
    }
  });
}

async function wait(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

let fake: FakeTelegram | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal("scrollTo", vi.fn());
  Object.assign(state, { pathname: "/", query: toSearchParams(DEFAULT).toString(), status: "ready", radars: [] });
  state.sent.length = 0;
  state.subscribe.mockReset();
  state.subscribe.mockResolvedValue({ ok: true });
  state.push.mockReset();
  state.refresh.mockReset();
  localStorage.clear();
  resetNudgeMemory();
  resetNudgeSlot();
  resetVisitSession();
  clearTracked();
  feedReference({ reference: { radars_enabled: true } });
  fake = fakeTelegram({ version: "8.0" });
});

afterEach(() => {
  cleanup();
  dismissToast();
  resetReference();
  resetNudgeSlot();
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  vi.useRealTimers();
  fake?.uninstall();
  fake = null;
});

describe("ReturnNudge: the card (SCR-046)", () => {
  const handlers = () => ({ onShown: vi.fn(), onExpire: vi.fn(), onClose: vi.fn(), onEnable: vi.fn() });

  function show(locale: Locale, filters: SearchFilters, count: number, on = handlers()) {
    takeSlot("return");
    render(
      <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
        <ReturnNudge filters={filters} count={count} {...on} />
      </NextIntlClientProvider>,
    );
    return on;
  }

  const title = () => card()?.querySelector("b")?.textContent;

  it.each([
    ["ru", "С вашего прошлого захода — 1 новое", "С вашего прошлого захода — 12 новых"],
    ["uz", "Oxirgi kirganingizdan beri — 1 ta yangi", "Oxirgi kirganingizdan beri — 12 ta yangi"],
    ["en", "1 new since your last visit", "12 new since your last visit"],
  ] as const)("titles in %s for 1, 12 and 1 234 (the number locale)", (locale, one, twelve) => {
    show(locale, CUSTOM, 1);
    expect(title()).toBe(one);
    cleanup();
    show(locale, CUSTOM, 12);
    expect(title()).toBe(twelve);
    cleanup();
    show(locale, CUSTOM, 1234);
    const thousands = formatNumber(1234, locale);
    expect(thousands).not.toBe("1234");
    expect(title()).toBe(twelve.replace("12", thousands));
  });

  it("the hint wraps instead of being cut; «Включить» for custom filters, «Настроить» for default ones; × is named", () => {
    const t = translator("ru");
    show("ru", CUSTOM, 3);
    const hint = card()!.querySelector("span")!;
    expect(hint.textContent).toBe(t("back.what"));
    expect(hint.className).not.toMatch(/truncate|nowrap|ellipsis/);
    expect(card()!.querySelector('[data-action="enable"]')?.textContent).toBe(t("nudge.enable"));
    expect(card()!.querySelector('[data-action="close"]')?.getAttribute("aria-label")).toBe(t("common.close"));
    expect(card()!.getAttribute("role")).toBe("status");
    cleanup();
    show("ru", DEFAULT, 3);
    expect(card()!.querySelector('[data-action="enable"]')?.textContent).toBe(t("nudge.setup"));
  });

  it("«Включить»: a medium impact, the host told first, then subscribe(filters, «return»)", () => {
    const on = show("ru", CUSTOM, 3);
    fireEvent.click(card()!.querySelector('[data-action="enable"]')!);
    expect(impacts(fake)).toEqual(["medium"]);
    expect(on.onEnable).toHaveBeenCalledTimes(1);
    expect(state.subscribe).toHaveBeenCalledWith(CUSTOM, "return");
    expect(state.push).not.toHaveBeenCalled();
  });

  it("«Настроить»: «Новый радар» with this search and entry=return", () => {
    const on = show("ru", DEFAULT, 3);
    fireEvent.click(card()!.querySelector('[data-action="enable"]')!);
    expect(on.onEnable).toHaveBeenCalledTimes(1);
    expect(state.push).toHaveBeenCalledWith(routes.radarNew(toSearchParams(DEFAULT), "return"));
    expect(state.push.mock.calls[0][0]).toBe("/radars/new?city=tashkent&entry=return");
    expect(state.subscribe).not.toHaveBeenCalled();
    expect(impacts(fake)).toEqual(["medium"]);
  });

  it("15 s from its mount: onExpire; marks once on the first render, not on a re-render", () => {
    const on = show("ru", CUSTOM, 3);
    expect(on.onShown).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(RETURN_SHOW_MS - 1);
    expect(on.onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(on.onExpire).toHaveBeenCalledTimes(1);
    expect(on.onShown).toHaveBeenCalledTimes(1);
  });
});

describe("NudgeHost: the return banner (SCR-046, BR-APP-070, BR-APP-071)", () => {
  let view: ReturnType<typeof render>;

  function host() {
    return (
      <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
        <NudgeHost searchTab={state.pathname === "/" || state.pathname === "/map" || state.pathname.startsWith("/listing")} />
      </NextIntlClientProvider>
    );
  }

  /** A soft navigation: the shell (and the host in it) stays mounted and renders the new address. */
  function go(pathname: string, filters: SearchFilters | null = null) {
    Object.assign(state, { pathname, query: filters === null ? "" : toSearchParams(filters).toString() });
    view.rerender(host());
  }

  /** `homi-visits` as a previous launch left it. */
  function visited(filters: SearchFilters, at: number) {
    localStorage.setItem("homi-visits", JSON.stringify({ [filtersHash(filters)]: at }));
  }

  /** Opens the app on the feed of `filters`. */
  function launch(filters: SearchFilters) {
    state.query = toSearchParams(filters).toString();
    view = render(host());
  }

  async function answer(data: unknown, request: Sent | undefined = newRequests().at(-1)) {
    request!.resolve({ ok: true, data, meta: { source: "stub" } });
    await flush();
  }

  /** The banner of `filters` after a visit 7 h ago, answered with `count`. */
  async function showFor(filters: SearchFilters, count = 12) {
    visited(filters, NOW - 7 * HOUR);
    launch(filters);
    await wait(RETURN_DELAY_MS);
    await answer({ count });
  }

  it("1.8 s after the list opens: GET /listings/new with the filters and since in seconds, then «… — 12 новых»", async () => {
    visited(CUSTOM, NOW - 7 * HOUR + 456);
    launch(CUSTOM);
    expect(getNudgeSlot().returnPending).toBe(filtersHash(CUSTOM));
    await wait(RETURN_DELAY_MS - 1);
    expect(newRequests()).toHaveLength(0);
    await wait(1);
    expect(newRequests()).toHaveLength(1);
    const query = new URLSearchParams(newRequests()[0].query as URLSearchParams);
    expect(query.get("since")).toBe(String(Math.floor((NOW - 7 * HOUR + 456) / 1000)));
    query.delete("since");
    expect(query.toString()).toBe(toApiQuery(CUSTOM, { rules: searchRules() }).toString());
    expect(newRequests()[0].signal).toBeInstanceOf(AbortSignal);
    expect(card()).toBeNull();

    await answer({ count: 12 });
    expect(card()?.querySelector("b")?.textContent).toBe("С вашего прошлого захода — 12 новых");
    expect(events()).toEqual([{ name: "return_prompt_shown", props: { n: 12, custom: true } }]);
    expect(readNudgeState()).toMatchObject({
      asked: [filtersHash(CUSTOM)],
      lastShown: NOW + RETURN_DELAY_MS,
      back: { [filtersHash(CUSTOM)]: NOW + RETURN_DELAY_MS },
    });
    expect(JSON.parse(localStorage.getItem("homi-visits")!)).toEqual({ [filtersHash(CUSTOM)]: NOW });
  });

  it.each([[{ count: 0 }], [{ count: "12" }], [{ count: null }], [{ count: 1.5 }], [{}], [null]])("no banner and no crash for %j (LB-APP-048)", async (data) => {
    visited(CUSTOM, NOW - 7 * HOUR);
    launch(CUSTOM);
    await wait(RETURN_DELAY_MS);
    await answer(data);
    expect(card()).toBeNull();
    expect(getNudgeSlot()).toEqual({ active: null, followPending: false, returnPending: null });
    expect(readNudgeState()).toEqual(emptyNudgeState());
  });

  it("is announced: the host's live line, there before the banner, holds its title while it is shown", async () => {
    visited(CUSTOM, NOW - 7 * HOUR);
    launch(CUSTOM);
    const live = document.querySelector<HTMLElement>("[data-nudge-live]")!;
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toBe("");

    await wait(RETURN_DELAY_MS);
    await answer({ count: 12 });
    expect(card()).not.toBeNull();
    expect(document.querySelector("[data-nudge-live]")).toBe(live);
    expect(live.textContent).toBe("С вашего прошлого захода — 12 новых");
    expect(card()!.getAttribute("aria-live")).toBe("off");

    await wait(RETURN_SHOW_MS);
    expect(card()).toBeNull();
    expect(live.textContent).toBe("");
  });

  it("a failed read ends the check silently: no banner, no toast", async () => {
    visited(CUSTOM, NOW - 7 * HOUR);
    launch(CUSTOM);
    await wait(RETURN_DELAY_MS);
    newRequests()[0].resolve({ ok: false, error: "server", status: 500, method: "GET", path: "listings/new" });
    await flush();
    expect(card()).toBeNull();
    expect(document.querySelector('[data-slot="toast"]')).toBeNull();
    expect(getNudgeSlot().returnPending).toBeNull();
  });

  it("a visit 1 h ago: no banner and no request; nor before the reference data", async () => {
    visited(CUSTOM, NOW - HOUR);
    launch(CUSTOM);
    await wait(10 * RETURN_DELAY_MS);
    expect(newRequests()).toHaveLength(0);
    cleanup();

    resetVisitSession();
    feedReference({ reference: null });
    visited(CUSTOM, NOW - 7 * HOUR);
    launch(CUSTOM);
    await wait(10 * RETURN_DELAY_MS);
    expect(newRequests()).toHaveLength(0);
    expect(localStorage.getItem("homi-visits")).toBe(JSON.stringify({ [filtersHash(CUSTOM)]: NOW - 7 * HOUR }));
  });

  it("radars switched off: the visit is recorded, but no banner and no GET /listings/new (DEC-51)", async () => {
    feedReference({ reference: { radars_enabled: false } });
    visited(DEFAULT, NOW - 7 * HOUR);
    launch(DEFAULT);
    await wait(10 * RETURN_DELAY_MS);
    expect(state.sent).toHaveLength(0);
    expect(card()).toBeNull();
    expect(JSON.parse(localStorage.getItem("homi-visits")!)).toEqual({ [filtersHash(DEFAULT)]: NOW });
  });

  it("not for a search a radar covers: default filters and a radar of the same deal and city", async () => {
    state.radars = [normalizeRadar({ id: "01JD0000000000000000000001", active: false, mode: "digest", hidden: 0, created_at: null, filters: CUSTOM })];
    visited(DEFAULT, NOW - 7 * HOUR);
    launch(DEFAULT);
    await wait(10 * RETURN_DELAY_MS);
    expect(newRequests()).toHaveLength(0);
  });

  it("default filters: «Настроить» opens «Новый радар» with entry=return and resets the streak; the banner goes", async () => {
    localStorage.setItem("homi-nudge", JSON.stringify({ ...emptyNudgeState(), closed: 2 }));
    await showFor(DEFAULT, 3);
    expect(card()?.querySelector('[data-action="enable"]')?.textContent).toBe("Настроить");
    fireEvent.click(card()!.querySelector('[data-action="enable"]')!);
    expect(card()).toBeNull();
    expect(state.push).toHaveBeenCalledWith("/radars/new?city=tashkent&entry=return");
    expect(readNudgeState().closed).toBe(0);
    expect(getNudgeSlot().active).toBeNull();
    expect(events().map((event) => event.name)).toEqual(["return_prompt_shown"]);
  });

  it("custom filters: «Включить» turns the radar on with entry «return»", async () => {
    await showFor(CUSTOM);
    fireEvent.click(card()!.querySelector('[data-action="enable"]')!);
    expect(state.subscribe).toHaveBeenCalledWith(CUSTOM, "return");
    expect(card()).toBeNull();
    expect(impacts(fake)).toEqual(["medium"]);
  });

  it("hides itself after 15 s: return_prompt_expired { custom }", async () => {
    await showFor(DEFAULT);
    await wait(RETURN_SHOW_MS - 1);
    expect(card()).not.toBeNull();
    await wait(1);
    expect(card()).toBeNull();
    expect(events()).toEqual([
      { name: "return_prompt_shown", props: { n: 12, custom: false } },
      { name: "return_prompt_expired", props: { custom: false } },
    ]);
    expect(getNudgeSlot().active).toBeNull();
  });

  it("× counts towards the follow nudge's streak: return_prompt_closed, and the third close silences both", async () => {
    localStorage.setItem("homi-nudge", JSON.stringify({ ...emptyNudgeState(), closed: 2 }));
    await showFor(CUSTOM);
    fireEvent.click(card()!.querySelector('[data-action="close"]')!);
    expect(card()).toBeNull();
    expect(events().at(-1)).toEqual({ name: "return_prompt_closed", props: { custom: true } });
    expect(readNudgeState()).toMatchObject({ closed: 0, quietUntil: NOW + RETURN_DELAY_MS + CLOSE_QUIET_MS });
  });

  it("not rendered under a toast; it comes back on the same filters with a fresh 15 s", async () => {
    await showFor(CUSTOM);
    await act(async () => showToast("Готово"));
    expect(card()).toBeNull();
    await wait(RETURN_SHOW_MS);
    await act(async () => dismissToast());
    expect(card()).not.toBeNull();
    await wait(RETURN_SHOW_MS - 1);
    expect(card()).not.toBeNull();
    expect(events().map((event) => event.name)).toEqual(["return_prompt_shown"]);
  });

  it("a toast before the first render holds it back: it renders, and is marked, only once the toast is gone", async () => {
    visited(CUSTOM, NOW - 7 * HOUR);
    launch(CUSTOM);
    await wait(RETURN_DELAY_MS);
    await act(async () => showToast("Готово"));
    await answer({ count: 4 });
    expect(card()).toBeNull();
    expect(readNudgeState()).toEqual(emptyNudgeState());
    expect(events()).toEqual([]);
    await act(async () => dismissToast());
    expect(card()).not.toBeNull();
    expect(events()).toEqual([{ name: "return_prompt_shown", props: { n: 4, custom: true } }]);
  });

  it("a filter change during the request aborts it and leaves no trace; a filter change ends a banner without an event", async () => {
    visited(CUSTOM, NOW - 7 * HOUR);
    launch(CUSTOM);
    await wait(RETURN_DELAY_MS);
    go("/", OTHER);
    expect(newRequests()[0].signal?.aborted).toBe(true);
    expect(getNudgeSlot().returnPending).toBeNull();
    expect(readNudgeState()).toEqual(emptyNudgeState());
    cleanup();

    resetVisitSession();
    await showFor(CUSTOM);
    go("/", OTHER);
    expect(card()).toBeNull();
    go("/", CUSTOM);
    expect(card()).toBeNull();
    expect(getNudgeSlot().active).toBeNull();
    expect(events().map((event) => event.name)).toEqual(["return_prompt_shown"]);
  });

  it("a listing opened during the wait drops the check; Back to the same list brings no new visit", async () => {
    visited(CUSTOM, NOW - 7 * HOUR);
    launch(CUSTOM);
    await wait(RETURN_DELAY_MS - 1);
    go("/listing/42");
    await wait(10 * RETURN_DELAY_MS);
    go("/", CUSTOM);
    await wait(10 * RETURN_DELAY_MS);
    expect(newRequests()).toHaveLength(0);
    expect(getNudgeSlot().returnPending).toBeNull();
  });

  it("does not come back for the same filters within 2 days", async () => {
    await showFor(CUSTOM);
    await wait(RETURN_SHOW_MS);
    cleanup();
    resetVisitSession();
    vi.setSystemTime(NOW + 9 * HOUR);
    launch(CUSTOM);
    await wait(10 * RETURN_DELAY_MS);
    expect(newRequests()).toHaveLength(1);
  });

  it("after 6 h in the background a new visit session re-reads the radars and checks the search again", async () => {
    visited(CUSTOM, NOW - HOUR);
    launch(CUSTOM);
    await wait(10 * RETURN_DELAY_MS);
    expect(newRequests()).toHaveLength(0);

    const hiddenAt = Date.now();
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    vi.setSystemTime(hiddenAt + 6 * HOUR);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(state.refresh).toHaveBeenCalledTimes(1);
    await wait(RETURN_DELAY_MS);
    expect(newRequests()).toHaveLength(1);
    expect(new URLSearchParams(newRequests()[0].query as URLSearchParams).get("since")).toBe(String(Math.floor(hiddenAt / 1000)));
  });

  it("back after 6 h under a listing opened from the feed: the check waits for the listing to close, then the banner", async () => {
    visited(CUSTOM, NOW - HOUR);
    launch(CUSTOM);
    await wait(10 * RETURN_DELAY_MS);
    go("/listing/42");
    await wait(RETURN_DELAY_MS);

    const hiddenAt = Date.now();
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    vi.setSystemTime(hiddenAt + 7 * HOUR);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(state.refresh).toHaveBeenCalledTimes(1);
    await wait(10 * RETURN_DELAY_MS);
    expect(newRequests()).toHaveLength(0);
    expect(getNudgeSlot().returnPending).toBeNull();

    go("/", CUSTOM);
    await wait(RETURN_DELAY_MS - 1);
    expect(newRequests()).toHaveLength(0);
    await wait(1);
    expect(newRequests()).toHaveLength(1);
    expect(new URLSearchParams(newRequests()[0].query as URLSearchParams).get("since")).toBe(String(Math.floor(hiddenAt / 1000)));
    await answer({ count: 12 });
    expect(card()?.querySelector("b")?.textContent).toBe("С вашего прошлого захода — 12 новых");
  });
});

describe("NudgeHost: one slot, the return banner first (LB-APP-049)", () => {
  let view: ReturnType<typeof render>;

  function host() {
    return (
      <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
        <NudgeHost searchTab />
      </NextIntlClientProvider>
    );
  }

  function go(filters: SearchFilters) {
    state.query = toSearchParams(filters).toString();
    view.rerender(host());
  }

  it("a pending check of the applied filters holds the follow nudge back; the banner then drops its candidate", async () => {
    localStorage.setItem("homi-visits", JSON.stringify({ [filtersHash(CUSTOM)]: NOW - 7 * HOUR }));
    view = render(host());
    await act(async () => {
      await applyFilters(CUSTOM, { sort: "new", target: routes.feed, city: null, rules: searchRules() });
    });
    go(CUSTOM);
    expect(getNudgeSlot()).toMatchObject({ followPending: true, returnPending: filtersHash(CUSTOM) });
    await wait(RETURN_DELAY_MS);
    const request = state.sent.find((sent) => sent.path === "listings/new")!;
    request.resolve({ ok: true, data: { count: 2 }, meta: {} });
    await flush();
    expect(card()).not.toBeNull();
    expect(getNudgeSlot()).toEqual({ active: "return", followPending: false, returnPending: null });

    await wait(RETURN_SHOW_MS);
    await wait(5 * FOLLOW_DELAY_MS);
    expect(state.sent.filter((sent) => sent.path === "listings/flow")).toHaveLength(0);
    expect(followCard()).toBeNull();
  });

  it("the banner hides a home offer, which can take the slot again once the banner is gone", async () => {
    localStorage.setItem("homi-visits", JSON.stringify({ [filtersHash(DEFAULT)]: NOW - 7 * HOUR }));
    const home = takeSlot("home");
    expect(home).not.toBeNull();
    view = render(host());
    await wait(RETURN_DELAY_MS);
    state.sent.at(-1)!.resolve({ ok: true, data: { count: 2 }, meta: {} });
    await flush();
    expect(slotTicket("home")).toBeNull();
    expect(takeSlot("home")).toBeNull();
    fireEvent.click(card()!.querySelector('[data-action="close"]')!);
    expect(takeSlot("home")).not.toBeNull();
  });
});
