import { getMessages } from "@homi/i18n";
import { DEFAULT_RULES, defaultFilters, normalizeFilters, resolveRules, type SearchFilters } from "@homi/search";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LiveStats, LiveStatsOptions } from "@/features/filters/useLiveStats";
import type { ActionResult } from "@/lib/actions/run";

const state = vi.hoisted(() => ({
  search: "",
  back: vi.fn(),
  patchMe: vi.fn(),
  updateSettings: vi.fn<(input: unknown) => Promise<ActionResult<unknown>>>(),
  live: { count: null, flow: null } as LiveStats,
  liveOptions: [] as (LiveStatsOptions | undefined)[],
  ready: true,
  active: false,
  /** The `enabled` argument of every `useHasActiveRadar` call. */
  radarGates: [] as (boolean | undefined)[],
}));

/**
 * The `pick` layer as a tiny store: `open` and `close` re-render the form as the address change would. With `lag`,
 * `open` only pushes the parameter into `window.location`, as `pushState` does before the router's transition lands.
 */
const layer = vi.hoisted(() => {
  let value: string | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: string | null) => {
      value = next;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    closes: 0,
    opens: 0,
    lag: false,
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/ru/filters",
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => "/filters" }));
vi.mock("@/lib/navigation/useBack", () => ({ useBack: () => ({ canGoBack: true, back: state.back }) }));
vi.mock("@/lib/navigation/useLayerState", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useLayerState: () => ({
      value: useSyncExternalStore(layer.subscribe, layer.get, layer.get),
      open: (value: string) => {
        layer.opens += 1;
        if (layer.lag) {
          window.history.pushState(null, "", `?pick=${value}`);
        } else {
          layer.set(value);
        }
      },
      close: () => {
        layer.closes += 1;
        layer.set(null);
      },
    }),
  };
});
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ me: null, patchMe: state.patchMe }) }));
vi.mock("@/lib/actions/settings", () => ({ updateSettings: state.updateSettings }));
vi.mock("@/features/filters/useLiveStats", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/filters/useLiveStats")>()),
  useLiveStats: (_draft: SearchFilters, options?: LiveStatsOptions) => {
    state.liveOptions.push(options);
    return state.live;
  },
}));
vi.mock("@/features/radars/capability", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/radars/capability")>();
  return { ...real, useRadarsEnabled: () => real.useRadarsEnabled({ ready: state.ready }) };
});
/** The footer's ✓ asks `useHasActiveRadar` of `match.ts` (tested in `tests/radars/match.test.ts`). */
vi.mock("@/features/radars/match", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/radars/match")>()),
  useHasActiveRadar: (_filters: SearchFilters, enabled?: boolean) => {
    state.radarGates.push(enabled);
    return state.active;
  },
}));

import { FiltersForm, type FiltersFormProps } from "@/features/filters/FiltersForm";
import { normalizeFlow } from "@/features/filters/useLiveStats";
import type { Reference } from "@/lib/reference/types";
import { resetReference } from "@/lib/reference/useReference";
import { currentToast, dismissToast } from "@/lib/ui/toast";

import { cityOf, feedReference } from "../helpers/reference";
import { shownText } from "../helpers/shown";

const TASHKENT = cityOf({
  zones: [{ code: "center", name: "Центр" }],
  districts: [{ code: "yunusabad", name: "Юнусабад" }],
});
const SAMARKAND = cityOf({ code: "samarkand", name: "Самарканд", zones: [], districts: [], has_metro: false, has_median: false });
const STATS = [
  { code: "tashkent", counts: { rent_long: 120, rent_daily: 4, sale: 80 }, price_presets: {}, typical_price: {} },
  { code: "samarkand", counts: { rent_long: 10, rent_daily: 0, sale: 5 }, price_presets: {}, typical_price: {} },
];
const RELAX = { code: "price_up", label: "Цена до $700", rate: "≈5 в день", count: 35, filters: { city: "tashkent", price_max: 700 } };

const intl = (children: ReactNode) => (
  <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
    {children}
  </NextIntlClientProvider>
);

const handlers = { onApply: vi.fn(), onSubscribe: vi.fn(), onSave: vi.fn(), onDraw: vi.fn() };

function form(props: Partial<FiltersFormProps> = {}, filters: Partial<SearchFilters> = {}) {
  const initial = normalizeFilters({ ...defaultFilters("rent_long", "tashkent"), ...filters });
  return render(
    intl(
      <FiltersForm
        mode="search"
        initial={initial}
        presentation="layer"
        route="filters"
        rules={DEFAULT_RULES}
        oneVocabulary={false}
        submitting={false}
        {...handlers}
        {...props}
      />,
    ),
  );
}

function reference(overrides: Partial<Reference> | null = { radars_enabled: true }) {
  feedReference({ cities: [TASHKENT, SAMARKAND], stats: STATS, reference: overrides });
}

const sheet = () => screen.getByRole("dialog");
const content = () => sheet().querySelector<HTMLElement>('[data-route="filters"]')!;
const sectionNames = () => [...content().querySelectorAll(":scope > [data-section]")].map((node) => node.getAttribute("data-section"));
const footer = () => sheet().querySelector<HTMLElement>('[data-slot="filters-footer"]')!;
const actions = () => [...footer().querySelectorAll("[data-action]")].map((node) => node.getAttribute("data-action"));
const action = (name: string) => footer().querySelector<HTMLButtonElement>(`[data-action="${name}"]`);
const flowLine = () => shownText(footer().querySelector('[data-slot="flow-line"]'));
const tapReset = () => fireEvent.click(sheet().querySelector('[data-action="reset"]')!);
/** The draft as «Показать» hands it over. */
function applied(): SearchFilters {
  handlers.onApply.mockClear();
  fireEvent.click(action("apply")!);
  return handlers.onApply.mock.calls[0][0] as SearchFilters;
}

let fake: FakeTelegram | null = null;
const impacts = () => (fake?.calls ?? []).filter((entry) => entry.member === "HapticFeedback.impactOccurred").map((entry) => entry.args[0]);

beforeEach(() => {
  state.search = "";
  state.live = { count: null, flow: null };
  state.liveOptions.length = 0;
  state.ready = true;
  state.active = false;
  state.back.mockReset();
  state.patchMe.mockReset();
  state.updateSettings.mockReset();
  for (const handler of Object.values(handlers)) {
    handler.mockReset();
  }
  layer.set(null);
  layer.closes = 0;
  layer.opens = 0;
  layer.lag = false;
  window.history.replaceState(null, "", "/");
  reference();
  window.localStorage.clear();
  fake = fakeTelegram({ version: "8.0" });
});

afterEach(() => {
  cleanup();
  dismissToast("sheet");
  resetReference();
  fake?.uninstall();
  fake = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("FiltersForm: the three modes", () => {
  it.each([
    ["search", "Фильтры", ["subscribe", "apply"], true],
    ["radar-new", "Новый радар", ["subscribe"], false],
    ["radar-edit", "Условия радара", ["save"], false],
  ] as const)("%s: «%s», footer %o, posted section %s", (mode, title, buttons, posted) => {
    form({ mode });

    expect(sheet().getAttribute("data-variant")).toBe("full");
    expect(screen.getByRole("dialog", { name: title })).toBeTruthy();
    expect(within(sheet()).getByRole("button", { name: "Закрыть" })).toBeTruthy();
    expect(within(sheet()).getByRole("button", { name: "Сбросить" })).toBeTruthy();
    expect(actions()).toEqual(buttons);
    expect(sectionNames().includes("posted")).toBe(posted);
  });

  it("radar modes: «Сейчас подходит: {n}», empty until the first count; the button disabled while submitting", () => {
    form({ mode: "radar-new", submitting: true });
    expect(shownText(footer().querySelector('[data-slot="matching-now"]'))).toBe("");
    expect(action("subscribe")?.disabled).toBe(true);
    cleanup();

    state.live = { count: 14, flow: null };
    form({ mode: "radar-edit" });
    expect(shownText(footer().querySelector('[data-slot="matching-now"]'))).toBe("Сейчас подходит: 14");
    fireEvent.click(action("save")!);
    expect(handlers.onSave).toHaveBeenCalledWith(expect.objectContaining({ city: "tashkent" }), null);
  });

  it.each([
    ["search", true],
    ["radar-new", false],
    ["radar-edit", false],
  ] as const)("%s: the footer asks useHasActiveRadar with the gate %s (only search mode reads the plain list)", (mode, gate) => {
    state.radarGates.length = 0;
    form({ mode });

    expect(state.radarGates.length).toBeGreaterThan(0);
    expect(new Set(state.radarGates)).toEqual(new Set([gate]));
  });

  it("asks for the count and the forecast with the rules", () => {
    const rules = resolveRules({ dev025ValidateRanges: true });
    form({ rules });

    expect(state.liveOptions.at(-1)).toEqual({ flow: true, rules });
  });
});

describe("FiltersForm: sections", () => {
  it("long-term rent: the fixed order, the rent term offered by the city's daily listings", () => {
    form();

    expect(sectionNames()).toEqual([
      "deal",
      "city",
      "housing",
      "rentTerm",
      "rooms",
      "price",
      "where",
      "owner",
      "tenant",
      "pets",
      "furniture",
      "renovation",
      "floor",
      "area",
      "appliances",
      "posted",
    ]);
  });

  it("daily rent: the tenant section stays, the pets section goes (DEC-58), the area stays (DEC-62)", () => {
    form({}, { deal: "rent_daily" });

    expect(sectionNames()).toEqual([
      "deal",
      "city",
      "housing",
      "rentTerm",
      "rooms",
      "price",
      "where",
      "owner",
      "tenant",
      "furniture",
      "renovation",
      "floor",
      "area",
      "appliances",
      "posted",
    ]);
  });

  it("sale: area and market instead of tenant, pets and appliances; no rent term", () => {
    form({}, { deal: "sale" });

    expect(sectionNames()).toEqual([
      "deal",
      "city",
      "housing",
      "rooms",
      "price",
      "where",
      "owner",
      "furniture",
      "renovation",
      "floor",
      "area",
      "market",
      "posted",
    ]);
  });

  it("follows the draft: land only hides rooms, a single city hides the city field", () => {
    feedReference({ cities: [TASHKENT], stats: STATS, reference: {} });
    form({ mode: "radar-edit" }, { deal: "sale", types: ["land"] });

    expect(sectionNames()).toEqual(["deal", "housing", "price", "where", "owner", "furniture", "renovation", "floor", "area", "market"]);
  });

  it.each(["layer", "standalone"] as const)("an unknown city renders without throwing (%s)", (presentation) => {
    form({ presentation }, { city: "x" });

    expect(content().getAttribute("data-layer")).toBe(presentation === "layer" ? "sheet" : null);
    expect(sectionNames()).toContain("where");
    expect(sectionNames()).not.toContain("rentTerm");
  });

  it("hands «Обвести на карте» the draft without districts and zones", () => {
    form({}, { zones: ["center"], price_max: 500 });

    fireEvent.click(within(content()).getByRole("button", { name: "Обвести на карте" }));
    expect(handlers.onDraw).toHaveBeenCalledTimes(1);
    expect(handlers.onDraw.mock.calls[0][0]).toMatchObject({ zones: [], districts: [], polygon: null, price_max: 500 });
  });

  it("shows the pets tip in the sheet's own toast host", () => {
    form();

    fireEvent.click(within(content()).getByRole("radio", { name: "Не запрещены" }));
    const host = sheet().querySelector('[data-toast-host="sheet"]');
    expect(host?.textContent).toContain("Скроем объявления, где животных прямо запрещают");
    expect(currentToast("app")).toBeNull();
  });

  it("scrolls the focused section into view 350 ms after opening", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const scrolled: { section: string | null; options: unknown }[] = [];
    const original = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
    Element.prototype.scrollIntoView = function (this: Element, options?: boolean | ScrollIntoViewOptions) {
      scrolled.push({ section: this.getAttribute("data-section"), options });
    };
    try {
      form({ focus: "pets" });

      act(() => void vi.advanceTimersByTime(349));
      expect(scrolled).toEqual([]);
      act(() => void vi.advanceTimersByTime(1));
      expect(scrolled).toEqual([{ section: "pets", options: { behavior: "smooth", block: "center" } }]);
    } finally {
      if (original) {
        Object.defineProperty(Element.prototype, "scrollIntoView", original);
      } else {
        Reflect.deleteProperty(Element.prototype, "scrollIntoView");
      }
    }
  });
});

describe("FiltersForm: reset", () => {
  it.each([
    [false, "rent_long"],
    [true, "rent_daily"],
  ] as const)("dev018ResetKeepsDaily %s: daily rent resets to %s, in the same city", (dev018, deal) => {
    form({ rules: resolveRules({ dev018ResetKeepsDaily: dev018 }) }, { deal: "rent_daily", rooms_min: 2, owner: "owners", city: "samarkand" });

    tapReset();
    expect(applied()).toEqual(defaultFilters(deal, "samarkand"));
  });
});

describe("FiltersForm: the footer", () => {
  it.each([
    [null, "Показать"],
    [12, "Показать 12"],
    [0, "Ничего нет"],
  ] as const)("count %s: «%s», which applies the draft", (count, label) => {
    state.live = { count, flow: null };
    form({}, { rooms_min: 2 });

    expect(shownText(action("apply"))).toBe(label);
    expect(applied()).toMatchObject({ rooms_min: 2 });
  });

  for (const oneVocabulary of [false, true]) {
    it.each([
      [{ week: 21, days: 7 }, "📡 Радар: ≈3 в день"],
      [{ week: 4, days: 7 }, "📡 Радар: 4 за неделю"],
      [{ week: 0, days: 7 }, "📡 За неделю таких не было — радар будет срабатывать редко"],
    ])(`flow %o → «%s» (dev021OneFlowVocabulary ${oneVocabulary ? "on" : "off"})`, (answer, line) => {
      state.live = { count: 5, flow: normalizeFlow(answer) };
      form({ oneVocabulary });

      expect(flowLine()).toBe(line);
    });
  }

  it("without a flow: an empty line that keeps its place, and no relax chips", () => {
    state.live = { count: 5, flow: normalizeFlow({ week: 3 }) };
    form();

    const line = footer().querySelector('[data-slot="flow-line"]');
    expect(line?.textContent).toBe("");
    expect(line?.classList).toContain("min-h-[18px]");
    expect(footer().querySelector("[data-relax]")).toBeNull();
  });

  it("a relax chip: light impact, the draft replaced by its re-normalised filters, the code remembered through a reset", () => {
    state.live = { count: 5, flow: normalizeFlow({ week: 2, days: 7, options: [RELAX] }) };
    form({ mode: "radar-edit" }, { rooms_min: 3, owner: "owners" });

    const chip = footer().querySelector<HTMLButtonElement>('[data-relax="price_up"]')!;
    expect(chip.textContent).toBe("Цена до $700 · ≈5 в день");
    fireEvent.click(chip);
    expect(impacts()).toEqual(["light"]);

    fireEvent.click(action("save")!);
    expect(handlers.onSave).toHaveBeenLastCalledWith(normalizeFilters({ city: "tashkent", price_max: 700 }), "price_up");

    tapReset();
    fireEvent.click(action("save")!);
    expect(handlers.onSave).toHaveBeenLastCalledWith(defaultFilters("rent_long", "tashkent"), "price_up");
  });

  it("«Включить радар» subscribes the draft with no relax code; disabled while submitting", () => {
    form({}, { rooms_min: 1 });
    fireEvent.click(action("subscribe")!);
    expect(handlers.onSubscribe).toHaveBeenCalledWith(expect.objectContaining({ rooms_min: 1 }), null);
    expect(handlers.onApply).not.toHaveBeenCalled();
    cleanup();

    form({ submitting: true });
    expect(action("subscribe")?.disabled).toBe(true);
    expect(action("apply")?.disabled).toBe(false);
  });

  it.each([
    ["radars ready, the server's switch on", true, { radars_enabled: true }, ["subscribe", "apply"]],
    ["radars ready, the server's switch off", true, { radars_enabled: false }, ["apply"]],
    ["radars ready, the reference data missing", true, null, ["apply"]],
    ["the radar screens not ready", false, { radars_enabled: true }, ["apply"]],
  ] as const)("%s: footer %o", (_case, ready, data, buttons) => {
    state.ready = ready;
    reference(data);
    form();

    expect(actions()).toEqual(buttons);
    expect(footer().querySelector('[data-state="radar-on"]')).toBeNull();
  });

  it("«Радар включён» instead of the button while a radar has the same filters", () => {
    state.active = true;
    form();

    expect(footer().querySelector('[data-state="radar-on"]')?.textContent).toBe("Радар включён");
    expect(actions()).toEqual(["apply"]);
  });
});

describe("FiltersForm: the nested city picker", () => {
  it("the city field opens the pick=city layer; a pick changes the draft only and closes it", () => {
    form({}, { districts: ["yunusabad"], zones: [], near_metro: true });

    fireEvent.click(content().querySelector('[data-field="city"]')!);
    expect(layer.get()).toBe("city");
    const picker = document.querySelector('[data-slot="city-picker-nested"]')!;
    expect(picker).toBeTruthy();
    expect(picker.closest("[data-route]")).toBeNull();

    fireEvent.click(picker.querySelector('[data-city="samarkand"]')!);
    expect(layer.closes).toBe(1);
    expect(document.querySelector('[data-slot="city-picker-nested"]')).toBeNull();
    expect(content().querySelector('[data-field="city"]')?.textContent).toContain("Самарканд");
    expect(state.updateSettings).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("homi-city")).toBeNull();
    expect(applied()).toMatchObject({ city: "samarkand", districts: [], near_metro: false });
  });

  it("a double tap on the city field opens the layer once, also before the router has the parameter (review P-3)", () => {
    form();
    const field = content().querySelector<HTMLButtonElement>('[data-field="city"]')!;

    layer.lag = true;
    fireEvent.click(field);
    fireEvent.click(field);
    expect(layer.opens).toBe(1);
    expect(window.location.search).toBe("?pick=city");

    window.history.replaceState(null, "", "/");
    layer.lag = false;
    fireEvent.click(field);
    expect(layer.opens).toBe(2);
    expect(layer.get()).toBe("city");
    fireEvent.click(field);
    expect(layer.opens).toBe(2);
  });
});
