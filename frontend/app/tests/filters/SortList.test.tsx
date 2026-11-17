import { getMessages } from "@homi/i18n";
import { defaultFilters, fromSearchParams, type ListingSort, type SearchFilters, toSearchParams } from "@homi/search";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  search: "",
  back: vi.fn(),
  closeThen: vi.fn((href: string) => {
    void href;
    return Promise.resolve();
  }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/ru/sort",
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => "/sort" }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ me: null }) }));
vi.mock("@/lib/navigation/useBack", () => ({ useBack: () => ({ canGoBack: true, back: state.back }) }));
vi.mock("@/lib/navigation/closeThen", () => ({ closeThen: (href: string) => state.closeThen(href) }));

import { SortList } from "@/features/filters/SortList";
import { SortSheetRoute } from "@/features/filters/SortSheetRoute";
import { routes } from "@/lib/navigation/routes";
import type { City } from "@/lib/reference/types";
import { resetReference } from "@/lib/reference/useReference";

import { cityOf, feedReference } from "../helpers/reference";

const TASHKENT = cityOf();
const ALL: [ListingSort, string, string | null][] = [
  ["new", "Сначала новые", null],
  ["cheap", "Сначала дешевле", null],
  ["expensive", "Сначала дороже", null],
  ["deal", "Выгоднее к рынку", "Сначала те, что дешевле обычной цены — ближайших похожих или района"],
  ["center", "Ближе к центру", "По расстоянию до центра города"],
  ["ppm", "Дешевле за м²", "По цене за квадратный метр"],
];

const intl = (children: ReactNode) => (
  <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
    {children}
  </NextIntlClientProvider>
);

const onPick = vi.fn();

function list(filters: Partial<SearchFilters> = {}, { city = TASHKENT as City | null, sort = "new" as ListingSort } = {}) {
  return render(intl(<SortList filters={{ ...defaultFilters(), ...filters }} city={city} sort={sort} onPick={onPick} />));
}

const rows = () => screen.getAllByRole("radio");
const sorts = () => rows().map((row) => row.getAttribute("data-sort"));
const row = (label: string) => screen.getByRole("radio", { name: label });
const checked = () => rows().filter((node) => node.getAttribute("aria-checked") === "true").map((node) => node.getAttribute("data-sort"));

let fake: FakeTelegram | null = null;
const impacts = () => (fake?.calls ?? []).filter((entry) => entry.member === "HapticFeedback.impactOccurred").map((entry) => entry.args[0]);

beforeEach(() => {
  onPick.mockReset();
  state.back.mockReset();
  state.closeThen.mockClear();
  state.search = "";
  fake = fakeTelegram({ version: "8.0" });
});

afterEach(() => {
  cleanup();
  resetReference();
  fake?.uninstall();
  fake = null;
  vi.restoreAllMocks();
});

describe("SortList (SCR-016, BR-APP-023)", () => {
  it("six rows for a sale of apartments in a city with zones and medians, with their hints", () => {
    list({ deal: "sale" });

    expect(sorts()).toEqual(ALL.map(([sort]) => sort));
    for (const [sort, label, hint] of ALL) {
      const node = screen.getByRole("radio", { name: label, description: hint ?? "" });
      expect(node.getAttribute("data-sort")).toBe(sort);
    }
  });

  it("daily rent offers neither `deal` nor `ppm`", () => {
    list({ deal: "rent_daily" });

    expect(sorts()).toEqual(["new", "cheap", "expensive", "center"]);
  });

  it("long rent of apartments: no `ppm`; with a house also no `deal`; a city without zones no `center`", () => {
    list();
    expect(sorts()).toEqual(["new", "cheap", "expensive", "deal", "center"]);
    cleanup();

    list({ types: ["apartment", "house"] }, { city: cityOf({ zones: [] }) });
    expect(sorts()).toEqual(["new", "cheap", "expensive"]);
  });

  it("an unknown city offers the three basic sorts and nothing throws", () => {
    expect(() => list({ deal: "sale" }, { city: null, sort: "ppm" })).not.toThrow();

    expect(sorts()).toEqual(["new", "cheap", "expensive"]);
    expect(checked()).toEqual(["new"]);
  });

  it("is a radiogroup with ✓ and `aria-checked` on the current sort only, one tab stop", () => {
    list({ deal: "sale" }, { sort: "center" });

    expect(screen.getByRole("radiogroup", { name: "Сортировка" })).toBeTruthy();
    expect(checked()).toEqual(["center"]);
    for (const node of rows()) {
      const current = node.getAttribute("data-sort") === "center";
      expect(node.querySelector("svg") !== null).toBe(current);
      expect(node.tabIndex).toBe(current ? 0 : -1);
    }
  });

  it("a sort the search does not offer reads as «Сначала новые»", () => {
    list({ deal: "rent_daily" }, { sort: "deal" });

    expect(checked()).toEqual(["new"]);
  });

  it("the arrow keys, Home and End move the focus without picking", () => {
    list({ deal: "sale" }, { sort: "cheap" });
    const group = screen.getByRole("radiogroup");
    row("Сначала дешевле").focus();

    fireEvent.keyDown(group, { key: "ArrowDown" });
    expect(document.activeElement?.getAttribute("data-sort")).toBe("expensive");
    fireEvent.keyDown(group, { key: "ArrowUp" });
    fireEvent.keyDown(group, { key: "ArrowUp" });
    expect(document.activeElement?.getAttribute("data-sort")).toBe("new");
    fireEvent.keyDown(group, { key: "ArrowUp" });
    expect(document.activeElement?.getAttribute("data-sort")).toBe("ppm");
    fireEvent.keyDown(group, { key: "Home" });
    expect(document.activeElement?.getAttribute("data-sort")).toBe("new");
    fireEvent.keyDown(group, { key: "End" });
    expect(document.activeElement?.getAttribute("data-sort")).toBe("ppm");
    expect(onPick).not.toHaveBeenCalled();
    expect(checked()).toEqual(["cheap"]);
  });

  it("a tap picks its sort, the current one too", () => {
    list({ deal: "sale" }, { sort: "cheap" });

    fireEvent.click(row("Дешевле за м²"));
    fireEvent.click(row("Сначала дешевле"));
    expect(onPick.mock.calls).toEqual([["ppm"], ["cheap"]]);
  });
});

describe("SortSheetRoute", () => {
  const sheet = (presentation: "layer" | "standalone") => render(intl(<SortSheetRoute presentation={presentation} />));
  const scrolls = () => vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);

  beforeEach(() => {
    feedReference({ cities: [TASHKENT, cityOf({ code: "samarkand", name: "Самарканд", zones: [], has_median: false })] });
  });

  it("the copy in @sheet: a compact sheet «Сортировка» with `data-route` and `data-layer`", () => {
    state.search = "city=tashkent&deal=sale&sort=cheap";
    sheet("layer");

    const dialog = screen.getByRole("dialog", { name: "Сортировка" });
    expect(dialog.getAttribute("data-variant")).toBe("compact");
    const content = dialog.querySelector('[data-route="sort"]');
    expect(content?.getAttribute("data-layer")).toBe("sheet");
    expect(within(dialog).getByRole("button", { name: "Закрыть" })).toBeTruthy();
    expect(checked()).toEqual(["cheap"]);
    expect(sorts()).toEqual(ALL.map(([sort]) => sort));
  });

  it("the sorts follow the search's city", () => {
    state.search = "city=samarkand&deal=sale";
    sheet("layer");

    expect(sorts()).toEqual(["new", "cheap", "expensive", "ppm"]);
  });

  it("a pick plays a light impact, closes to the feed with the sort, then scrolls to the top", async () => {
    state.search = "city=tashkent&deal=sale&rooms_min=2&from=map";
    const scrollTo = scrolls();
    sheet("layer");

    fireEvent.click(row("Ближе к центру"));
    await act(() => Promise.resolve());

    const filters = fromSearchParams(new URLSearchParams(state.search)).filters;
    expect(state.closeThen.mock.calls).toEqual([[routes.feed(toSearchParams(filters, "center"))]]);
    const target = new URL(state.closeThen.mock.calls[0][0], "https://app.homi.loc");
    expect(target.pathname).toBe("/");
    expect(target.searchParams.get("sort")).toBe("center");
    expect(target.searchParams.get("rooms_min")).toBe("2");
    expect(target.searchParams.has("from")).toBe(false);
    expect(impacts()).toEqual(["light"]);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("«Сначала новые» leaves `sort` out of the address", async () => {
    state.search = "city=tashkent&sort=cheap";
    scrolls();
    sheet("layer");

    fireEvent.click(row("Сначала новые"));
    await act(() => Promise.resolve());

    const target = new URL(state.closeThen.mock.calls[0][0], "https://app.homi.loc");
    expect(target.searchParams.has("sort")).toBe(false);
    expect(target.searchParams.get("city")).toBe("tashkent");
  });

  it("× closes without a pick", () => {
    sheet("layer");

    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(state.back).toHaveBeenCalledTimes(1);
    expect(state.closeThen).not.toHaveBeenCalled();
  });

  it("the direct load: no `data-layer`, and `data-route` is in the server HTML", () => {
    state.search = "city=tashkent";
    const html = renderToString(intl(<SortSheetRoute presentation="standalone" />));
    expect(html).toContain('data-route="sort"');
    expect(html).not.toContain('data-layer="sheet"');

    sheet("standalone");
    expect(document.querySelector('[data-route="sort"]')?.hasAttribute("data-layer")).toBe(false);
  });
});
