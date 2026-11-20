import { defaultFilters, type SearchFilters } from "@homi/search";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { feedEpoch } from "@/features/feed/feedQuery";
import { forgetFeedScroll, hasFeedScroll, rememberFeedScroll } from "@/features/feed/feedScroll";
import { createFreshFeed, feedListFree, longReturnOutcome, type LongReturnContext } from "@/features/feed/fresh";

const filters = defaultFilters("rent_long", "tashkent");
const NOW = Date.UTC(2026, 10, 20, 9, 0, 0);

interface Asked {
  filters: SearchFilters;
  since: number;
  signal: AbortSignal;
  resolve: (count: number | null) => void;
  reject: (error: unknown) => void;
}

/** A store whose `GET /listings/new` the test answers, the window at `y`. */
function store(y = 0) {
  const asked: Asked[] = [];
  let scroll = y;
  const fresh = createFreshFeed({
    fetchNew: (f, since, signal) => new Promise((resolve, reject) => asked.push({ filters: f, since, signal, resolve, reject })),
    now: () => NOW,
    scrollY: () => scroll,
  });
  return { fresh, asked, scrollTo: (next: number) => (scroll = next) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const context = (over: Partial<LongReturnContext> = {}): LongReturnContext => ({ searchTab: true, covered: false, view: "list", ...over });

beforeEach(() => forgetFeedScroll());
afterEach(() => forgetFeedScroll());

describe("longReturnOutcome (BR-APP-104): the rule matrix", () => {
  const cases: [string, Parameters<typeof longReturnOutcome>[0], string][] = [
    ["another tab", { ...context({ searchTab: false }), scrollY: 900, remembered: null }, "reload-forget"],
    ["another tab, covered", { ...context({ searchTab: false, covered: true }), scrollY: 0, remembered: null }, "reload-forget"],
    ["the list at the top", { ...context(), scrollY: 0, remembered: null }, "reload"],
    ["the list at 59 px", { ...context(), scrollY: 59, remembered: null }, "reload"],
    ["the list at 60 px", { ...context(), scrollY: 60, remembered: null }, "check"],
    ["the list covered at the top", { ...context({ covered: true }), scrollY: 0, remembered: null }, "check"],
    ["the map, no matching memory", { ...context({ view: "map" }), scrollY: 900, remembered: null }, "reload"],
    ["the map, the list remembered at 30 px", { ...context({ view: "map" }), scrollY: 900, remembered: 30 }, "reload"],
    ["the map, the list remembered at 400 px", { ...context({ view: "map" }), scrollY: 0, remembered: 400 }, "check"],
    ["the map covered by the draw layer", { ...context({ view: "map", covered: true }), scrollY: 0, remembered: null }, "check"],
  ];
  it.each(cases)("%s", (_name, input, outcome) => {
    expect(longReturnOutcome(input)).toBe(outcome);
  });
});

describe("createFreshFeed (WP-38, SCR-063)", () => {
  it("off the search tab: re-created silently, the scroll memory dropped, no request", () => {
    const { fresh, asked } = store();
    fresh.show("r1#a|0", filters);
    rememberFeedScroll("r1#a|0", 800);
    const epoch = feedEpoch();

    fresh.longReturn(context({ searchTab: false }));

    expect(feedEpoch()).toBe(epoch + 1);
    expect(hasFeedScroll()).toBe(false);
    expect(asked).toEqual([]);
  });

  it("on the list near the top, uncovered: re-created silently, the memory kept, no request", () => {
    const { fresh, asked } = store(20);
    fresh.show("r1#a|0", filters);
    rememberFeedScroll("r1#a|0", 20);
    const epoch = feedEpoch();

    fresh.longReturn(context());

    expect(feedEpoch()).toBe(epoch + 1);
    expect(hasFeedScroll()).toBe(true);
    expect(asked).toEqual([]);
  });

  it("scrolled: the count of new listings since the list was created, in whole seconds, with the list's search", async () => {
    const { fresh, asked } = store(400);
    fresh.show("r1#a|0", filters);
    const epoch = feedEpoch();

    fresh.longReturn(context());

    expect(feedEpoch()).toBe(epoch);
    expect(asked).toHaveLength(1);
    expect(asked[0].filters).toBe(filters);
    expect(asked[0].since).toBe(Math.floor(NOW / 1000));
    asked[0].resolve(3);
    await settle();
    expect(fresh.count()).toBe(3);
  });

  it("covered on the map with a matching memory below 60 px still asks", () => {
    const { fresh, asked } = store();
    fresh.show("r1#a|0", filters);
    rememberFeedScroll("r1#a|0", 10);
    fresh.longReturn(context({ view: "map", covered: true }));
    expect(asked).toHaveLength(1);
  });

  it.each([
    ["0", 0],
    ["no count", null],
  ] as const)("a count of %s shows nothing", async (_name, answer) => {
    const { fresh, asked } = store(400);
    fresh.show("r1#a|0", filters);
    fresh.longReturn(context());
    asked[0].resolve(answer);
    await settle();
    expect(fresh.count()).toBe(0);
  });

  it("a new list key aborts the request, drops its answer and the count", async () => {
    const { fresh, asked } = store(400);
    const listener = vi.fn();
    fresh.subscribe(listener);
    fresh.show("r1#a|0", filters);
    fresh.longReturn(context());

    fresh.show("r1#a|1", filters);
    expect(asked[0].signal.aborted).toBe(true);
    asked[0].resolve(5);
    await settle();
    expect(fresh.count()).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it("a count goes with a new key; the same key shown again keeps it and its creation time", async () => {
    let now = NOW;
    const asked: Asked[] = [];
    const fresh = createFreshFeed({
      fetchNew: (f, since, signal) => new Promise((resolve, reject) => asked.push({ filters: f, since, signal, resolve, reject })),
      now: () => now,
      scrollY: () => 400,
    });
    fresh.show("r1#a|0", filters);
    now += 60_000;
    fresh.show("r1#a|0", filters);
    expect(fresh.feed()?.createdAt).toBe(NOW);
    fresh.longReturn(context());
    asked[0].resolve(2);
    await settle();
    expect(fresh.count()).toBe(2);

    fresh.show("r1#a|0", filters);
    expect(fresh.count()).toBe(2);
    fresh.show("r1#b|0", filters);
    expect(fresh.count()).toBe(0);
    expect(fresh.feed()?.createdAt).toBe(now);
  });

  it("an error shows nothing and throws nothing", async () => {
    const { fresh, asked } = store(400);
    fresh.show("r1#a|0", filters);
    fresh.longReturn(context());
    asked[0].reject(new Error("offline"));
    await settle();
    expect(fresh.count()).toBe(0);
  });

  it("a second long return asks again and the earlier request is aborted", () => {
    const { fresh, asked } = store(400);
    fresh.show("r1#a|0", filters);
    fresh.longReturn(context());
    fresh.longReturn(context());
    expect(asked).toHaveLength(2);
    expect(asked[0].signal.aborted).toBe(true);
  });

  it("with no list shown in this launch there is nothing to ask for", () => {
    const { fresh, asked } = store(400);
    fresh.longReturn(context({ covered: true }));
    expect(asked).toEqual([]);
  });

  it("dismiss: the count goes at once", async () => {
    const { fresh, asked } = store(400);
    fresh.show("r1#a|0", filters);
    fresh.longReturn(context());
    asked[0].resolve(4);
    await settle();
    fresh.dismiss();
    expect(fresh.count()).toBe(0);
  });
});

describe("feedListFree (BR-APP-046)", () => {
  it("is the feed list without a layer parameter, with a ready session", () => {
    expect(feedListFree("/", new URLSearchParams("city=tashkent"), true)).toBe(true);
    expect(feedListFree("/", new URLSearchParams("city=tashkent"), false)).toBe(false);
    expect(feedListFree("/", new URLSearchParams("pick=city"), true)).toBe(false);
    expect(feedListFree("/map", new URLSearchParams(), true)).toBe(false);
    expect(feedListFree("/listing/42", new URLSearchParams(), true)).toBe(false);
    expect(feedListFree("/filters", new URLSearchParams(), true)).toBe(false);
  });
});
