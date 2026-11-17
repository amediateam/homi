import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { defaultFilters, type ListingSort, type SearchFilters, switchDeal, toSearchParams } from "@homi/search";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SubscribeResult } from "@/features/radars/subscribe";

const state = vi.hoisted(() => ({
  push: vi.fn(),
  subscribe: vi.fn(),
  hasRadar: false,
  /** `null`: the real `radarsReady`; a boolean forces the constant (WP-30 flips it). */
  ready: null as boolean | null,
}));
vi.mock("@/lib/navigation/nav", () => ({ nav: { push: (href: string) => state.push(href) } }));
vi.mock("@/features/radars/subscribe", () => ({
  subscribe: (...args: unknown[]) => state.subscribe(...args),
  useHasActiveRadar: () => state.hasRadar,
}));
/** The real hook; only the build-time constant is forced, so the server's half is still the code under test. */
vi.mock("@/features/radars/capability", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/radars/capability")>();
  return {
    ...actual,
    useRadarsEnabled: () => actual.useRadarsEnabled(state.ready === null ? undefined : { ready: state.ready }),
  };
});

import type { FewTitleKey } from "@/features/feed/fewResults";
import { type FeedSearch, FewResultsNote } from "@/features/feed/FewResultsNote";
import { radarsReady } from "@/features/radars/capability";
import { routes } from "@/lib/navigation/routes";
import { EMPTY_REFERENCE } from "@/lib/reference/empty";
import type { Reference } from "@/lib/reference/types";
import { resetReference, setReference } from "@/lib/reference/useReference";

import { translator } from "../helpers/listing";
import { cityOf, feedReference } from "../helpers/reference";

const LOCALES: readonly Locale[] = ["ru", "uz", "en"];
const STATS = [{ code: "tashkent", counts: { rent_long: 40, rent_daily: 12, sale: 120 }, price_presets: {}, typical_price: {} }];
const TWO_CITIES = [cityOf(), cityOf({ code: "samarkand", name: "Самарканд", zones: [] })];

function searchOf(filters: SearchFilters, sort: ListingSort = "new") {
  const write = vi.fn<FeedSearch["write"]>();
  const search: FeedSearch = { filters, sort, write, href: (builder) => builder(toSearchParams(filters, sort)) };
  return { search, write };
}

function note(search: FeedSearch, count: number, locale: Locale = "ru") {
  return render(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
      <FewResultsNote search={search} count={count} />
    </NextIntlClientProvider>,
  );
}

const root = () => document.querySelector<HTMLElement>("[data-slot=few-note]")!;
const action = (name: "deal" | "radar" | "city") => document.querySelector<HTMLButtonElement>(`[data-few=${name}]`);
const actions = () => [...document.querySelectorAll<HTMLElement>("[data-few]")].map((button) => button.dataset.few);

let fake: FakeTelegram | null = null;
const haptics = () =>
  (fake?.calls ?? []).filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);
const scrollTo = vi.fn();

beforeEach(() => {
  state.push.mockReset();
  state.subscribe.mockReset();
  state.hasRadar = false;
  state.ready = null;
  scrollTo.mockReset();
  vi.stubGlobal("scrollTo", scrollTo);
  fake = fakeTelegram({ version: "8.0" });
  feedReference({ stats: STATS });
});

afterEach(() => {
  cleanup();
  resetReference();
  vi.unstubAllGlobals();
  fake?.uninstall();
  fake = null;
});

describe("FewResultsNote texts (SCR-009, BR-APP-025)", () => {
  it.each(LOCALES)("%s: the title by count and deal, the hint with the city's name", (locale) => {
    const t = translator(locale);
    const cases: [SearchFilters, number, FewTitleKey][] = [
      [defaultFilters("rent_long"), 0, "feed.nothing"],
      [defaultFilters("sale"), 0, "feed.nothing"],
      [defaultFilters("rent_long"), 3, "feed.fewRent"],
      [defaultFilters("rent_daily"), 3, "feed.fewRent"],
      [defaultFilters("sale"), 9, "feed.fewSale"],
    ];
    for (const [filters, count, key] of cases) {
      note(searchOf(filters).search, count, locale);
      const [title, hint] = root().querySelectorAll("p");
      expect(title.textContent).toBe(t(key));
      expect(hint.textContent).toBe(t("feed.fewHint", { city: "Ташкент" }));
      cleanup();
    }
  });

  it("the city's name is a server string rendered as text", () => {
    feedReference({ cities: [cityOf({ name: "<b>Ташкент</b>" })], stats: STATS });
    note(searchOf(defaultFilters()).search, 3);
    expect(root().querySelector("b")).toBeNull();
    expect(root().textContent).toContain("<b>Ташкент</b>: ");
  });
});

describe("«Смотреть продажу / аренду · N»", () => {
  it.each(LOCALES)("%s: rent offers the sale count, sale offers the long-term rent count", (locale) => {
    const t = translator(locale);
    note(searchOf(defaultFilters("rent_long")).search, 3, locale);
    expect(action("deal")?.textContent).toBe(t("feed.seeSale", { n: 120 }));
    cleanup();

    note(searchOf(defaultFilters("rent_daily")).search, 3, locale);
    expect(action("deal")?.textContent).toBe(t("feed.seeSale", { n: 120 }));
    cleanup();

    note(searchOf(defaultFilters("sale")).search, 3, locale);
    expect(action("deal")?.textContent).toBe(t("feed.seeRent", { n: 40 }));
  });

  it("is absent when the other deal has no more listings than are visible, and without stats", () => {
    note(searchOf(defaultFilters("sale")).search, 40);
    expect(action("deal")).toBeNull();
    cleanup();

    feedReference({ stats: null });
    note(searchOf(defaultFilters("rent_long")).search, 3);
    expect(action("deal")).toBeNull();
  });

  it("a tap writes switchDeal() with the geography kept, a light haptic and the top of the list", () => {
    const filters: SearchFilters = { ...defaultFilters("rent_long"), districts: ["yunusabad"], rooms_min: 2 };
    const { search, write } = searchOf(filters, "cheap");
    note(search, 3);

    fireEvent.click(action("deal")!);

    expect(write).toHaveBeenCalledTimes(1);
    const [written, sort] = write.mock.calls[0];
    expect(written).toEqual(switchDeal(filters, "sale"));
    expect(written).toMatchObject({ deal: "sale", districts: ["yunusabad"], rooms_min: null });
    expect(sort).toBe("cheap");
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    expect(state.push).not.toHaveBeenCalled();
  });

  it("the sort the new deal no longer offers becomes `new` (BR-APP-023); one it offers stays", () => {
    const sale = searchOf(defaultFilters("sale"), "ppm");
    note(sale.search, 3);
    fireEvent.click(action("deal")!);
    expect(sale.write.mock.calls[0]).toEqual([switchDeal(defaultFilters("sale"), "rent_long"), "new"]);
    cleanup();

    const rent = searchOf(defaultFilters("rent_long"), "center");
    note(rent.search, 3);
    fireEvent.click(action("deal")!);
    expect(rent.write.mock.calls[0][1]).toBe("center");
  });
});

describe("«Другой город»", () => {
  it.each(LOCALES)("%s: with more than one city it pushes the filters sheet with the search state", (locale) => {
    feedReference({ cities: TWO_CITIES, stats: STATS });
    const filters = defaultFilters("sale", "tashkent");
    note(searchOf(filters, "cheap").search, 3, locale);

    expect(action("city")?.textContent).toBe(translator(locale)("feed.otherCity"));
    fireEvent.click(action("city")!);

    expect(state.push).toHaveBeenCalledExactlyOnceWith(routes.filters(toSearchParams(filters, "cheap")));
    expect(haptics()).toEqual([]);
  });

  it("is absent with one city and before the reference data arrives", () => {
    note(searchOf(defaultFilters()).search, 3);
    expect(action("city")).toBeNull();
    cleanup();

    feedReference({ reference: null, stats: STATS });
    note(searchOf(defaultFilters()).search, 3);
    expect(action("city")).toBeNull();
  });
});

describe("«Включить радар по этому поиску» (DEC-51)", () => {
  it("is absent while radarsReady is false, even with radars_enabled true", () => {
    expect(radarsReady).toBe(false);
    feedReference({ stats: STATS, reference: { radars_enabled: true } });
    note(searchOf(defaultFilters()).search, 3);
    expect(action("radar")).toBeNull();
  });

  it("with the constant forced on: absent for radars_enabled false, missing, or no reference data", () => {
    state.ready = true;
    feedReference({ stats: STATS, reference: { radars_enabled: false } });
    note(searchOf(defaultFilters()).search, 3);
    expect(action("radar")).toBeNull();
    cleanup();

    const data: Partial<Reference> = { ...EMPTY_REFERENCE, cities: [cityOf()] };
    delete data.radars_enabled;
    setReference({ reference: { loaded: true, data: data as Reference }, cities: { loaded: true, data: STATS } });
    note(searchOf(defaultFilters()).search, 3);
    expect(action("radar")).toBeNull();
    cleanup();

    feedReference({ stats: STATS, reference: null });
    note(searchOf(defaultFilters()).search, 3);
    expect(action("radar")).toBeNull();
  });

  it.each(LOCALES)("%s: with the constant forced on and radars_enabled true it shows with the radar icon", (locale) => {
    state.ready = true;
    feedReference({ cities: TWO_CITIES, stats: STATS, reference: { radars_enabled: true } });
    note(searchOf(defaultFilters()).search, 3, locale);

    expect(action("radar")?.textContent).toBe(translator(locale)("feed.subscribeHere"));
    expect(action("radar")?.querySelector("svg")).not.toBeNull();
    expect(actions()).toEqual(["deal", "radar", "city"]);
  });

  it("is hidden when a radar with these filters exists", () => {
    state.ready = true;
    state.hasRadar = true;
    feedReference({ stats: STATS, reference: { radars_enabled: true } });
    note(searchOf(defaultFilters()).search, 3);
    expect(action("radar")).toBeNull();
  });

  it("a tap calls subscribe(filters, 'few') with a light haptic; the button is disabled while it runs", async () => {
    state.ready = true;
    feedReference({ stats: STATS, reference: { radars_enabled: true } });
    let finish!: (result: SubscribeResult) => void;
    state.subscribe.mockReturnValueOnce(new Promise<SubscribeResult>((resolve) => (finish = resolve)));
    const filters = defaultFilters("rent_long");
    note(searchOf(filters).search, 3);

    fireEvent.click(action("radar")!);
    fireEvent.click(action("radar")!);

    expect(state.subscribe).toHaveBeenCalledExactlyOnceWith(filters, "few");
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
    expect(action("radar")?.disabled).toBe(true);

    await act(async () => finish({ ok: false }));
    expect(action("radar")?.disabled).toBe(false);
  });

  it("a rejected subscribe enables the button again", async () => {
    state.ready = true;
    feedReference({ stats: STATS, reference: { radars_enabled: true } });
    state.subscribe.mockRejectedValueOnce(new Error("boom"));
    note(searchOf(defaultFilters()).search, 3);

    await act(async () => fireEvent.click(action("radar")!));
    expect(action("radar")?.disabled).toBe(false);
  });
});
