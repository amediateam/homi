import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { defaultFilters, type ListingSort, type SearchFilters, toSearchParams } from "@homi/search";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  push: vi.fn(),
  /** `null`: the real `radarsReady` (on since WP-30); a boolean forces the constant. */
  ready: null as boolean | null,
}));
vi.mock("@/lib/navigation/nav", () => ({ nav: { push: (href: string) => state.push(href) } }));
/** The radar button's flow and matching (WP-30) are tested on their own; here no radar has the search. */
vi.mock("@/features/radars/subscribe", () => ({ useSubscribe: () => ({ subscribe: vi.fn(), saveEdit: vi.fn(), relax: vi.fn() }) }));
vi.mock("@/features/radars/match", () => ({ useHasActiveRadar: () => false }));
vi.mock("@/features/radars/capability", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/radars/capability")>();
  return {
    ...actual,
    useRadarsEnabled: () => actual.useRadarsEnabled(state.ready === null ? undefined : { ready: state.ready }),
  };
});

import { FeedEmpty, type FeedEmptyProps } from "@/features/feed/FeedEmpty";
import type { FeedSearch } from "@/features/feed/FewResultsNote";
import { brand } from "@/lib/brand";
import { type DevFlags, devFlags } from "@/lib/flags";
import { routes } from "@/lib/navigation/routes";
import { EMPTY_REFERENCE } from "@/lib/reference/empty";
import type { Reference } from "@/lib/reference/types";
import { resetReference, setReference } from "@/lib/reference/useReference";

import { withDevFlags } from "../helpers/flags";
import { translator } from "../helpers/listing";
import { cityOf, feedReference } from "../helpers/reference";

const LOCALES: readonly Locale[] = ["ru", "uz", "en"];
const STATS = [{ code: "tashkent", counts: { rent_long: 40, rent_daily: 12, sale: 120 }, price_presets: {}, typical_price: {} }];
const TWO_CITIES = [cityOf(), cityOf({ code: "samarkand", name: "Самарканд", zones: [] })];
const DEV024_ON = withDevFlags({ dev024ResetOnlyWithActiveFilters: true }, (flags) => flags);

function searchOf(filters: SearchFilters, sort: ListingSort = "new") {
  const write = vi.fn<FeedSearch["write"]>();
  const search: FeedSearch = { filters, sort, write, href: (builder) => builder(toSearchParams(filters, sort)) };
  return { search, write };
}

function empty(props: FeedEmptyProps, locale: Locale = "ru") {
  return render(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
      <FeedEmpty {...props} />
    </NextIntlClientProvider>,
  );
}

function searchEmpty(filters: SearchFilters, flags: DevFlags = devFlags, sort: ListingSort = "new") {
  const { search, write } = searchOf(filters, sort);
  empty({ source: "feed", search, flags });
  return write;
}

const view = () => document.querySelector<HTMLElement>("[data-slot=empty-state]")!;
const image = () => view().querySelector<HTMLImageElement>("[data-slot=empty-state-image]")?.getAttribute("src");
const title = () => view().querySelector("[data-slot=empty-state-title]")?.textContent;
const hint = () => view().querySelector("[data-slot=empty-state-hint]")?.textContent;
const reset = () => document.querySelector<HTMLButtonElement>("[data-empty-action=reset]");
const actions = () => [...document.querySelectorAll<HTMLElement>("[data-few]")].map((button) => button.dataset.few);

/** One active filter group (rooms, BR-APP-011). */
const FILTERED: SearchFilters = { ...defaultFilters("rent_long"), rooms_min: 2 };

let fake: FakeTelegram | null = null;

beforeEach(() => {
  state.push.mockReset();
  state.ready = null;
  vi.stubGlobal("scrollTo", vi.fn());
  fake = fakeTelegram({ version: "8.0" });
  feedReference({ cities: TWO_CITIES, stats: STATS });
});

afterEach(() => {
  cleanup();
  resetReference();
  vi.unstubAllGlobals();
  fake?.uninstall();
  fake = null;
});

describe("search empty (SCR-009)", () => {
  it.each(LOCALES)("%s: the magnifier, «Ничего не нашлось», the hint and «Сбросить фильтры»", (locale) => {
    const t = translator(locale);
    const { search } = searchOf(FILTERED);
    empty({ source: "feed", search }, locale);

    expect(view().dataset.empty).toBe("feed");
    expect(image()).toBe(brand.assets.emptyMagnifier);
    expect(title()).toBe(t("feed.nothing"));
    expect(hint()).toBe(t("feed.nothingHint"));
    expect(reset()?.textContent).toBe(t("feed.resetFilters"));
    expect(actions()).toEqual([]);
    expect(view().className).not.toContain("pt-24");
  });

  it("the reset writes the defaults of the base deal and the city (BR-APP-022) and keeps the sort", () => {
    const filters: SearchFilters = { ...defaultFilters("sale", "samarkand"), rooms_min: 2, districts: ["center"], price_max: 90_000 };
    const write = searchEmpty(filters, devFlags, "ppm");

    fireEvent.click(reset()!);

    expect(write).toHaveBeenCalledExactlyOnceWith(defaultFilters("sale", "samarkand"), "ppm");
  });

  it("daily rent resets to long-term rent, as legacy (LB-APP-030); dev018ResetKeepsDaily keeps it", () => {
    const daily: SearchFilters = { ...defaultFilters("rent_daily"), rooms_min: 1 };
    const legacy = searchEmpty(daily);
    fireEvent.click(reset()!);
    expect(legacy).toHaveBeenCalledExactlyOnceWith(defaultFilters("rent_long"), "new");
    cleanup();

    const keeps = searchEmpty(daily, withDevFlags({ dev018ResetKeepsDaily: true }, (flags) => flags));
    fireEvent.click(reset()!);
    expect(keeps).toHaveBeenCalledExactlyOnceWith(defaultFilters("rent_daily"), "new");
  });
});

describe("LB-APP-038 behind dev024ResetOnlyWithActiveFilters (DEV-024)", () => {
  it("flag off (legacy): no active filters and no city stats still offer «Сбросить фильтры»", () => {
    expect(devFlags.dev024ResetOnlyWithActiveFilters).toBe(false);
    feedReference({ cities: TWO_CITIES, stats: null });
    searchEmpty(defaultFilters());

    expect(reset()).not.toBeNull();
    expect(actions()).toEqual([]);
  });

  it("flag on: no active filters and no city stats show the note's actions instead — «Другой город» here", () => {
    feedReference({ cities: TWO_CITIES, stats: null });
    searchEmpty(defaultFilters(), DEV024_ON);

    expect(reset()).toBeNull();
    expect(title()).toBe("Ничего не нашлось");
    expect(actions()).toEqual(["city"]);
    fireEvent.click(document.querySelector<HTMLButtonElement>("[data-few=city]")!);
    expect(state.push).toHaveBeenCalledExactlyOnceWith(routes.filters(toSearchParams(defaultFilters(), "new")));
  });

  it("flag on: with the stats (the city has no name, so no note) the other deal is offered too", () => {
    feedReference({ cities: [cityOf({ name: "" }), TWO_CITIES[1]], stats: STATS });
    searchEmpty(defaultFilters("rent_long"), DEV024_ON);

    expect(actions()).toEqual(["deal", "city"]);
    expect(document.querySelector("[data-few=deal]")?.textContent).toBe("Смотреть продажу · 120");
  });

  it("flag on with one city and radars off: no action at all", () => {
    feedReference({ cities: [cityOf()], stats: null });
    searchEmpty(defaultFilters(), DEV024_ON);

    expect(reset()).toBeNull();
    expect(actions()).toEqual([]);
  });

  it("flag on: an active filter still gets the reset", () => {
    searchEmpty(FILTERED, DEV024_ON);
    expect(reset()).not.toBeNull();
    expect(actions()).toEqual([]);
  });

  it("flag on: the radar button follows useRadarsEnabled() — the server's switch with the real constant", () => {
    feedReference({ cities: [cityOf()], stats: null, reference: { radars_enabled: false } });
    searchEmpty(defaultFilters(), DEV024_ON);
    expect(actions()).toEqual([]);
    cleanup();

    feedReference({ cities: [cityOf()], stats: null, reference: { radars_enabled: true } });
    searchEmpty(defaultFilters(), DEV024_ON);
    expect(actions()).toEqual(["radar"]);
  });

  it("flag on: absent without the radar screens (the constant forced off), even with radars_enabled true", () => {
    state.ready = false;
    feedReference({ cities: [cityOf()], stats: null, reference: { radars_enabled: true } });
    searchEmpty(defaultFilters(), DEV024_ON);
    expect(actions()).toEqual([]);
  });

  it("flag on, the constant forced on: absent for radars_enabled false or missing, present for true", () => {
    state.ready = true;
    feedReference({ cities: [cityOf()], stats: null, reference: { radars_enabled: false } });
    searchEmpty(defaultFilters(), DEV024_ON);
    expect(actions()).toEqual([]);
    cleanup();

    const data: Partial<Reference> = { ...EMPTY_REFERENCE, cities: [cityOf()] };
    delete data.radars_enabled;
    setReference({ reference: { loaded: true, data: data as Reference }, cities: { loaded: false, data: [] } });
    searchEmpty(defaultFilters(), DEV024_ON);
    expect(actions()).toEqual([]);
    cleanup();

    feedReference({ cities: [cityOf()], stats: null, reference: null });
    searchEmpty(defaultFilters(), DEV024_ON);
    expect(actions()).toEqual([]);
    cleanup();

    feedReference({ cities: [cityOf()], stats: null, reference: { radars_enabled: true } });
    searchEmpty(defaultFilters(), DEV024_ON);
    expect(actions()).toEqual(["radar"]);
  });
});

describe("favourites and history empty (SCR-009, shown by WP-29)", () => {
  it.each(LOCALES)("%s: the shrug and their texts in the tall layout, no action", (locale) => {
    const t = translator(locale);
    for (const [source, titleKey, hintKey] of [
      ["favorites", "feed.favEmpty", "feed.favEmptyHint"],
      ["history", "feed.histEmpty", "feed.histEmptyHint"],
    ] as const) {
      empty({ source }, locale);
      expect(view().dataset.empty).toBe(source);
      expect(image()).toBe(brand.assets.emptyShrug);
      expect(title()).toBe(t(titleKey));
      expect(hint()).toBe(t(hintKey));
      expect(view().className).toContain("pt-24");
      expect(document.querySelector("button")).toBeNull();
      cleanup();
    }
  });
});
