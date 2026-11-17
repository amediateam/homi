import { getMessages } from "@homi/i18n";
import { type CityRef, defaultFilters, type ListingSort, type SearchFilters } from "@homi/search";
import { act, cleanup, renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/actions/run";

const state = vi.hoisted(() => ({
  depth: 0,
  search: "pick=city",
  log: [] as string[],
  cities: [] as CityRef[],
  patchMe: vi.fn(),
  updateSettings: vi.fn<(input: unknown, auth?: unknown, locale?: string) => Promise<ActionResult<unknown>>>(),
  impact: vi.fn(),
  success: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.search) }));
vi.mock("@/lib/navigation/history", () => ({ depth: () => state.depth }));
vi.mock("@/lib/navigation/nav", () => ({
  nav: {
    back: () => {
      state.log.push("back");
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
    replace: (href: string) => void state.log.push(`replace ${href}`),
  },
}));
vi.mock("@/lib/reference/useReference", () => ({
  useReference: () => ({ findCity: (code: string) => state.cities.find((city) => city.code === code) ?? null }),
}));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ patchMe: state.patchMe }) }));
vi.mock("@/lib/actions/settings", () => ({ updateSettings: state.updateSettings }));
vi.mock("@/lib/telegram", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telegram")>()),
  tg: { haptic: { impact: state.impact, success: state.success, error: vi.fn() } },
}));

import { type CityPickTarget, useCityPick, useSaveCity } from "@/features/city/useCityPick";
import { onFiltersApplied } from "@/features/filters/applyFilters";
import { storageGet, storageSet } from "@/lib/storage";

/** A city with every mark (zones, metro, medians), one with some, and two with none — the second without the fields. */
const TASHKENT: CityRef = {
  code: "tashkent",
  has_metro: true,
  has_median: true,
  zones: [
    { code: "center", name: "Центр" },
    { code: "near_center", name: "Около центра" },
  ],
  districts: [{ code: "chilonzor", name: "Чиланзар" }],
};
const SAMARKAND: CityRef = { code: "samarkand", has_metro: false, has_median: true, zones: [{ code: "center", name: "Центр" }] };
const METRO_ONLY: CityRef = { code: "metro_town", has_metro: true, has_median: false, zones: [] };
const ANDIJAN: CityRef = { code: "andijan", has_metro: false, has_median: false, zones: [] };
const BARE: CityRef = { code: "bare" };

const POLYGON = [
  [41.3, 69.2],
  [41.32, 69.24],
  [41.28, 69.26],
] as const;
/** A Tashkent search that uses everything a city change may clear. */
const LIVE: SearchFilters = {
  ...defaultFilters("rent_long", "tashkent"),
  districts: ["chilonzor"],
  zones: ["center"],
  near_metro: true,
  below_median: true,
  rooms_min: 2,
};
const SAVED: ActionResult<unknown> = { ok: true, data: { city: "samarkand" }, meta: {} };

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      {children}
    </NextIntlClientProvider>
  );
}

function picker(target: CityPickTarget) {
  return renderHook((current: CityPickTarget) => useCityPick(current), { initialProps: target, wrapper });
}

function nested(draft: SearchFilters = LIVE) {
  const update = vi.fn((patch: Partial<SearchFilters>) => void state.log.push(`update ${patch.city}`));
  const close = vi.fn(() => void state.log.push("close"));
  return { target: { variant: "nested", draft, update, close } as const, update, close };
}

const header = (filters: SearchFilters = LIVE, sort: ListingSort = "new"): CityPickTarget => ({ variant: "header", filters, sort });

/** The address of the one replace a header pick made. */
function replaced(): URL {
  const replaces = state.log.filter((entry) => entry.startsWith("replace "));
  expect(replaces).toHaveLength(1);
  return new URL(replaces[0].slice("replace ".length), "https://app.test");
}

const flush = () => act(async () => undefined);

beforeEach(() => {
  state.depth = 0;
  state.search = "pick=city";
  state.log = [];
  state.cities = [TASHKENT, SAMARKAND, METRO_ONLY, ANDIJAN, BARE];
  state.patchMe.mockReset();
  state.updateSettings.mockReset().mockResolvedValue(SAVED);
  state.impact.mockReset();
  state.success.mockReset();
  storageSet("homi-city", null);
  vi.spyOn(window, "scrollTo").mockImplementation(() => void state.log.push("scroll"));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useCityPick — the city change of BR-APP-009", () => {
  const table: { city: CityRef; kept: Partial<SearchFilters> }[] = [
    { city: SAMARKAND, kept: { zones: ["center"], near_metro: false, below_median: true } },
    { city: METRO_ONLY, kept: { zones: [], near_metro: true, below_median: false } },
    { city: ANDIJAN, kept: { zones: [], near_metro: false, below_median: false } },
    { city: BARE, kept: { zones: [], near_metro: false, below_median: false } },
  ];

  it.each(table)("to $city.code: districts and the polygon cleared; zones, metro, median kept only where the city has them", ({ city, kept }) => {
    const { target, update } = nested({ ...LIVE, polygon: POLYGON });

    picker(target).result.current(city.code);

    expect(update.mock.calls[0][0]).toEqual({ ...LIVE, city: city.code, districts: [], polygon: null, ...kept });
  });

  it("the current city changes nothing", () => {
    const { target, update } = nested();

    picker(target).result.current("tashkent");

    expect(update.mock.calls[0][0]).toEqual(LIVE);
  });

  it("the header variant applies the same change to the live search", () => {
    const view = picker(header());
    view.result.current("samarkand");

    const params = replaced().searchParams;
    expect(params.get("city")).toBe("samarkand");
    expect(params.getAll("zones")).toEqual(["center"]);
    expect(params.get("below_median")).toBe("1");
    expect(params.has("near_metro")).toBe(false);
    expect(params.has("districts")).toBe(false);
    expect(params.get("rooms_min")).toBe("2");
  });
});

describe("useCityPick — header (/city)", () => {
  it("saves the city, closes, then lands on the feed of the new search and scrolls to the top", async () => {
    state.depth = 1;
    const listener = vi.fn();
    const unsubscribe = onFiltersApplied(listener);

    picker(header()).result.current("andijan");
    await flush();

    expect(state.log).toEqual(["back", "replace /?city=andijan&rooms_min=2", "scroll"]);
    expect(storageGet("homi-city")).toBe("andijan");
    expect(state.updateSettings).toHaveBeenCalledTimes(1);
    expect(state.updateSettings.mock.calls[0][0]).toEqual({ city: "andijan" });
    expect(state.patchMe).toHaveBeenCalledWith({ city: "andijan" });
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("at depth 0 (a direct load) only replaces", async () => {
    picker(header()).result.current("andijan");
    await flush();

    expect(state.log).toEqual(["replace /?city=andijan&rooms_min=2", "scroll"]);
  });

  it("falls back to new when the new city does not offer the sort, and keeps one it does (BR-APP-023)", async () => {
    picker(header(LIVE, "center")).result.current("andijan");
    await flush();
    expect(replaced().searchParams.has("sort")).toBe(false);

    state.log = [];
    picker(header(LIVE, "center")).result.current("samarkand");
    await flush();
    expect(replaced().searchParams.get("sort")).toBe("center");

    state.log = [];
    picker(header(LIVE, "deal")).result.current("samarkand");
    await flush();
    expect(replaced().searchParams.get("sort")).toBe("deal");

    state.log = [];
    picker(header(LIVE, "deal")).result.current("bare");
    await flush();
    expect(replaced().searchParams.has("sort")).toBe(false);
  });

  it("a failed save changes nothing: the local choice stands", async () => {
    state.updateSettings.mockResolvedValue({ ok: false, error: "server", status: 500, method: "PATCH", path: "settings" });

    picker(header()).result.current("samarkand");
    await flush();

    expect(storageGet("homi-city")).toBe("samarkand");
    expect(replaced().searchParams.get("city")).toBe("samarkand");
  });

  it("an unknown code does nothing", async () => {
    picker(header()).result.current("atlantis");
    await flush();

    expect(state.log).toEqual([]);
    expect(state.updateSettings).not.toHaveBeenCalled();
    expect(storageGet("homi-city")).toBeNull();
  });

  it("gives no haptic of its own: the row's light tap and the position's success are CityList's", async () => {
    picker(header()).result.current("samarkand");
    await flush();

    expect(state.impact).not.toHaveBeenCalled();
    expect(state.success).not.toHaveBeenCalled();
  });

  it("a second tap before the address changed is ignored; a changed address takes picks again", async () => {
    state.depth = 1;
    const view = picker(header());

    view.result.current("andijan");
    view.result.current("samarkand");
    await flush();
    expect(state.log).toEqual(["back", "replace /?city=andijan&rooms_min=2", "scroll"]);
    expect(state.updateSettings).toHaveBeenCalledTimes(1);

    state.log = [];
    state.search = "";
    view.rerender(header());
    view.result.current("bare");
    await flush();
    expect(state.log).toEqual(["back", "replace /?city=bare&rooms_min=2", "scroll"]);
  });
});

describe("useCityPick — nested (pick=city)", () => {
  it("changes only the draft, then closes the layer: nothing saved, no navigation of its own", async () => {
    const { target, update, close } = nested();

    picker(target).result.current("samarkand");
    await flush();

    expect(state.log).toEqual(["update samarkand", "close"]);
    expect(update).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(state.updateSettings).not.toHaveBeenCalled();
    expect(state.patchMe).not.toHaveBeenCalled();
    expect(storageGet("homi-city")).toBeNull();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("a double tap closes once — a second Back would close the filters sheet too", () => {
    const { target, update, close } = nested();
    const view = picker(target);

    view.result.current("samarkand");
    view.result.current("andijan");
    expect(update).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);

    state.search = "";
    view.rerender(target);
    state.search = "pick=city";
    view.rerender(target);
    view.result.current("andijan");
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("an unknown code neither changes the draft nor closes", () => {
    const { target, update, close } = nested();

    picker(target).result.current("atlantis");

    expect(update).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});

describe("useSaveCity", () => {
  it("writes homi-city, patches me and sends PATCH /settings without awaiting it", async () => {
    let settle!: (value: ActionResult<unknown>) => void;
    state.updateSettings.mockReturnValue(new Promise((resolve) => (settle = resolve)));
    const { result } = renderHook(() => useSaveCity(), { wrapper });

    result.current("samarkand");

    expect(storageGet("homi-city")).toBe("samarkand");
    expect(state.patchMe).toHaveBeenCalledWith({ city: "samarkand" });
    expect(state.updateSettings.mock.calls[0][0]).toEqual({ city: "samarkand" });
    await act(async () => settle(SAVED));
  });

  it("saves nothing for a code outside the reference data — a relax option's server city (S-1)", async () => {
    storageSet("homi-city", "tashkent");
    const { result } = renderHook(() => useSaveCity(), { wrapper });

    result.current("bukhara");
    await flush();

    expect(storageGet("homi-city")).toBe("tashkent");
    expect(state.updateSettings).not.toHaveBeenCalled();
    expect(state.patchMe).not.toHaveBeenCalled();
  });

  it("saves nothing while the reference data is missing", async () => {
    state.cities = [];
    const { result } = renderHook(() => useSaveCity(), { wrapper });

    result.current("samarkand");
    await flush();

    expect(storageGet("homi-city")).toBeNull();
    expect(state.updateSettings).not.toHaveBeenCalled();
    expect(state.patchMe).not.toHaveBeenCalled();
  });
});
