import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pathname: "/",
  search: "",
  push: vi.fn(),
  replace: vi.fn(),
  tab: vi.fn(),
  back: vi.fn(),
  tooSmall: false,
  setTooSmall: vi.fn(),
  loaded: true,
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.search) }));
/** The counted `Link` needs the App Router; a plain anchor keeps its address. */
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => state.pathname,
  Link: ({ href, ...props }: ComponentProps<"a"> & { href: string }) => <a href={href} {...props} />,
}));
vi.mock("@/lib/navigation/nav", () => ({
  nav: {
    push: (href: string) => state.push(href),
    replace: (href: string) => state.replace(href),
    tab: (href: string) => state.tab(href),
  },
}));
vi.mock("@/lib/navigation/useBack", () => ({ useBack: () => ({ canGoBack: true, back: state.back }) }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ me: null }) }));
/** The real memory of the last search (`rememberHref`, `lastSearchQuery`); the too-small mark is the test's. */
vi.mock("@/lib/ui/shellState", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ui/shellState")>()),
  useAreaTooSmall: () => state.tooSmall,
  setAreaTooSmall: (value: boolean) => state.setTooSmall(value),
}));

/** Tashkent as the reference data describes it: medians and zones, so `deal` and `center` are offered sorts. */
const TASHKENT = {
  code: "tashkent",
  name: "Ташкент",
  center: { lat: 41.3111, lon: 69.2797 },
  zoom: 12,
  is_region: false,
  has_metro: true,
  has_median: true,
  districts: [{ code: "yunusabad", name: "Юнусабад" }],
  zones: [{ code: "center", name: "Центр" }],
};
vi.mock("@/lib/reference/useReference", () => ({
  useReference: () => {
    const cities = state.loaded ? [TASHKENT] : [];
    return { loaded: state.loaded, cities, findCity: (code: string) => cities.find((city) => city.code === code) ?? null, usdUzs: 0 };
  },
}));

import type { ShellVariant } from "@/features/shell/shellVariant";
import { TopBar } from "@/features/shell/TopBar";
import { rememberHref } from "@/lib/ui/shellState";

const LOCALES: readonly Locale[] = ["ru", "uz", "en"];
const POLYGON = "41.30000,69.20000;41.32000,69.24000;41.28000,69.26000";

/** The catalogue text of `key` in `locale`, as the provider renders it. */
function text(locale: Locale, key: string): string {
  const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], getMessages(locale));
  if (typeof value !== "string") {
    throw new Error(`no text for ${key}`);
  }
  return value;
}

function bar(variant: ShellVariant, locale: Locale = "ru") {
  return render(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
      <TopBar variant={variant} />
    </NextIntlClientProvider>,
  );
}

const at = (pathname: string, search = "") => {
  state.pathname = pathname;
  state.search = search;
};

/** The one address `nav` was asked for, parsed. */
function navigated(spy: typeof state.push): URL {
  expect(spy).toHaveBeenCalledTimes(1);
  return new URL(spy.mock.calls[0][0] as string, "https://app.test");
}

let fake: FakeTelegram | null = null;
const haptics = () =>
  (fake?.calls ?? []).filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);
const scrollTo = vi.fn();

beforeEach(() => {
  at("/");
  for (const spy of [state.push, state.replace, state.tab, state.back, state.setTooSmall, scrollTo]) {
    spy.mockReset();
  }
  rememberHref("/", "");
  state.tooSmall = false;
  state.loaded = true;
  fake = fakeTelegram({ version: "8.0" });
  vi.stubGlobal("scrollTo", scrollTo);
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  fake?.uninstall();
  fake = null;
  vi.unstubAllGlobals();
});

describe("TopBar variants (SCR-006), in ru, uz and en", () => {
  it.each(LOCALES)("search list (%s): the deal as title tabs, daily rent as rent, and the feed's chips", (locale) => {
    at("/", "city=tashkent&deal=rent_daily");
    const { container } = bar("search-list", locale);

    expect(screen.getByRole("radiogroup").querySelectorAll('[role="radio"]')).toHaveLength(2);
    const rent = screen.getByRole("radio", { name: text(locale, "deal.rent_long") });
    const sale = screen.getByRole("radio", { name: text(locale, "deal.sale") });
    expect(rent.getAttribute("aria-checked")).toBe("true");
    expect(sale.getAttribute("aria-checked")).toBe("false");
    expect(rent.hasAttribute("aria-pressed")).toBe(false);
    // FeedHeader (WP-24) in the chips region; one city in the reference data, so no city chip.
    const chips = container.querySelector("[data-topbar-chips]");
    expect(chips?.children).toHaveLength(1);
    expect([...(chips?.querySelectorAll<HTMLElement>("[data-chip]") ?? [])].map((chip) => chip.dataset.chip)).toEqual([
      "filters",
      "sort",
      "rooms",
      "price",
      "owner",
    ]);
    expect(container.querySelector("header")?.getAttribute("data-topbar")).toBe("search-list");
    expect(container.textContent).not.toMatch(/undefined/);
  });

  it.each(LOCALES)("map (%s): the compact deal control, the lasso and the filters", (locale) => {
    at("/map", "city=tashkent&deal=sale");
    bar("map", locale);

    expect(screen.getByRole("radio", { name: text(locale, "deal.sale") }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: text(locale, "deal.rent_long") }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("button", { name: text(locale, "map.area") }).getAttribute("data-state")).toBe("off");
    expect(screen.getByRole("button", { name: text(locale, "sheet.title") })).toBeTruthy();
    expect(screen.queryByRole("button", { name: text(locale, "map.areaRemove") })).toBeNull();
  });

  it.each(LOCALES)("map with an area (%s): the lasso is highlighted and the area pill has its ×", (locale) => {
    at("/map", `city=tashkent&polygon=${POLYGON}`);
    bar("map", locale);

    expect(screen.getByRole("button", { name: text(locale, "map.area") }).getAttribute("data-state")).toBe("on");
    expect(screen.getByText(text(locale, "map.areaOn"))).toBeTruthy();
    expect(screen.getByRole("button", { name: text(locale, "map.areaRemove") })).toBeTruthy();
  });

  it.each(LOCALES)("drawing (%s): the hint, the sub-hint and «Отмена»; a too-small stroke changes the hint", (locale) => {
    at("/map", "city=tashkent&draw=1");
    const { rerender } = bar("map-drawing", locale);

    expect(screen.getByRole("status").textContent).toBe(text(locale, "map.areaHint") + text(locale, "map.areaMove"));
    expect(screen.getByRole("button", { name: text(locale, "map.areaCancel") })).toBeTruthy();
    expect(screen.queryByRole("button", { name: text(locale, "map.area") })).toBeNull();

    state.tooSmall = true;
    rerender(
      <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
        <TopBar variant="map-drawing" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("status").textContent).toBe(text(locale, "map.areaSmall") + text(locale, "map.areaMove"));
  });

  it.each(LOCALES)("saved (%s): favourites and history as title tabs, the address names the current one", (locale) => {
    at("/saved/history");
    bar("saved", locale);

    expect(screen.getByRole("button", { name: text(locale, "app.saved.history") }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: text(locale, "app.saved.favorites") }).getAttribute("aria-current")).toBeNull();
  });

  it.each(LOCALES)("radars (%s): the heading and «+»", (locale) => {
    at("/radars");
    bar("radars", locale);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(text(locale, "tab.subs"));
    expect(screen.getByRole("link", { name: text(locale, "sheet.createTitle") })).toBeTruthy();
  });

  it.each(LOCALES)("settings (%s): the heading only", (locale) => {
    at("/settings");
    const { container } = bar("settings", locale);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(text(locale, "tab.settings"));
    expect(container.querySelectorAll("button, a").length).toBe(0);
  });

  it("none (a listing loaded directly) renders nothing", () => {
    at("/listing/42");
    expect(bar("none").container.innerHTML).toBe("");
  });

  it("before the reference data arrives the deal tabs and the chips render and no text is undefined", () => {
    state.loaded = false;
    at("/", "deal=sale");
    const { container } = bar("search-list");

    expect(screen.getByRole("radio", { name: "Продажа" }).getAttribute("aria-checked")).toBe("true");
    expect(container.textContent).toBe("АрендаПродажаСначала новыеКомнатыЦенаКто размещает");
  });

  it("the search list kept under a listing shows the feed's deal and chips (KI-43)", () => {
    at("/", "city=tashkent&deal=sale&rooms_min=2");
    const { container, rerender } = bar("search-list");

    at("/listing/42");
    rerender(
      <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
        <TopBar variant="search-list" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("radio", { name: "Продажа" }).getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector('[data-chip="rooms"]')?.getAttribute("data-state")).toBe("on");
  });
});

describe("the deal switch (BR-APP-002, BR-APP-023)", () => {
  it("a tap on the active deal does nothing; daily rent is the active «Аренда»", () => {
    at("/", "city=tashkent&deal=rent_daily");
    bar("search-list");

    fireEvent.click(screen.getByRole("radio", { name: "Аренда" }));

    expect(state.replace).not.toHaveBeenCalled();
    expect(haptics()).toEqual([]);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("the other deal keeps the geography, resets the rest and the sort it no longer offers, in one write", () => {
    at("/", `city=tashkent&deal=sale&districts=yunusabad&rooms_min=2&sort=ppm&from=x`);
    bar("search-list");

    fireEvent.click(screen.getByRole("radio", { name: "Аренда" }));

    const url = navigated(state.replace);
    expect(url.pathname).toBe("/");
    expect(url.searchParams.get("deal")).toBeNull();
    expect(url.searchParams.getAll("districts")).toEqual(["yunusabad"]);
    expect(url.searchParams.get("rooms_min")).toBeNull();
    expect(url.searchParams.get("sort")).toBeNull();
    expect(url.searchParams.get("from")).toBe("x");
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("a sort the new deal still offers stays", () => {
    at("/", "city=tashkent&sort=cheap");
    bar("search-list");

    fireEvent.click(screen.getByRole("radio", { name: "Продажа" }));

    const url = navigated(state.replace);
    expect(url.searchParams.get("deal")).toBe("sale");
    expect(url.searchParams.get("sort")).toBe("cheap");
  });

  it("the deal tabs are one radio group: only the checked tab is in the Tab order, the arrow keys move and choose", () => {
    at("/", "city=tashkent&deal=sale");
    bar("search-list");
    const rent = screen.getByRole("radio", { name: "Аренда" });
    const sale = screen.getByRole("radio", { name: "Продажа" });
    expect(sale.tabIndex).toBe(0);
    expect(rent.tabIndex).toBe(-1);

    sale.focus();
    fireEvent.keyDown(sale, { key: "ArrowRight" });
    expect(document.activeElement).toBe(rent);
    expect(navigated(state.replace).searchParams.get("deal")).toBeNull();
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);

    // Any other key is left to the button.
    state.replace.mockReset();
    fireEvent.keyDown(sale, { key: "a" });
    fireEvent.keyDown(sale, { key: "Enter" });
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("the saved title tabs are not a radio group and ignore the arrow keys", () => {
    at("/saved");
    bar("saved");

    expect(screen.queryByRole("radiogroup")).toBeNull();
    const favorites = screen.getByRole("button", { name: "Избранное" });
    expect(favorites.hasAttribute("tabindex")).toBe(false);
    fireEvent.keyDown(favorites, { key: "ArrowRight" });
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("the map control: the selected deal does nothing, the other writes on the map", () => {
    at("/map", "city=tashkent&deal=sale");
    bar("map");

    fireEvent.click(screen.getByRole("radio", { name: "Продажа" }));
    expect(state.replace).not.toHaveBeenCalled();
    expect(haptics()).toEqual([]);

    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Аренда" }));
    });
    const url = navigated(state.replace);
    expect(url.pathname).toBe("/map");
    expect(url.searchParams.get("deal")).toBeNull();
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
  });
});

describe("the map bar", () => {
  it("the filters badge counts the active groups (BR-APP-011)", () => {
    at("/map", `city=tashkent&rooms_min=2&near_metro=1&owner=owners&polygon=${POLYGON}`);
    const { container } = bar("map");

    const badge = container.querySelector('[data-slot="header-chip-badge"]');
    expect(badge?.textContent).toBe("4");
    expect(badge?.getAttribute("aria-hidden")).toBe("true");
    // The badge is decorative (HeaderChip): the count is read out from the button's name.
    expect(badge?.closest("button")?.getAttribute("aria-label")).toBe("Фильтры, 4");
  });

  it("no active group, no badge and the plain name", () => {
    at("/map", "city=tashkent");
    const { container } = bar("map");
    expect(container.querySelector('[data-slot="header-chip-badge"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Фильтры" })).toBeTruthy();
  });

  it("the deal control may shrink below its 210 px at 320 px; the round buttons may not", () => {
    at("/map", "city=tashkent");
    const { container } = bar("map");

    const control = container.querySelector('[data-slot="segmented-control"]')!;
    expect(control.classList).toContain("flex-[0_1_210px]");
    expect(control.classList).toContain("min-w-0");
    expect(control.classList).not.toContain("flex-none");
    for (const name of ["Обвести на карте", "Фильтры"]) {
      const round = screen.getByRole("button", { name });
      expect(round.classList).toContain("flex-none");
      expect(round.classList).toContain("h-[44px]");
      expect(round.classList).toContain("w-[44px]");
    }
  });

  it("the filters button pushes the filters sheet from the map with the search state", () => {
    at("/map", "city=tashkent&deal=sale&pin=7");
    bar("map");

    fireEvent.click(screen.getByRole("button", { name: "Фильтры" }));

    const url = navigated(state.push);
    expect(url.pathname).toBe("/filters");
    expect([...url.searchParams]).toEqual([
      ["city", "tashkent"],
      ["deal", "sale"],
      ["from", "map"],
    ]);
  });

  it("the lasso pushes the draw layer on the map with the search state and clears a too-small mark", () => {
    at("/map", "city=tashkent&deal=sale&pin=7");
    bar("map");

    fireEvent.click(screen.getByRole("button", { name: "Обвести на карте" }));

    const url = navigated(state.push);
    expect(url.pathname).toBe("/map");
    expect([...url.searchParams]).toEqual([
      ["city", "tashkent"],
      ["deal", "sale"],
      ["draw", "1"],
    ]);
    expect(state.setTooSmall).toHaveBeenCalledWith(false);
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
  });

  it("the × of the area pill clears the polygon and keeps the rest", () => {
    at("/map", `city=tashkent&rooms_min=2&polygon=${POLYGON}&pin=7`);
    bar("map");

    fireEvent.click(screen.getByRole("button", { name: "Убрать область" }));

    const url = navigated(state.replace);
    expect(url.pathname).toBe("/map");
    expect(url.searchParams.get("polygon")).toBeNull();
    expect(url.searchParams.get("rooms_min")).toBe("2");
    expect(url.searchParams.get("pin")).toBe("7");
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
  });

  it("«Своя область» redraws the area", () => {
    at("/map", `city=tashkent&polygon=${POLYGON}`);
    bar("map");

    fireEvent.click(screen.getByRole("button", { name: "Своя область" }));

    expect(navigated(state.push).searchParams.get("draw")).toBe("1");
  });

  it("«Отмена» of the drawing bar closes the draw layer through Back", () => {
    at("/map", "city=tashkent&draw=1");
    bar("map-drawing");

    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));

    expect(state.back).toHaveBeenCalledTimes(1);
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
  });
});

describe("the saved and radar bars", () => {
  it("a saved title tab replaces the address; the current one does nothing", () => {
    at("/saved");
    bar("saved");

    fireEvent.click(screen.getByRole("button", { name: "Избранное" }));
    expect(state.replace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Смотрели" }));
    expect(state.replace).toHaveBeenCalledWith("/saved/history");
    expect(state.push).not.toHaveBeenCalled();
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
  });

  it("«+» opens a new radar with the search keys of the last search only (D-SH-4)", () => {
    rememberHref("/map", "city=andijan&deal=sale&rooms_min=2&sort=cheap&draw=1&pin=4&from=map&utm=x");
    at("/radars");
    bar("radars");

    const link = screen.getByRole("link", { name: "Новый радар" });
    const url = new URL(link.getAttribute("href") ?? "", "https://app.test");
    expect(url.pathname).toBe("/radars/new");
    expect([...url.searchParams]).toEqual([
      ["city", "andijan"],
      ["deal", "sale"],
      ["rooms_min", "2"],
      ["sort", "cheap"],
    ]);
  });

  it("«+» before any search opens a new radar without a query", () => {
    at("/radars");
    bar("radars");

    expect(screen.getByRole("link", { name: "Новый радар" }).getAttribute("href")).toBe("/radars/new");
  });
});
