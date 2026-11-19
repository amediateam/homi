import { getMessages } from "@homi/i18n";
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
  radars: undefined as unknown[] | undefined,
  radarsAsked: [] as boolean[],
  sent: [] as Sent[],
  subscribe: vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.query) }));
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: vi.fn(), reauthenticate: vi.fn() }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: state.status, me: null, renewed: false }) }));
vi.mock("@/lib/navigation/nav", () => ({ nav: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), tab: vi.fn() } }));
vi.mock("@/lib/api/browser", () => ({
  bffFetch: (path: string, options: BffOptions = {}) =>
    new Promise<ApiResult<unknown>>((resolve, reject) => {
      state.sent.push({ path, query: options.query, signal: options.signal, resolve });
      options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }),
}));
/** The radar list is `useRadars()`'s (tested in `tests/radars/useRadars.test.tsx`); the host reads it on the search tab. */
vi.mock("@/features/radars/useRadars", () => ({
  useRadars: ({ enabled = true }: { enabled?: boolean } = {}) => {
    state.radarsAsked.push(enabled);
    return { radars: state.radars, status: "success", error: null, refreshing: false, refetch: vi.fn(), replace: vi.fn(), remove: vi.fn() };
  },
}));
/** The flow is `useSubscribe()`'s (tested in `tests/radars/subscribe.test.ts`); the nudge only calls it. */
vi.mock("@/features/radars/subscribe", () => ({
  useSubscribe: () => ({ subscribe: (...args: unknown[]) => state.subscribe(...args), saveEdit: vi.fn(), relax: vi.fn() }),
}));

import { applyFilters } from "@/features/filters/applyFilters";
import { FOLLOW_DELAY_MS, FOLLOW_SHOW_MS, NUDGE_COOLDOWN_MS } from "@/features/nudges/constants";
import { NudgeHost } from "@/features/nudges/NudgeHost";
import { emptyNudgeState, readNudgeState, resetNudgeMemory } from "@/features/nudges/storage";
import { canTakeSlot, getNudgeSlot, releaseSlot, resetNudgeSlot, setReturnPending, slotTicket, takeSlot } from "@/features/nudges/store";
import { normalizeRadar } from "@/features/radars/normalize";
import { clearTracked, recentTracked } from "@/lib/analytics/events";
import { routes } from "@/lib/navigation/routes";
import { resetReference } from "@/lib/reference/useReference";
import { searchRules } from "@/lib/search/rules";
import { dismissToast, showToast } from "@/lib/ui/toast";

import { translator } from "../helpers/listing";
import { feedReference } from "../helpers/reference";

const NOW = Date.parse("2026-11-18T09:00:00Z");
const DEFAULT: SearchFilters = defaultFilters("rent_long", "tashkent");
const CUSTOM: SearchFilters = { ...DEFAULT, rooms_min: 2, rooms_max: 2 };
const OTHER: SearchFilters = { ...defaultFilters("sale", "tashkent"), rooms_min: 3, rooms_max: 3 };
const t = translator("ru");

function host(searchTab = true) {
  return (
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      <NudgeHost searchTab={searchTab} />
    </NextIntlClientProvider>
  );
}

let view: ReturnType<typeof render>;

/** A soft navigation: the shell (and the host in it) stays mounted and renders the new address. */
function go(pathname: string, filters: SearchFilters | null = null) {
  Object.assign(state, { pathname, query: filters === null ? "" : toSearchParams(filters).toString() });
  view.rerender(host());
}

async function flush() {
  await act(async () => {
    for (let index = 0; index < 5; index += 1) {
      await Promise.resolve();
    }
  });
}

/** «Показать» of a filters sheet over the feed: the listeners run, then the replace lands on the feed. */
async function apply(filters: SearchFilters) {
  await act(async () => {
    await applyFilters(filters, { sort: "new", target: routes.feed, city: null, rules: searchRules() });
  });
  go("/", filters);
}

async function wait(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

/** Answers the last flow request. */
async function answer(data: unknown) {
  state.sent.at(-1)!.resolve({ ok: true, data, meta: {} });
  await flush();
}

/** Applies `filters` and lets the nudge appear: the 1.8 s, the flow request and its answer. */
async function showFor(filters: SearchFilters, flow: unknown = { week: 3, days: 7 }) {
  await apply(filters);
  await wait(FOLLOW_DELAY_MS);
  await answer(flow);
}

const card = () => document.querySelector<HTMLElement>('[data-nudge="follow"]');
const flowRequests = () => state.sent.filter((request) => request.path === "listings/flow");
const events = () => recentTracked().map((event) => event.name);

let fake: FakeTelegram | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal("scrollTo", vi.fn());
  Object.assign(state, { pathname: "/", query: toSearchParams(DEFAULT).toString(), status: "ready", radars: [] });
  state.radarsAsked.length = 0;
  state.sent.length = 0;
  state.subscribe.mockReset();
  state.subscribe.mockResolvedValue({ ok: true });
  localStorage.clear();
  resetNudgeMemory();
  resetNudgeSlot();
  clearTracked();
  feedReference({ reference: { radars_enabled: true } });
  fake = fakeTelegram({ version: "8.0" });
  view = render(host());
});

afterEach(() => {
  cleanup();
  dismissToast();
  resetReference();
  resetNudgeSlot();
  vi.useRealTimers();
  fake?.uninstall();
  fake = null;
});

describe("NudgeHost: the follow nudge (SCR-040, BR-APP-043, BR-APP-046)", () => {
  it("appears 1.8 s after the feed list shows the applied custom filters, with the flow read for them", async () => {
    await apply(CUSTOM);
    await wait(FOLLOW_DELAY_MS - 1);
    expect(flowRequests()).toHaveLength(0);
    await wait(1);
    expect(flowRequests()).toHaveLength(1);
    expect(String(flowRequests()[0].query)).toBe(toApiQuery(CUSTOM, { rules: searchRules() }).toString());
    expect(flowRequests()[0].signal).toBeInstanceOf(AbortSignal);
    expect(card()).toBeNull();

    await answer({ week: 21, days: 7 });
    expect(card()?.textContent).toContain(t("nudge.title"));
    expect(document.querySelector('[data-slot="nudge-flow"]')?.textContent).toBe(t("alert.day", { n: 3 }));
    expect(events()).toEqual(["follow_prompt_shown"]);
    expect(readNudgeState()).toMatchObject({ asked: [filtersHash(CUSTOM)], lastShown: NOW + FOLLOW_DELAY_MS });
  });

  it("an empty flow answer shows the card without a flow line, and never crashes (LB-APP-006)", async () => {
    await showFor(CUSTOM, null);
    expect(card()).not.toBeNull();
    expect(document.querySelector('[data-slot="nudge-flow"]')).toBeNull();
  });

  it("never for default filters, and never twice for the same filters", async () => {
    await apply(defaultFilters("sale", "tashkent"));
    await wait(5 * FOLLOW_DELAY_MS);
    expect(flowRequests()).toHaveLength(0);

    await showFor(CUSTOM);
    await wait(FOLLOW_SHOW_MS);
    vi.setSystemTime(Date.now() + NUDGE_COOLDOWN_MS);
    await apply(DEFAULT);
    await apply(CUSTOM);
    await wait(5 * FOLLOW_DELAY_MS);
    expect(flowRequests()).toHaveLength(1);
    expect(card()).toBeNull();
  });

  it("with radars switched off: no nudge and no flow request (DEC-51)", async () => {
    feedReference({ reference: { radars_enabled: false } });
    await apply(CUSTOM);
    await wait(5 * FOLLOW_DELAY_MS);
    expect(state.sent).toHaveLength(0);
    expect(card()).toBeNull();
    expect(getNudgeSlot().followPending).toBe(false);
  });

  it("not for filters a radar already has; the radar list is read on the search tab only", async () => {
    state.radars = [normalizeRadar({ id: "01JD0000000000000000000001", active: false, mode: "digest", hidden: 0, created_at: null, filters: CUSTOM })];
    go("/", DEFAULT);
    await apply(CUSTOM);
    await wait(5 * FOLLOW_DELAY_MS);
    expect(flowRequests()).toHaveLength(0);
    expect(state.radarsAsked.every((enabled) => enabled)).toBe(true);

    view.rerender(host(false));
    expect(state.radarsAsked.at(-1)).toBe(false);
  });

  it("is announced: a polite live line, in the document before the card appears, holds its title while it is shown", async () => {
    const live = document.querySelector<HTMLElement>("[data-nudge-live]")!;
    expect(live.getAttribute("role")).toBe("status");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.hasAttribute("data-nudge")).toBe(false);
    expect(live.textContent).toBe("");

    await showFor(CUSTOM);
    expect(document.querySelector("[data-nudge-live]")).toBe(live);
    expect(live.textContent).toBe(t("nudge.title"));
    expect(card()!.contains(live)).toBe(false);
    expect(card()!.getAttribute("aria-live")).toBe("off");

    await act(async () => showToast("Готово"));
    expect(live.textContent).toBe("");
    await act(async () => dismissToast());
    expect(live.textContent).toBe(t("nudge.title"));

    await wait(FOLLOW_SHOW_MS);
    expect(card()).toBeNull();
    expect(document.querySelector("[data-nudge-live]")).toBe(live);
    expect(live.textContent).toBe("");
  });

  it("hides itself after 10 s: follow_prompt_expired, the slot free", async () => {
    await showFor(CUSTOM);
    await wait(FOLLOW_SHOW_MS - 1);
    expect(card()).not.toBeNull();
    await wait(1);
    expect(card()).toBeNull();
    expect(events()).toEqual(["follow_prompt_shown", "follow_prompt_expired"]);
    expect(getNudgeSlot().active).toBeNull();
  });

  it("× counts: three closes in a row silence it for 14 days (follow_prompt_closed each time)", async () => {
    const searches = [CUSTOM, OTHER, { ...CUSTOM, rooms_min: 1, rooms_max: 1 }, { ...CUSTOM, rooms_min: 4, rooms_max: 4 }];
    for (const filters of searches.slice(0, 3)) {
      await showFor(filters);
      fireEvent.click(document.querySelector('[data-action="close"]')!);
      expect(card()).toBeNull();
      vi.setSystemTime(Date.now() + NUDGE_COOLDOWN_MS);
    }
    expect(events()).toEqual(Array.from({ length: 3 }, () => ["follow_prompt_shown", "follow_prompt_closed"]).flat());
    expect(readNudgeState()).toMatchObject({ closed: 0, quietUntil: NOW + 3 * FOLLOW_DELAY_MS + 2 * NUDGE_COOLDOWN_MS + 14 * 24 * 3600_000 });

    await apply(searches[3]);
    await wait(5 * FOLLOW_DELAY_MS);
    expect(flowRequests()).toHaveLength(3);
  });

  it("«Включить»: a medium impact, the nudge gone, the streak reset, the radar turned on with entry «prompt»", async () => {
    localStorage.setItem("homi-nudge", JSON.stringify({ ...emptyNudgeState(), closed: 2 }));
    await showFor(CUSTOM);
    fireEvent.click(document.querySelector('[data-action="enable"]')!);
    expect(card()).toBeNull();
    expect(state.subscribe).toHaveBeenCalledWith(CUSTOM, "prompt");
    expect(readNudgeState().closed).toBe(0);
    expect(getNudgeSlot().active).toBeNull();
    expect(fake?.calls.filter((entry) => entry.member === "HapticFeedback.impactOccurred").map((entry) => entry.args[0])).toEqual(["medium"]);
    expect(events()).toEqual(["follow_prompt_shown"]);
  });

  it("a toast or a layer suspends it without an event; it comes back on the same filters with a fresh 10 s", async () => {
    await showFor(CUSTOM);
    await wait(6000);
    await act(async () => showToast("Готово"));
    expect(card()).toBeNull();
    await wait(2000);
    expect(card()).toBeNull();
    await act(async () => dismissToast());
    expect(card()).not.toBeNull();
    await wait(FOLLOW_SHOW_MS - 1);
    expect(card()).not.toBeNull();

    go("/listing/42");
    expect(card()).toBeNull();
    go("/", CUSTOM);
    await wait(FOLLOW_SHOW_MS - 1);
    expect(card()).not.toBeNull();
    await wait(1);
    expect(card()).toBeNull();
    expect(events()).toEqual(["follow_prompt_shown", "follow_prompt_expired"]);
  });

  it("a filter change ends it without an event; the old filters do not bring it back", async () => {
    await showFor(CUSTOM);
    go("/", OTHER);
    expect(card()).toBeNull();
    go("/", CUSTOM);
    expect(card()).toBeNull();
    expect(getNudgeSlot().active).toBeNull();
    expect(events()).toEqual(["follow_prompt_shown"]);
  });

  it("a candidate dropped before it rendered leaves no trace: no cooldown, no hash, no event (LB-APP-050)", async () => {
    await apply(CUSTOM);
    await wait(FOLLOW_DELAY_MS - 1);
    go("/", OTHER);
    await wait(5 * FOLLOW_DELAY_MS);

    await apply(CUSTOM);
    await wait(FOLLOW_DELAY_MS);
    go("/filters", CUSTOM);
    expect(flowRequests().at(-1)?.signal?.aborted).toBe(true);
    await flush();

    expect(card()).toBeNull();
    expect(readNudgeState()).toEqual(emptyNudgeState());
    expect(events()).toEqual([]);
  });

  it("a toast before the first render holds it back: it renders, and is marked, only once the toast is gone", async () => {
    await apply(CUSTOM);
    await wait(FOLLOW_DELAY_MS);
    await act(async () => showToast("Готово"));
    await answer({ week: 0, days: 7 });
    expect(card()).toBeNull();
    expect(readNudgeState()).toEqual(emptyNudgeState());
    expect(events()).toEqual([]);

    vi.setSystemTime(Date.now() + 1000);
    await act(async () => dismissToast());
    expect(document.querySelector('[data-slot="nudge-flow"]')?.textContent).toBe(t("nudge.none"));
    expect(readNudgeState().lastShown).toBe(NOW + FOLLOW_DELAY_MS + 1000);
    expect(events()).toEqual(["follow_prompt_shown"]);
  });

  it("waits while the session is not ready", async () => {
    state.status = "booting";
    await apply(CUSTOM);
    await wait(5 * FOLLOW_DELAY_MS);
    expect(flowRequests()).toHaveLength(0);
    state.status = "ready";
    view.rerender(host());
    await wait(FOLLOW_DELAY_MS);
    expect(flowRequests()).toHaveLength(1);
  });
});

describe("NudgeHost: one slot, a fixed priority (LB-APP-049)", () => {
  it("refuses the home offer while a follow candidate, a follow nudge or a pending return check exists", async () => {
    expect(canTakeSlot("home")).toBe(true);
    await apply(CUSTOM);
    expect(canTakeSlot("home")).toBe(false);
    expect(takeSlot("home")).toBeNull();
    await wait(FOLLOW_DELAY_MS);
    expect(canTakeSlot("home")).toBe(false);
    await answer(null);
    expect(card()).not.toBeNull();
    expect(canTakeSlot("home")).toBe(false);
    await wait(FOLLOW_SHOW_MS);
    expect(canTakeSlot("home")).toBe(true);

    setReturnPending("abc");
    expect(canTakeSlot("home")).toBe(false);
    setReturnPending(null);
    expect(takeSlot("home")).not.toBeNull();
  });

  it("a follow nudge takes the slot from a home offer", async () => {
    const home = takeSlot("home")!;
    await showFor(CUSTOM);
    expect(getNudgeSlot().active).toBe("follow");
    expect(slotTicket("home")).toBeNull();
    releaseSlot("home", home);
    expect(getNudgeSlot().active).toBe("follow");
  });

  it("a return banner hides a home offer, which can come back later, and drops a follow nudge for good", async () => {
    takeSlot("home");
    const back = takeSlot("return")!;
    expect(slotTicket("home")).toBeNull();
    releaseSlot("return", back);
    expect(canTakeSlot("home")).toBe(true);
    expect(takeSlot("home")).not.toBeNull();
    resetNudgeSlot();

    await showFor(CUSTOM);
    expect(card()).not.toBeNull();
    const banner = takeSlot("return")!;
    await flush();
    expect(card()).toBeNull();
    releaseSlot("return", banner);
    await wait(FOLLOW_SHOW_MS);
    expect(card()).toBeNull();
    expect(getNudgeSlot()).toEqual({ active: null, followPending: false, returnPending: null });
    expect(events()).toEqual(["follow_prompt_shown"]);
  });

  it("a follow nudge never displaces a return banner: its candidate is dropped and nothing is marked", async () => {
    takeSlot("return");
    await apply(CUSTOM);
    await wait(5 * FOLLOW_DELAY_MS);
    expect(flowRequests()).toHaveLength(0);
    expect(card()).toBeNull();
    expect(getNudgeSlot()).toEqual({ active: "return", followPending: false, returnPending: null });
    expect(readNudgeState()).toEqual(emptyNudgeState());
  });

  it("a return check of the same filters holds the follow nudge back until it ends (BR-APP-046)", async () => {
    await apply(CUSTOM);
    await act(async () => setReturnPending(filtersHash(CUSTOM)));
    await wait(5 * FOLLOW_DELAY_MS);
    expect(flowRequests()).toHaveLength(0);
    await act(async () => setReturnPending(null));
    await wait(FOLLOW_DELAY_MS);
    expect(flowRequests()).toHaveLength(1);
  });
});
