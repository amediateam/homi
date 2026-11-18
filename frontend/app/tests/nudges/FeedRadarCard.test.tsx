import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getMessages } from "@homi/i18n";
import { defaultFilters, type SearchFilters, toSearchParams } from "@homi/search";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ListingPreview } from "@/features/feed/types";
import type { ApiResult } from "@/lib/api/types";

type Answer = ApiResult<ListingPreview[]>;

const state = vi.hoisted(() => ({
  pathname: "/",
  search: "",
  radars: [] as unknown[] | undefined,
  sent: [] as { path: string }[],
  subscribe: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/lib/api/browser", () => ({
  bffFetch: (path: string) => {
    state.sent.push({ path });
    return new Promise<Answer>(() => undefined);
  },
}));
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: vi.fn(), reauthenticate: vi.fn() }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: "ready", me: null, renewed: false }) }));
vi.mock("@/lib/actions/favorites", () => ({ setFavorite: vi.fn() }));
vi.mock("@/lib/navigation/nav", () => ({ nav: { push: (href: string) => state.push(href), replace: vi.fn(), back: vi.fn(), tab: vi.fn() } }));
vi.mock("@/lib/graphics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/graphics")>()),
  measureScrollPerformance: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => `/ru${state.pathname === "/" ? "" : state.pathname}`,
  useSearchParams: () => new URLSearchParams(state.search),
}));
/** The counted `Link` needs the App Router: a plain anchor that never navigates. */
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => state.pathname,
  Link: ({ href, prefetch, scroll, ...props }: ComponentProps<"a"> & { href: string; prefetch?: boolean; scroll?: boolean }) => (
    <a {...props} href={href} data-prefetch={String(prefetch)} data-scroll={String(scroll)} />
  ),
}));
/** The radar list is `useRadars()`'s (tested in `tests/radars/useRadars.test.tsx`); the card only reads it. */
vi.mock("@/features/radars/useRadars", () => ({
  useRadars: () => ({ radars: state.radars, status: "success", error: null, refreshing: false, refetch: vi.fn(), replace: vi.fn(), remove: vi.fn() }),
  refreshRadars: vi.fn(),
}));
/** The flow is `useSubscribe()`'s (tested in `tests/radars/subscribe.test.ts`); the card only calls it. */
vi.mock("@/features/radars/subscribe", () => ({
  useSubscribe: () => ({ subscribe: (...args: unknown[]) => state.subscribe(...args), saveEdit: vi.fn(), relax: vi.fn() }),
}));

import { FIRST_VERSION, feedListKey } from "@/features/feed/feedQuery";
import { FeedScreen } from "@/features/feed/FeedScreen";
import { FEED_RADAR_SEEN_RATIO, FEED_RADAR_SNOOZE_MS } from "@/features/nudges/constants";
import { resetFeedRadarSeen } from "@/features/nudges/feedRadar";
import { FeedRadarCard, useFeedRadar } from "@/features/nudges/FeedRadarCard";
import { emptyNudgeState, readNudgeState, resetNudgeMemory, snoozeFeedRadar } from "@/features/nudges/storage";
import { normalizeRadar } from "@/features/radars/normalize";
import { clearTracked, recentTracked } from "@/lib/analytics/events";
import { resetReference } from "@/lib/reference/useReference";

import { previewOf, translator } from "../helpers/listing";
import { feedReference } from "../helpers/reference";

const NOW = Date.parse("2026-11-18T09:00:00Z");
const DEFAULT: SearchFilters = defaultFilters("rent_long", "tashkent");
/** Two-room long-term rent in Tashkent: a custom search. */
const CUSTOM: SearchFilters = { ...DEFAULT, rooms_min: 2, rooms_max: 2 };
const DAILY: SearchFilters = defaultFilters("rent_daily", "tashkent");
const SALE: SearchFilters = defaultFilters("sale", "tashkent");
const t = translator("ru");

/** A fake `IntersectionObserver`: jsdom has none. `show(ratio)` tells every connected observer how much of it is seen. */
class FakeObserver {
  static all: FakeObserver[] = [];
  readonly targets = new Set<Element>();
  connected = true;
  constructor(
    readonly callback: IntersectionObserverCallback,
    readonly options: IntersectionObserverInit = {},
  ) {
    FakeObserver.all.push(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.connected = false;
    this.targets.clear();
  }
  takeRecords() {
    return [];
  }
}

/** The observers of the card (the list's sentinel has its own `rootMargin` and no threshold). */
const cardObservers = () => FakeObserver.all.filter((observer) => observer.options.threshold !== undefined);

function show(ratio: number) {
  act(() => {
    for (const observer of cardObservers().filter((each) => each.connected)) {
      const entries = [...observer.targets].map((target) => ({ isIntersecting: ratio > 0, intersectionRatio: ratio, target }) as IntersectionObserverEntry);
      observer.callback(entries, observer as unknown as IntersectionObserver);
    }
  });
}

const withIntl = (children: ReactNode) => (
  <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
    {children}
  </NextIntlClientProvider>
);

const card = () => document.querySelector<HTMLElement>('[data-slot="feed-radar"]');
const events = () => recentTracked().map((event) => ({ name: event.name, props: event.props }));
const impacts = (fake: FakeTelegram | null) =>
  fake?.calls.filter((entry) => entry.member === "HapticFeedback.impactOccurred").map((entry) => entry.args[0]);

let fake: FakeTelegram | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal("scrollTo", vi.fn());
  Object.assign(state, { pathname: "/", search: "", radars: [] });
  state.sent.length = 0;
  state.subscribe.mockReset();
  state.subscribe.mockResolvedValue({ ok: true });
  state.push.mockReset();
  FakeObserver.all = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  localStorage.clear();
  resetNudgeMemory();
  resetFeedRadarSeen();
  clearTracked();
  feedReference({ reference: { radars_enabled: true } });
  fake = fakeTelegram({ version: "8.0" });
});

afterEach(() => {
  cleanup();
  resetReference();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  fake?.uninstall();
  fake = null;
});

describe("FeedRadarCard (SCR-047, BR-APP-072)", () => {
  const mount = (filters: SearchFilters) => render(withIntl(<FeedRadarCard filters={filters} />));
  const title = () => card()!.querySelector(":scope > b")!.textContent;
  const button = () => card()!.querySelector<HTMLElement>('[data-action="enable"]')!;

  it("the rent title for long and daily rent, the sale title for sale; the hint; × in the corner", () => {
    mount(DEFAULT);
    expect(title()).toBe("Хорошие квартиры снимают в первые часы");
    expect(card()!.querySelector(":scope > span")!.textContent).toBe(t("feedRadar.what"));
    expect(card()!.querySelector('[data-action="close"]')!.getAttribute("aria-label")).toBe(t("common.close"));
    cleanup();
    mount(DAILY);
    expect(title()).toBe("Хорошие квартиры снимают в первые часы");
    cleanup();
    mount(SALE);
    expect(title()).toBe("Выгодные квартиры продают быстро");
  });

  it("«Включить радар» for custom filters: a medium impact, the streak reset, subscribe(filters, «feed»)", () => {
    localStorage.setItem("homi-nudge", JSON.stringify({ ...emptyNudgeState(), closed: 2 }));
    mount(CUSTOM);
    expect(button().textContent).toBe("Включить радар");
    expect(button().querySelector("svg")).not.toBeNull();
    fireEvent.click(button());
    expect(impacts(fake)).toEqual(["medium"]);
    expect(readNudgeState().closed).toBe(0);
    expect(state.subscribe).toHaveBeenCalledWith(CUSTOM, "feed");
    expect(state.push).not.toHaveBeenCalled();
  });

  it("«Настроить радар» for default filters: «Новый радар» with this search and entry=feed", () => {
    localStorage.setItem("homi-nudge", JSON.stringify({ ...emptyNudgeState(), closed: 1 }));
    mount(SALE);
    expect(button().textContent).toBe("Настроить радар");
    fireEvent.click(button());
    expect(state.push).toHaveBeenCalledWith(`/radars/new?${toSearchParams(SALE).toString()}&entry=feed`);
    expect(state.subscribe).not.toHaveBeenCalled();
    expect(readNudgeState().closed).toBe(0);
    expect(impacts(fake)).toEqual(["medium"]);
  });

  it("×: hidden for 7 days on every search, feed_radar_closed { custom }, the nudges' streak unchanged", () => {
    localStorage.setItem("homi-nudge", JSON.stringify({ ...emptyNudgeState(), closed: 2 }));
    mount(CUSTOM);
    fireEvent.click(card()!.querySelector('[data-action="close"]')!);
    expect(readNudgeState()).toMatchObject({ feedOff: NOW + FEED_RADAR_SNOOZE_MS, closed: 2, quietUntil: 0 });
    expect(events()).toEqual([{ name: "feed_radar_closed", props: { custom: true } }]);
  });

  it("feed_radar_shown once 60 % of it is visible, once per search in a launch", () => {
    const view = mount(CUSTOM);
    expect(cardObservers()).toHaveLength(1);
    expect(cardObservers()[0].options.threshold).toBe(FEED_RADAR_SEEN_RATIO);
    expect([...cardObservers()[0].targets]).toEqual([card()]);

    show(0.59);
    expect(events()).toEqual([]);
    show(0.6);
    expect(events()).toEqual([{ name: "feed_radar_shown", props: { custom: true } }]);
    expect(cardObservers()[0].connected).toBe(false);

    view.unmount();
    mount({ ...CUSTOM, posted_days: 7 });
    expect(cardObservers().filter((observer) => observer.connected)).toHaveLength(0);
    show(1);
    cleanup();
    mount(SALE);
    show(0.8);
    expect(events()).toEqual([
      { name: "feed_radar_shown", props: { custom: true } },
      { name: "feed_radar_shown", props: { custom: false } },
    ]);
  });

  it("never where IntersectionObserver is missing, and without an error", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    expect(() => mount(CUSTOM)).not.toThrow();
    expect(card()).not.toBeNull();
    expect(events()).toEqual([]);
  });

  it("the art: the 56 px sweep with two blips, every animated part marked, so lite graphics hold it still", () => {
    mount(CUSTOM);
    const art = card()!.querySelector<HTMLElement>('[data-slot="radar-sweep"]')!;
    expect([art.style.width, art.style.height]).toEqual(["56px", "56px"]);
    expect(art.querySelectorAll('[data-slot="radar-sweep-blip"]')).toHaveLength(2);
    const animated = [...card()!.querySelectorAll("[class*='animate-radar']")];
    expect(animated).toHaveLength(3);
    expect(animated.every((element) => element.hasAttribute("data-radar-animation"))).toBe(true);

    const lite = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../../packages/ui/src/styles/lite.css"), "utf8");
    expect(lite).toMatch(/html\.lite \[data-radar-animation\]\s*\{\s*animation: none;/);
  });
});

describe("useFeedRadar: when the list carries the card", () => {
  const radar = (filters: SearchFilters) => normalizeRadar({ id: "01JD0000000000000000000001", active: true, mode: "instant", hidden: 0, created_at: null, filters });
  const offered = (filters: SearchFilters) => renderHook(() => useFeedRadar(filters)).result;

  it("radars on, the reference data and the radar list loaded, no radar for the search, under the limit", () => {
    expect(offered(CUSTOM).current).toBe(true);
  });

  it("not while radars are off, before the reference data or the radar list, for a covered search or at the limit", () => {
    feedReference({ reference: { radars_enabled: false } });
    expect(offered(CUSTOM).current).toBe(false);
    feedReference({ reference: null });
    expect(offered(CUSTOM).current).toBe(false);
    feedReference({ reference: { radars_enabled: true, limits: { radars: 1 } } });
    state.radars = undefined;
    expect(offered(CUSTOM).current).toBe(false);
    state.radars = [radar(SALE)];
    expect(offered(CUSTOM).current).toBe(false);
    feedReference({ reference: { radars_enabled: true } });
    expect(offered(CUSTOM).current).toBe(true);
    expect(offered(SALE).current).toBe(false);
  });

  it("a × anywhere hides it at once; it is back once the 7 days are over", () => {
    const result = offered(CUSTOM);
    act(() => snoozeFeedRadar());
    expect(result.current).toBe(false);
    vi.setSystemTime(NOW + FEED_RADAR_SNOOZE_MS);
    expect(offered(DEFAULT).current).toBe(true);
  });
});

describe("FeedScreen: the card in the list's inline slot", () => {
  const page = (numbers: number[]): Answer => ({ ok: true, data: numbers.map((number) => previewOf({ number })), meta: { source: "stub", next_cursor: "c2" } });
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

  function feed(filters: SearchFilters) {
    state.search = toSearchParams(filters).toString();
    render(
      withIntl(
        <FeedScreen initial={{ key: feedListKey(filters, "new", FIRST_VERSION), result: page(range(1, 20)) }} serverSmallOnly={false} />,
      ),
    );
  }

  it("after the 8th card of the search list", () => {
    feed(CUSTOM);
    expect(card()).not.toBeNull();
    expect(card()!.previousElementSibling?.getAttribute("data-listing")).toBe("8");
  });

  it("nothing while radars are switched off: no card, no radar request", () => {
    feedReference({ reference: { radars_enabled: false } });
    feed(CUSTOM);
    expect(card()).toBeNull();
    expect(state.sent.filter((sent) => sent.path === "radars")).toHaveLength(0);
    expect(events()).toEqual([]);
  });

  it("× takes it out of the list", () => {
    feed(CUSTOM);
    fireEvent.click(card()!.querySelector('[data-action="close"]')!);
    expect(card()).toBeNull();
  });
});
