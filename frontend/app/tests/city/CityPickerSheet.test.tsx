import { getMessages } from "@homi/i18n";
import { defaultFilters, fromSearchParams, pickCity, type SearchFilters, toSearchParams } from "@homi/search";
import { SHEET_DRAG_SETTLE_MS } from "@homi/ui";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { type ReactNode, useState } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/actions/run";
import type { LocationResult } from "@/lib/telegram/location";

const state = vi.hoisted(() => ({
  search: "",
  back: vi.fn(),
  replace: vi.fn(),
  closeThen: vi.fn((href: string) => {
    void href;
    return Promise.resolve();
  }),
  patchMe: vi.fn(),
  updateSettings: vi.fn<(input: unknown, auth?: unknown, locale?: string) => Promise<ActionResult<unknown>>>(),
  located: true,
  get: vi.fn<() => Promise<LocationResult>>(),
  impact: vi.fn(),
  success: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/ru/city",
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => "/city" }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ me: null, patchMe: state.patchMe }) }));
vi.mock("@/lib/navigation/useBack", () => ({ useBack: () => ({ canGoBack: true, back: state.back }) }));
vi.mock("@/lib/navigation/closeThen", () => ({ closeThen: (href: string) => state.closeThen(href) }));
vi.mock("@/lib/navigation/nav", () => ({ nav: { replace: (href: string) => state.replace(href) } }));
vi.mock("@/lib/actions/settings", () => ({ updateSettings: state.updateSettings }));
vi.mock("@/lib/telegram", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telegram")>()),
  tg: {
    location: { available: () => state.located, get: () => state.get() },
    haptic: { impact: state.impact, success: state.success, error: vi.fn() },
  },
}));

import { CityPickerSheet } from "@/features/city/CityPickerSheet";
import { CitySheetRoute } from "@/features/city/CitySheetRoute";
import { useCityPick } from "@/features/city/useCityPick";
import { routes } from "@/lib/navigation/routes";
import type { CityStats } from "@/lib/reference/types";
import { resetReference } from "@/lib/reference/useReference";
import { storageGet, storageSet } from "@/lib/storage";

import { dragDown } from "../helpers/gestures";
import { cityOf, feedReference } from "../helpers/reference";

/** The three cities of the stub reference data: Tashkent with zones and metro, a region, and Andijan with neither. */
const TASHKENT = cityOf({ districts: [{ code: "chilonzor", name: "Чиланзар" }] });
const REGION = cityOf({ code: "tashkent_region", name: "Ташкентская область", center: { lat: 41.2213, lon: 69.8597 }, is_region: true, has_metro: false, has_median: false, districts: [], zones: [] });
const ANDIJAN = cityOf({ code: "andijan", name: "Андижан", center: { lat: 40.7821, lon: 72.3442 }, has_metro: false, has_median: false, districts: [], zones: [] });
const CITIES = [TASHKENT, REGION, ANDIJAN];
const STATS: CityStats[] = [
  { code: "tashkent", counts: { rent_long: 4120, rent_daily: 310, sale: 2890 }, price_presets: {}, typical_price: {} },
  { code: "tashkent_region", counts: { rent_long: 640, rent_daily: 25, sale: 410 }, price_presets: {}, typical_price: {} },
];
const NEAR_ANDIJAN = { lat: 40.79, lon: 72.34, accuracy: 20 };
const MOSCOW = { lat: 55.7558, lon: 37.6173, accuracy: 20 };
const SAVED: ActionResult<unknown> = { ok: true, data: { city: "andijan" }, meta: {} };
/** A Tashkent search with a district, the center zone and the metro: what a city change may clear. */
const SEARCH = "city=tashkent&districts=chilonzor&zones=center&near_metro=1&rooms_min=2&sort=center";

const intl = (children: ReactNode) => (
  <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
    {children}
  </NextIntlClientProvider>
);

const route = (presentation: "layer" | "standalone" = "layer") => render(intl(<CitySheetRoute presentation={presentation} />));
const dialog = () => screen.getByRole("dialog", { name: "Город" });
const row = (code: string) => document.querySelector<HTMLButtonElement>(`[data-city="${code}"]`)!;
const names = () => [...document.querySelectorAll("[data-city] b")].map((name) => name.textContent);
const checked = () => [...document.querySelectorAll('[data-city][aria-pressed="true"]')].map((node) => node.getAttribute("data-city"));
const lineOf = (code: string) => row(code).querySelector("b + span")?.textContent ?? null;
const locateRow = () => document.querySelector<HTMLButtonElement>('[data-row="locate"]');
const locateError = () => locateRow()?.querySelector("b + span")?.textContent ?? "";
const closeButton = () => within(dialog()).getByRole("button", { name: "Закрыть" });
const escape = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
const flush = () => act(async () => undefined);

async function locate(result: LocationResult) {
  state.get.mockResolvedValue(result);
  await act(async () => {
    fireEvent.click(locateRow()!);
  });
}

/** The href of the one `closeThen` a pick made. */
function closedTo(): URL {
  expect(state.closeThen).toHaveBeenCalledTimes(1);
  return new URL(state.closeThen.mock.calls[0][0], "https://app.test");
}

beforeEach(() => {
  state.search = SEARCH;
  state.located = true;
  state.get.mockReset();
  state.back.mockReset();
  state.replace.mockReset();
  state.closeThen.mockClear();
  state.patchMe.mockReset();
  state.updateSettings.mockReset().mockResolvedValue(SAVED);
  state.impact.mockReset();
  state.success.mockReset();
  storageSet("homi-city", null);
  window.history.replaceState(null, "", "/ru/city");
  feedReference({ cities: CITIES, stats: STATS });
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  resetReference();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("CityPickerSheet, header (/city)", () => {
  it("the copy in @sheet: a compact sheet «Город» with ×, data-route and data-layer, ✓ on the search's city", () => {
    route("layer");

    expect(dialog().getAttribute("data-variant")).toBe("compact");
    expect(dialog().querySelector('[data-route="city"]')?.getAttribute("data-layer")).toBe("sheet");
    expect(closeButton()).toBeTruthy();
    expect(names()).toEqual(["Ташкент", "Ташкентская область", "Андижан"]);
    expect(checked()).toEqual(["tashkent"]);
    expect(document.querySelector('[data-slot="city-picker-nested"]')).toBeNull();
  });

  it("the direct load: data-route is in the server HTML, with no data-layer", () => {
    const html = renderToString(intl(<CitySheetRoute presentation="standalone" />));
    expect(html).toContain('data-route="city"');
    expect(html).not.toContain("data-layer");

    route("standalone");
    expect(document.querySelector('[data-route="city"]')?.hasAttribute("data-layer")).toBe(false);
  });

  it("× closes through Back without a pick", () => {
    route("layer");

    fireEvent.click(closeButton());

    expect(state.back).toHaveBeenCalledTimes(1);
    expect(state.closeThen).not.toHaveBeenCalled();
    expect(state.updateSettings).not.toHaveBeenCalled();
  });

  it("a row pick: the city change of BR-APP-009 on the live search, saved, then the feed of the new search and the top", async () => {
    route("layer");

    fireEvent.click(row("andijan"));
    await flush();

    const params = closedTo().searchParams;
    expect(closedTo().pathname).toBe("/");
    expect(params.get("city")).toBe("andijan");
    expect(params.get("rooms_min")).toBe("2");
    for (const key of ["districts", "zones", "near_metro", "sort"]) {
      expect(params.has(key), key).toBe(false);
    }
    const live = fromSearchParams(SEARCH).filters;
    expect(state.closeThen.mock.calls[0][0]).toBe(routes.feed(toSearchParams(pickCity(live, ANDIJAN))));
    expect(storageGet("homi-city")).toBe("andijan");
    expect(state.updateSettings.mock.calls[0][0]).toEqual({ city: "andijan" });
    expect(state.patchMe).toHaveBeenCalledWith({ city: "andijan" });
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("the sort the new city still offers stays", async () => {
    state.search = "city=andijan&sort=center";
    route("layer");

    fireEvent.click(row("tashkent"));
    await flush();

    expect(closedTo().searchParams.get("sort")).toBe("center");
  });

  it("a row tap plays one light impact — CityList's — and the sheet adds none", async () => {
    route("layer");

    fireEvent.click(row("andijan"));
    await flush();

    expect(state.impact).toHaveBeenCalledTimes(1);
    expect(state.impact).toHaveBeenCalledWith();
    expect(state.success).not.toHaveBeenCalled();
  });

  it("counts with statistics; rows without a counts line while they load or after they failed", () => {
    const view = route("layer");
    expect(lineOf("tashkent")).toBe("4120 аренда · 2890 продажа");
    expect(lineOf("tashkent_region")).toBe("640 аренда · 410 продажа");
    expect(lineOf("andijan")).toBeNull();
    view.unmount();

    feedReference({ cities: CITIES, stats: null });
    route("layer");
    for (const city of CITIES) {
      expect(lineOf(city.code)).toBeNull();
    }
  });

  it("with one city in the loaded reference data it replaces /city by the feed of its search and renders nothing", () => {
    feedReference({ cities: [TASHKENT], stats: STATS });

    for (const presentation of ["layer", "standalone"] as const) {
      state.replace.mockReset();
      const view = route(presentation);

      expect(state.replace.mock.calls).toEqual([[routes.feed(toSearchParams(fromSearchParams(SEARCH).filters, "center"))]]);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.querySelector('[data-route="city"]')).toBeNull();
      view.unmount();
    }
  });

  it("without the reference data it shows the sheet, with no rows, and stays", () => {
    feedReference({ cities: [], stats: null, reference: null });

    route("standalone");

    expect(dialog().querySelector('[data-route="city"]')).not.toBeNull();
    expect(names()).toEqual([]);
    expect(state.replace).not.toHaveBeenCalled();
  });
});

describe("CityPickerSheet, the location row", () => {
  it("is offered only where the device can ask for a position", () => {
    state.located = false;
    route("layer");

    expect(locateRow()).toBeNull();
  });

  it("denied: «Нет доступа к геопозиции…», nothing picked", async () => {
    route("layer");
    await locate("denied");

    expect(locateError()).toBe("Нет доступа к геопозиции — выберите город из списка. Разрешить можно в настройках Telegram.");
    expect(state.closeThen).not.toHaveBeenCalled();
  });

  it("failed: «Не получилось определить, где вы…», nothing picked", async () => {
    route("layer");
    await locate("fail");

    expect(locateError()).toBe("Не получилось определить, где вы, — выберите город из списка.");
    expect(state.closeThen).not.toHaveBeenCalled();
  });

  it("no city in range: «Рядом с вами наших городов пока нет…», nothing picked", async () => {
    route("layer");
    await locate(MOSCOW);

    expect(locateError()).toBe("Рядом с вами наших городов пока нет — выберите из списка.");
    expect(state.closeThen).not.toHaveBeenCalled();
  });

  it("while pending: «Определяем…», the row disabled; a timeout after 12 s is a failure", async () => {
    vi.useFakeTimers();
    state.get.mockReturnValue(new Promise(() => undefined));
    route("layer");

    await act(async () => {
      fireEvent.click(locateRow()!);
    });
    expect(locateRow()?.textContent).toContain("Определяем…");
    expect(locateRow()?.getAttribute("aria-disabled")).toBe("true");

    await act(() => vi.advanceTimersByTimeAsync(12_000));
    expect(locateError()).toBe("Не получилось определить, где вы, — выберите город из списка.");
    expect(state.closeThen).not.toHaveBeenCalled();
  });

  it("found: the success haptic and the nearest city picked at once", async () => {
    route("layer");
    await locate(NEAR_ANDIJAN);
    await flush();

    expect(state.success).toHaveBeenCalledTimes(1);
    expect(closedTo().searchParams.get("city")).toBe("andijan");
    expect(storageGet("homi-city")).toBe("andijan");
  });

  it("a position that arrives after the sheet closed is dropped", async () => {
    let answer!: (result: LocationResult) => void;
    state.get.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const view = route("layer");

    await act(async () => {
      fireEvent.click(locateRow()!);
    });
    view.unmount();
    await act(async () => answer(NEAR_ANDIJAN));

    expect(state.success).not.toHaveBeenCalled();
    expect(state.closeThen).not.toHaveBeenCalled();
    expect(storageGet("homi-city")).toBeNull();
  });
});

describe("CityPickerSheet, nested (pick=city)", () => {
  const onPick = vi.fn();
  const onClose = vi.fn();

  const nested = (current = "tashkent") =>
    render(intl(<CityPickerSheet variant="nested" current={current} onPick={onPick} onClose={onClose} />));

  /** The full sheet's use: `useCityPick` on a draft, `close` as the layer's Back. */
  function Draft({ initial, update, close }: { initial: SearchFilters; update: (patch: Partial<SearchFilters>) => void; close: () => void }) {
    const [draft, setDraft] = useState(initial);
    const pick = useCityPick({
      variant: "nested",
      draft,
      update: (patch) => {
        update(patch);
        setDraft((current) => ({ ...current, ...patch }));
      },
      close,
    });
    return <CityPickerSheet variant="nested" current={draft.city} onPick={pick} onClose={close} />;
  }

  beforeEach(() => {
    onPick.mockReset();
    onClose.mockReset();
    window.history.replaceState(null, "", "/ru/filters?city=tashkent&pick=city");
  });

  it("a stacked compact sheet «Город» in a portal, marked city-picker-nested, with no data-route or data-layer", () => {
    const { container } = nested("andijan");

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(dialog().getAttribute("data-variant")).toBe("compact");
    expect(dialog().className).toMatch(/z-\(--z-toast\)/);
    expect(dialog().querySelector('[data-slot="city-picker-nested"]')).not.toBeNull();
    expect(document.querySelector("[data-route]")).toBeNull();
    expect(document.querySelector("[data-layer]")).toBeNull();
    expect(closeButton()).toBeTruthy();
    expect(checked()).toEqual(["andijan"]);
  });

  it("a row tap hands the code over and closes nothing by itself", () => {
    nested();

    fireEvent.click(row("andijan"));

    expect(onPick).toHaveBeenCalledExactlyOnceWith("andijan");
    expect(onClose).not.toHaveBeenCalled();
    expect(state.back).not.toHaveBeenCalled();
  });

  it("× asks onClose once, also when tapped again before the address changes", () => {
    nested();

    fireEvent.click(closeButton());
    fireEvent.click(closeButton());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(state.back).not.toHaveBeenCalled();

    window.history.replaceState(null, "", "/ru/filters?city=tashkent&pick=city&x=1");
    fireEvent.click(closeButton());
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("a backdrop tap, Escape and a closing drag ask onClose; the drag plays the light impact of every sheet", async () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(400);
    let view = nested();
    await act(() => vi.advanceTimersByTimeAsync(0));
    const backdrop = document.querySelector<HTMLElement>('[data-slot="bottom-sheet-overlay"]')!;
    fireEvent.pointerDown(backdrop, { pointerId: 2, button: 0 });
    fireEvent.pointerUp(backdrop, { pointerId: 2, button: 0 });
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();

    onClose.mockReset();
    view = nested();
    await act(() => vi.advanceTimersByTimeAsync(0));
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();

    onClose.mockReset();
    nested();
    await act(() => vi.advanceTimersByTimeAsync(0));
    dragDown(document.querySelector('[data-slot="bottom-sheet-header"]')!, 300);
    expect(state.impact).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(SHEET_DRAG_SETTLE_MS));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("with useCityPick: the city change on the draft only, then the layer closes; nothing saved, no navigation", async () => {
    const initial: SearchFilters = { ...defaultFilters("rent_long", "tashkent"), districts: ["chilonzor"], zones: ["center"], near_metro: true, below_median: true };
    const update = vi.fn();
    render(intl(<Draft initial={initial} update={update} close={onClose} />));

    fireEvent.click(row("andijan"));
    await flush();

    expect(update).toHaveBeenCalledExactlyOnceWith(pickCity(initial, ANDIJAN));
    expect(update.mock.calls[0][0]).toMatchObject({ city: "andijan", districts: [], zones: [], near_metro: false, below_median: false });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(state.closeThen).not.toHaveBeenCalled();
    expect(state.updateSettings).not.toHaveBeenCalled();
    expect(state.patchMe).not.toHaveBeenCalled();
    expect(storageGet("homi-city")).toBeNull();
    expect(checked()).toEqual(["andijan"]);
  });
});
