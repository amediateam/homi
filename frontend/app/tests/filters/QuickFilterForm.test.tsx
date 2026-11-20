import { getMessages } from "@homi/i18n";
import { defaultFilters, fromSearchParams, normalizeFilters, type SearchFilters, toSearchParams } from "@homi/search";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BffOptions } from "@/lib/api/browser";
import type { ApiResult } from "@/lib/api/types";

const state = vi.hoisted(() => ({
  search: "",
  bfcacheId: "_b_1_",
  currency: "USD",
  back: vi.fn(),
  closeThen: vi.fn((href: string) => {
    void href;
    return Promise.resolve();
  }),
  /** The answer of the next count request; `null` leaves it pending. */
  count: null as ApiResult<unknown> | null,
  sent: [] as { path: string; query: string }[],
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/ru/filters/rooms",
  useSearchParams: () => new URLSearchParams(state.search),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => "/filters/rooms", useRouter: () => ({ bfcacheId: state.bfcacheId }) }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ me: { currency: state.currency } }) }));
vi.mock("@/lib/navigation/useBack", () => ({ useBack: () => ({ canGoBack: true, back: state.back }) }));
vi.mock("@/lib/navigation/closeThen", () => ({ closeThen: (href: string) => state.closeThen(href) }));
vi.mock("@/lib/api/browser", () => ({
  bffFetch: (path: string, options: BffOptions) => {
    state.sent.push({ path, query: String(options.query) });
    return state.count === null ? new Promise(() => undefined) : Promise.resolve(state.count);
  },
}));

import { QuickFilterForm, type QuickFilterFormProps } from "@/features/filters/QuickFilterForm";
import { QuickFilterPage } from "@/features/filters/QuickFilterPage";
import { QuickFilterSheetRoute } from "@/features/filters/QuickFilterSheetRoute";
import { routes } from "@/lib/navigation/routes";
import type { CityStats } from "@/lib/reference/types";
import { resetReference } from "@/lib/reference/useReference";
import { searchRules } from "@/lib/search/rules";

import { withDevFlags } from "../helpers/flags";
import { cityOf, feedReference } from "../helpers/reference";
import { shownText } from "../helpers/shown";

const rules = withDevFlags({}, searchRules);
const TASHKENT = cityOf();
const STATS: CityStats = {
  code: "tashkent",
  counts: { rent_long: 120, rent_daily: 4, sale: 80 },
  price_presets: { rent_long: [300, 500] },
  typical_price: { rent_long: 450 },
};
const ok = (count: number): ApiResult<unknown> => ({ ok: true, data: { count }, meta: { source: "stub" } });
const failed = { ok: false, error: "offline", status: 0, method: "GET", path: "listings/count" } as unknown as ApiResult<unknown>;

const intl = (children: ReactNode) => (
  <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
    {children}
  </NextIntlClientProvider>
);

const onApply = vi.fn();

function form(kind: QuickFilterFormProps["kind"], initial: Partial<SearchFilters> = {}, presentation: QuickFilterFormProps["presentation"] = "layer") {
  const filters = normalizeFilters({ ...defaultFilters(), ...initial });
  return render(intl(<QuickFilterForm kind={kind} initial={filters} presentation={presentation} rules={rules} onApply={onApply} />));
}

const dialog = () => screen.getByRole("dialog");
const apply = () => screen.getByRole("button", { name: /^(Показать|Ничего нет)/ });
const reset = () => screen.getByRole("button", { name: "Сбросить" });
/** The draft the last «Показать …» handed over. */
const applied = (): SearchFilters => onApply.mock.lastCall![0] as SearchFilters;
const wait = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

let fake: FakeTelegram | null = null;
const impacts = () => (fake?.calls ?? []).filter((entry) => entry.member === "HapticFeedback.impactOccurred").map((entry) => entry.args[0]);

beforeEach(() => {
  vi.useFakeTimers();
  fake = fakeTelegram({ version: "8.0" });
  onApply.mockReset();
  state.back.mockReset();
  state.closeThen.mockClear();
  state.count = null;
  state.sent.length = 0;
  state.search = "";
  state.bfcacheId = "_b_1_";
  state.currency = "USD";
  feedReference({ cities: [TASHKENT], stats: [STATS], reference: { rates: { usd_uzs: 12_650 } } });
});

afterEach(() => {
  cleanup();
  resetReference();
  fake?.uninstall();
  fake = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("QuickFilterForm (SCR-015)", () => {
  it.each([
    ["rooms", {}, "Комнаты"],
    ["owner", {}, "Кто размещает"],
    ["price", { deal: "rent_long" }, "Цена в месяц, $"],
    ["price", { deal: "rent_daily" }, "Цена за сутки, $"],
    ["price", { deal: "sale" }, "Цена, $"],
  ] as const)("the %s sheet of %o is titled «%s»", (kind, initial, title) => {
    form(kind, initial);

    expect(dialog().getAttribute("data-variant")).toBe("compact");
    expect(screen.getByRole("dialog", { name: title })).toBeTruthy();
  });

  it("the price title follows the display currency", () => {
    state.currency = "UZS";
    form("price");

    expect(screen.getByRole("dialog", { name: "Цена в месяц, млн сум" })).toBeTruthy();
  });

  it("marks its content `filters/<kind>` and the copy in @sheet with `data-layer`", () => {
    form("owner");
    expect(dialog().querySelector('[data-route="filters/owner"]')?.getAttribute("data-layer")).toBe("sheet");
    cleanup();

    form("owner", {}, "standalone");
    expect(dialog().querySelector('[data-route="filters/owner"]')?.hasAttribute("data-layer")).toBe(false);
  });

  it("rooms: the room buttons and the hint", () => {
    form("rooms");

    const body = dialog().querySelector<HTMLElement>('[data-route="filters/rooms"]')!;
    expect([...body.querySelectorAll("[data-rooms]")].map((node) => node.textContent)).toEqual(["Любые", "1", "2", "3", "4+"]);
    expect(body.textContent).toContain("— два числа задают диапазон");
    fireEvent.click(within(body).getByRole("button", { name: "2" }));
    fireEvent.click(apply());
    expect([applied().rooms_min, applied().rooms_max]).toEqual([2, 2]);
  });

  it("price: the whole price section without its visible heading; daily rent has no «Не дороже рынка»", () => {
    form("price");
    let section = dialog().querySelector<HTMLElement>('[data-section="price"]')!;
    expect(section.className).toContain("[&>h2]:sr-only");
    expect(within(section).getByRole("heading").textContent).toBe("Цена в месяц, $");
    expect([...section.querySelectorAll("[data-preset]")].map((chip) => chip.textContent)).toEqual(["до $300", "до $500"]);
    expect(section.querySelector('[data-slot="typical-price"]')?.textContent).toBe("Ташкент: половина квартир — до $450 в месяц");
    expect(section.querySelector('[data-chip="below-median"]')).not.toBeNull();
    cleanup();

    form("price", { deal: "rent_daily" });
    section = dialog().querySelector<HTMLElement>('[data-section="price"]')!;
    expect(section.querySelector('[data-chip="below-median"]')).toBeNull();
  });

  it("owner: «Все» / «Без риелторов» / «Только хозяева»", () => {
    form("owner");

    const group = within(dialog()).getByRole("radiogroup", { name: "Кто размещает" });
    expect(within(group).getAllByRole("radio").map((node) => node.textContent)).toEqual(["Все", "Без риелторов", "Только хозяева"]);
    fireEvent.click(within(group).getByRole("radio", { name: "Только хозяева" }));
    fireEvent.click(apply());
    expect(applied().owner).toBe("owners");
  });

  describe("«Сбросить» resets only its own filter (BR-APP-022)", () => {
    const SET: Partial<SearchFilters> = { rooms_min: 2, rooms_max: 3, price_min: 100, price_max: 500, below_median: true, owner: "owners" };

    it.each([
      ["rooms", { rooms_min: null, rooms_max: null }],
      ["price", { price_min: null, price_max: null, below_median: false }],
      ["owner", { owner: "any" }],
    ] as const)("%s", (kind, cleared) => {
      form(kind, SET);

      fireEvent.click(reset());
      fireEvent.click(apply());
      expect(applied()).toEqual(normalizeFilters({ ...defaultFilters(), ...SET, ...cleared }));
    });

    it("plays no haptic", () => {
      form("rooms", SET);

      fireEvent.click(reset());
      expect(impacts()).toEqual([]);
    });
  });

  describe("the primary button", () => {
    it("«Показать» until the first count, which is the only request", async () => {
      state.count = ok(42);
      form("rooms");

      expect(shownText(apply())).toBe("Показать");
      await wait(249);
      expect(state.sent).toEqual([]);
      await wait(1);
      expect(shownText(apply())).toBe("Показать 42");
      await wait(1_000);
      expect(state.sent.map((request) => request.path)).toEqual(["listings/count"]);
    });

    it("«Ничего нет» for zero, and it still applies", async () => {
      state.count = ok(0);
      form("rooms");
      await wait(250);

      expect(shownText(apply())).toBe("Ничего нет");
      expect((apply() as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(apply());
      expect(onApply).toHaveBeenCalledTimes(1);
    });

    it("a failed count keeps the label", async () => {
      state.count = ok(7);
      form("rooms");
      await wait(250);
      expect(shownText(apply())).toBe("Показать 7");

      state.count = failed;
      fireEvent.click(screen.getByRole("button", { name: "3" }));
      await wait(250);
      expect(state.sent).toHaveLength(2);
      expect(shownText(apply())).toBe("Показать 7");
    });

    it("a count still on its way does not hold the apply back; the payload is the draft", () => {
      form("rooms", { city: "tashkent", deal: "sale", price_max: 90_000 });

      fireEvent.click(screen.getByRole("button", { name: "1" }));
      fireEvent.click(screen.getByRole("button", { name: "3" }));
      fireEvent.click(apply());
      expect(onApply).toHaveBeenCalledTimes(1);
      expect(applied()).toEqual(normalizeFilters({ ...defaultFilters("sale", "tashkent"), price_max: 90_000, rooms_min: 1, rooms_max: 3 }));
      expect(impacts()).toEqual(["light", "light"]);
    });
  });
});

describe("QuickFilterSheetRoute", () => {
  const route = (kind: QuickFilterFormProps["kind"], presentation: QuickFilterFormProps["presentation"] = "layer") =>
    render(intl(<QuickFilterSheetRoute kind={kind} presentation={presentation} />));

  it("starts from the address and applies to the feed with its sort: a medium impact, then closeThen and the top", async () => {
    state.search = "city=tashkent&rooms_min=2&rooms_max=2&sort=cheap&from=map";
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    route("rooms");
    expect(screen.getByRole("button", { name: "2" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "3" }));
    fireEvent.click(apply());
    await act(async () => undefined);

    const draft = normalizeFilters({ ...fromSearchParams(new URLSearchParams(state.search)).filters, rooms_max: 3 });
    expect(state.closeThen.mock.calls).toEqual([[routes.feed(toSearchParams(draft, "cheap"))]]);
    const target = new URL(state.closeThen.mock.calls[0][0], "https://app.homi.loc");
    expect(target.pathname).toBe("/");
    expect(target.searchParams.get("sort")).toBe("cheap");
    expect(target.searchParams.has("from")).toBe(false);
    expect(impacts()).toEqual(["light", "medium"]);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("the price sheet of a sale keeps a sale sort and writes the typed bound", async () => {
    state.search = "city=tashkent&deal=sale&sort=ppm";
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    route("price");

    fireEvent.change(screen.getByRole("textbox", { name: "до" }), { target: { value: "90000" } });
    fireEvent.click(apply());
    await act(async () => undefined);

    const target = new URL(state.closeThen.mock.calls[0][0], "https://app.homi.loc");
    expect(target.searchParams.get("sort")).toBe("ppm");
    expect(target.searchParams.get("price_max")).toBe("90000");
  });

  it("a sort the search does not offer leaves the address on apply (BR-APP-023)", async () => {
    state.search = "city=tashkent&sort=ppm";
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    route("owner");

    fireEvent.click(apply());
    await act(async () => undefined);

    const target = new URL(state.closeThen.mock.calls[0][0], "https://app.homi.loc");
    expect(target.searchParams.has("sort")).toBe(false);
  });

  it("a fresh open (a new bfcacheId) starts from the address again; the same id keeps the draft", () => {
    state.search = "city=tashkent&owner=owners";
    const view = route("owner");
    const radio = (name: string) => screen.getByRole("radio", { name });

    fireEvent.click(radio("Все"));
    expect(radio("Все").getAttribute("aria-checked")).toBe("true");
    view.rerender(intl(<QuickFilterSheetRoute kind="owner" presentation="layer" />));
    expect(radio("Все").getAttribute("aria-checked")).toBe("true");

    state.bfcacheId = "_b_2_";
    view.rerender(intl(<QuickFilterSheetRoute kind="owner" presentation="layer" />));
    expect(radio("Только хозяева").getAttribute("aria-checked")).toBe("true");
  });

  it("the rooms sheet of a search that hides rooms renders nothing and leaves for the feed once", () => {
    state.search = "city=tashkent&deal=sale&types=land&sort=cheap";
    const view = route("rooms", "standalone");

    expect(document.querySelector('[data-slot="bottom-sheet"]')).toBeNull();
    const filters = fromSearchParams(new URLSearchParams(state.search)).filters;
    expect(state.closeThen.mock.calls).toEqual([[routes.feed(toSearchParams(filters, "cheap"))]]);
    state.search = "city=tashkent&deal=sale&types=commercial";
    view.rerender(intl(<QuickFilterSheetRoute kind="rooms" presentation="standalone" />));
    expect(state.closeThen).toHaveBeenCalledTimes(1);
  });

  it("the price sheet of such a search stays", () => {
    state.search = "city=tashkent&deal=sale&types=land";
    route("price");

    expect(dialog().querySelector('[data-route="filters/price"]')).not.toBeNull();
    expect(state.closeThen).not.toHaveBeenCalled();
  });

  it("× closes without applying", () => {
    route("owner");

    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(state.back).toHaveBeenCalledTimes(1);
    expect(state.closeThen).not.toHaveBeenCalled();
  });

  it.each(["rooms", "price", "owner"] as const)("the direct load of %s has `data-route` in the server HTML", (kind) => {
    state.search = "city=tashkent";
    const html = renderToString(intl(<QuickFilterSheetRoute kind={kind} presentation="standalone" />));

    expect(html).toContain(`data-route="filters/${kind}"`);
    expect(html).not.toContain('data-layer="sheet"');
  });

  it("an unknown city does not throw", () => {
    state.search = "city=x";
    route("price");

    expect(dialog().querySelector('[data-route="filters/price"]')).not.toBeNull();
  });

  it("a direct load without `city`: the draft and the apply take the saved city, not the hydration render's (review C-3)", async () => {
    state.search = "rooms_min=2";
    state.count = ok(7);
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    feedReference({ cities: [TASHKENT, cityOf({ code: "samarkand", name: "Самарканд" })], stats: [STATS] });
    window.localStorage.setItem("homi-city", "samarkand");
    try {
      const element = intl(<QuickFilterSheetRoute kind="owner" presentation="standalone" />);
      const container = document.createElement("div");
      document.body.append(container);
      container.innerHTML = renderToString(element);
      const recoverable: unknown[] = [];
      let root: Root | null = null;
      await act(async () => {
        root = hydrateRoot(container, element, { onRecoverableError: (error) => void recoverable.push(error) });
      });
      await wait(250);

      expect(recoverable).toEqual([]);
      expect(new URLSearchParams(state.sent.at(-1)?.query).get("city")).toBe("samarkand");
      fireEvent.click(apply());
      await act(async () => undefined);
      const target = new URL(state.closeThen.mock.calls[0][0], "https://app.homi.loc");
      expect(target.searchParams.get("city")).toBe("samarkand");
      expect(target.searchParams.get("rooms_min")).toBe("2");
      act(() => root?.unmount());
      container.remove();
    } finally {
      window.localStorage.clear();
    }
  });
});

describe("QuickFilterPage", () => {
  it("renders the sheet route for rooms, price and owner", async () => {
    for (const kind of ["rooms", "price", "owner"] as const) {
      const page = await QuickFilterPage({ params: Promise.resolve({ kind }), presentation: "layer" });
      expect(page.type).toBe(QuickFilterSheetRoute);
      expect(page.props).toEqual({ kind, presentation: "layer" });
    }
  });

  it("calls notFound() for any other kind", async () => {
    await expect(QuickFilterPage({ params: Promise.resolve({ kind: "sort" }), presentation: "standalone" })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
