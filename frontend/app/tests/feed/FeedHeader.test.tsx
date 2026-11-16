import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pathname: "/",
  search: "",
  push: vi.fn(),
  tab: vi.fn(),
  replace: vi.fn(),
  loaded: true,
  cities: [] as { code: string; name: string }[],
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.search) }));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@/lib/navigation/nav", () => ({
  nav: {
    push: (href: string) => state.push(href),
    tab: (href: string) => state.tab(href),
    replace: (href: string) => state.replace(href),
  },
}));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ me: null }) }));
vi.mock("@/lib/reference/useReference", () => ({
  useReference: () => {
    const cities = state.loaded ? state.cities : [];
    return { loaded: state.loaded, cities, findCity: (code: string) => cities.find((city) => city.code === code) ?? null, usdUzs: 0 };
  },
}));

import { FeedHeader } from "@/features/feed/FeedHeader";

const LOCALES: readonly Locale[] = ["ru", "uz", "en"];
const TASHKENT = { code: "tashkent", name: "Ташкент" };
const SAMARKAND = { code: "samarkand", name: "Самарканд" };
const POLYGON = "41.30000,69.20000;41.32000,69.24000;41.28000,69.26000";
/** `price_max=90000` as `useMoney` prints it without a profile currency or rate: dollars in the locale's grouping. */
const UP_TO: Readonly<Record<Locale, string>> = { ru: "$90\u00a0000", uz: "$90\u00a0000", en: "$90,000" };

/** The catalogue text of `key` in `locale`, as the provider renders it. */
function text(locale: Locale, key: string): string {
  const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], getMessages(locale));
  if (typeof value !== "string") {
    throw new Error(`no text for ${key}`);
  }
  return value;
}

function tree(locale: Locale) {
  return (
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
      <FeedHeader />
    </NextIntlClientProvider>
  );
}

function header(locale: Locale = "ru") {
  return render(tree(locale));
}

const at = (pathname: string, search = "") => {
  state.pathname = pathname;
  state.search = search;
};

/** The chips in the order the row shows them. */
const chips = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLButtonElement>("[data-chip]")].map((chip) => chip.dataset.chip);

const chip = (container: HTMLElement, name: string) => {
  const found = container.querySelector<HTMLButtonElement>(`[data-chip="${name}"]`);
  if (!found) {
    throw new Error(`no ${name} chip`);
  }
  return found;
};

/** The one address `spy` was asked for. */
function navigated(spy: typeof state.push): string {
  expect(spy).toHaveBeenCalledTimes(1);
  return spy.mock.calls[0][0] as string;
}

let fake: FakeTelegram | null = null;
const haptics = () =>
  (fake?.calls ?? []).filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);

beforeEach(() => {
  at("/", "city=tashkent");
  for (const spy of [state.push, state.tab, state.replace]) {
    spy.mockReset();
  }
  state.loaded = true;
  state.cities = [TASHKENT, SAMARKAND];
  fake = fakeTelegram({ version: "8.0" });
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  fake?.uninstall();
  fake = null;
});

describe("FeedHeader chips (SCR-007)", () => {
  it("in order: filters, sort, rooms, price, owner, city; one row that scrolls sideways", () => {
    const { container } = header();

    expect(chips(container)).toEqual(["filters", "sort", "rooms", "price", "owner", "city"]);
    const row = container.querySelector('[data-slot="feed-header"]');
    expect(row?.hasAttribute("data-scroll-x")).toBe(true);
    expect(row?.classList).toContain("overflow-x-auto");
    for (const name of ["filters", "sort", "rooms", "price", "owner", "city"]) {
      expect(chip(container, name).classList).toContain("h-[38px]");
      expect(chip(container, name).classList).toContain("px-[14px]");
    }
  });

  it("a drawn area adds «Своя область», highlighted, after the sort; a tap switches to the map with the search", () => {
    at("/", `city=tashkent&rooms_min=2&polygon=${POLYGON}`);
    const { container } = header();

    expect(chips(container)).toEqual(["filters", "sort", "area", "rooms", "price", "owner", "city"]);
    const area = chip(container, "area");
    expect(area.textContent).toBe("Своя область");
    expect(area.getAttribute("data-state")).toBe("on");

    fireEvent.click(area);

    const url = new URL(navigated(state.tab), "https://app.test");
    expect(url.pathname).toBe("/map");
    expect(url.searchParams.get("polygon")).toBe(POLYGON);
    expect(url.searchParams.get("rooms_min")).toBe("2");
    expect(state.push).not.toHaveBeenCalled();
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
  });

  it.each([
    ["rooms", "types=room"],
    ["commercial", "types=commercial"],
    ["rooms and commercial", "types=room&types=commercial"],
    ["land", "deal=sale&types=land"],
    ["commercial and land", "deal=sale&types=commercial&types=land"],
  ])("BR-APP-006: no rooms chip for a search of %s only", (_, search) => {
    at("/", `city=tashkent&${search}`);
    const { container } = header();

    expect(chips(container)).toEqual(["filters", "sort", "price", "owner", "city"]);
  });

  it("a room type next to one with rooms keeps the rooms chip", () => {
    at("/", "city=tashkent&types=apartment&types=room");
    expect(chips(header().container)).toContain("rooms");
  });

  it("one city: no city chip", () => {
    state.cities = [TASHKENT];
    expect(chips(header().container)).toEqual(["filters", "sort", "rooms", "price", "owner"]);
  });

  it("before the reference data arrives: no city chip, the other chips with their default texts", () => {
    state.loaded = false;
    const { container } = header();

    expect(chips(container)).toEqual(["filters", "sort", "rooms", "price", "owner"]);
    expect(container.textContent).toBe("Сначала новыеКомнатыЦенаКто размещает");
  });

  it("the city chip names the search's city; a city the reference data does not know keeps the chip by its aria", () => {
    at("/", "city=samarkand");
    const { container, unmount } = header();
    expect(chip(container, "city").textContent).toBe("Самарканд");
    expect(chip(container, "city").getAttribute("data-state")).toBe("off");
    unmount();

    at("/", "city=nukus");
    const unknown = chip(header().container, "city");
    expect(unknown.textContent).toBe("");
    expect(unknown.getAttribute("aria-label")).toBe("Город");
  });
});

describe("the owner chip (LB-APP-042)", () => {
  it.each([
    ["any", "", "sheet.who", "off"],
    ["no_agents", "&owner=no_agents", "owner.no_agents", "on"],
    ["owners", "&owner=owners", "owner.owners", "on"],
  ])("owner %s reads its label and is highlighted only with a value", (_, search, key, highlighted) => {
    at("/", `city=tashkent${search}`);
    const owner = chip(header().container, "owner");

    expect(owner.textContent).toBe(text("ru", key));
    expect(owner.getAttribute("data-state")).toBe(highlighted);
  });
});

describe("the filters badge (BR-APP-011)", () => {
  it("counts the active groups and names them in the chip's label", () => {
    at("/", "city=tashkent&rooms_min=2&near_metro=1&owner=owners&posted_days=3");
    const filters = chip(header().container, "filters");

    const badge = filters.querySelector('[data-slot="header-chip-badge"]');
    expect(badge?.textContent).toBe("4");
    expect(badge?.getAttribute("aria-hidden")).toBe("true");
    expect(filters.getAttribute("aria-label")).toBe("Фильтры, 4");
    expect(screen.getByRole("button", { name: "Фильтры, 4" })).toBe(filters);
  });

  it("no active group: no badge and the plain name", () => {
    const filters = chip(header().container, "filters");

    expect(filters.querySelector('[data-slot="header-chip-badge"]')).toBeNull();
    expect(filters.getAttribute("aria-label")).toBe("Фильтры");
    expect(filters.getAttribute("data-state")).toBe("off");
  });
});

describe("labels in ru, uz and en", () => {
  it.each(LOCALES)("default search (%s): the sort's name, «Комнаты», «Цена», «Кто размещает»", (locale) => {
    const { container } = header(locale);

    expect(chip(container, "filters").getAttribute("aria-label")).toBe(text(locale, "sheet.title"));
    expect(chip(container, "sort").textContent).toBe(text(locale, "sort.new"));
    expect(chip(container, "sort").getAttribute("aria-label")).toBe(`${text(locale, "sort.title")}, ${text(locale, "sort.new")}`);
    expect(chip(container, "rooms").textContent).toBe(text(locale, "head.rooms"));
    expect(chip(container, "rooms").getAttribute("data-state")).toBe("off");
    expect(chip(container, "rooms").querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(chip(container, "price").textContent).toBe(text(locale, "head.price"));
    expect(chip(container, "price").getAttribute("data-state")).toBe("off");
    expect(chip(container, "owner").textContent).toBe(text(locale, "sheet.who"));
    expect(container.textContent).not.toMatch(/undefined|\{/);
  });

  it.each(LOCALES)("a set search (%s): the summaries of rooms and price, highlighted, and the sort", (locale) => {
    at("/", `city=tashkent&rooms_min=2&rooms_max=2&price_max=90000&sort=cheap&polygon=${POLYGON}`);
    const { container } = header(locale);

    expect(chip(container, "sort").textContent).toBe(text(locale, "sort.cheap"));
    expect(chip(container, "area").textContent).toBe(text(locale, "map.areaOn"));
    const rooms = chip(container, "rooms");
    expect(rooms.textContent).toBe(text(locale, "sum.roomsExact").replace("{n}", "2"));
    expect(rooms.getAttribute("data-state")).toBe("on");
    expect(rooms.querySelector("svg")).toBeNull();
    const price = chip(container, "price");
    expect(price.textContent).toBe(text(locale, "sum.priceUpto").replace("{hi}", UP_TO[locale]));
    expect(price.getAttribute("data-state")).toBe("on");
  });

  it("a sort the address cannot name reads «Сначала новые»", () => {
    at("/", "city=tashkent&sort=bogus");
    expect(chip(header().container, "sort").textContent).toBe("Сначала новые");
  });
});

describe("taps", () => {
  const SEARCH = "city=tashkent&deal=sale&rooms_min=2&sort=cheap";

  it.each([
    ["filters", "/filters"],
    ["sort", "/sort"],
    ["rooms", "/filters/rooms"],
    ["price", "/filters/price"],
    ["owner", "/filters/owner"],
    ["city", "/city"],
  ])("%s pushes %s with the search state only, after a light impact", (name, path) => {
    at("/", `${SEARCH}&from=x&utm=y`);
    const { container } = header();

    fireEvent.click(chip(container, name));

    expect(navigated(state.push)).toBe(`${path}?${SEARCH}`);
    expect(state.tab).not.toHaveBeenCalled();
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
  });
});

describe("the feed's own state (KI-43)", () => {
  it("under a listing over the feed the chips keep the feed's search and push it", () => {
    at("/", "city=tashkent&deal=sale&rooms_min=2");
    const { container, rerender } = header();

    at("/listing/42");
    rerender(tree("ru"));

    expect(chip(container, "rooms").getAttribute("data-state")).toBe("on");
    expect(chip(container, "filters").getAttribute("aria-label")).toBe("Фильтры, 1");
    fireEvent.click(chip(container, "price"));
    expect(navigated(state.push)).toBe("/filters/price?city=tashkent&deal=sale&rooms_min=2");
  });

  it("under a sheet with other parameters the chips keep the feed's; back on the feed they follow the address", () => {
    at("/", "city=tashkent");
    const { container, rerender } = header();

    at("/filters/rooms", "city=tashkent&rooms_min=3");
    rerender(tree("ru"));
    expect(chip(container, "rooms").getAttribute("data-state")).toBe("off");

    at("/", "city=tashkent&rooms_min=3");
    rerender(tree("ru"));
    expect(chip(container, "rooms").getAttribute("data-state")).toBe("on");
  });
});
