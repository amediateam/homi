import { getMessages } from "@homi/i18n";
import type { SearchFilters } from "@homi/search";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SubscribeOptions, SubscribeResult } from "@/features/radars/subscribe";
import type { ActionResult } from "@/lib/actions/run";
import type { DevFlags } from "@/lib/flags";

const state = vi.hoisted(() => ({
  search: "",
  bfcacheId: "open-1",
  flags: {} as Partial<DevFlags>,
  back: vi.fn(),
  closeThen: vi.fn((href: string) => {
    void href;
    return Promise.resolve();
  }),
  patchMe: vi.fn(),
  updateSettings: vi.fn<(input: unknown) => Promise<ActionResult<unknown>>>(),
  fetched: [] as string[],
  subscribe: vi.fn<(filters: SearchFilters, entry: string, relaxed?: string | null, options?: SubscribeOptions) => Promise<SubscribeResult>>(),
}));

/** The `pick` layer as a tiny store: `open` and `close` re-render the form as the address change would. */
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
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/ru/filters",
  useSearchParams: () => new URLSearchParams(state.search),
  useRouter: () => ({ bfcacheId: state.bfcacheId }),
}));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => "/filters" }));
vi.mock("@/lib/navigation/useBack", () => ({ useBack: () => ({ canGoBack: true, back: state.back }) }));
vi.mock("@/lib/navigation/closeThen", () => ({ closeThen: (href: string) => state.closeThen(href) }));
vi.mock("@/lib/navigation/useLayerState", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useLayerState: () => ({
      value: useSyncExternalStore(layer.subscribe, layer.get, layer.get),
      open: (value: string) => layer.set(value),
      close: () => layer.set(null),
    }),
  };
});
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ me: null, patchMe: state.patchMe }) }));
vi.mock("@/lib/actions/settings", () => ({ updateSettings: state.updateSettings }));
vi.mock("@/lib/api/browser", () => ({
  bffFetch: (path: string) => {
    state.fetched.push(path);
    return Promise.resolve({ ok: false, error: "offline", status: 0, method: "GET", path });
  },
}));
vi.mock("@/lib/flags", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/flags")>();
  return {
    ...real,
    get devFlags() {
      return { ...real.devFlags, ...state.flags };
    },
  };
});
vi.mock("@/features/radars/capability", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/radars/capability")>();
  return { ...real, useRadarsEnabled: () => real.useRadarsEnabled({ ready: true }) };
});
/** The flow is `useSubscribe()`'s (tested in `tests/radars/subscribe.test.ts`); the route only calls it. */
vi.mock("@/features/radars/subscribe", () => ({
  useSubscribe: () => ({ subscribe: state.subscribe, saveEdit: vi.fn(), relax: vi.fn() }),
}));
vi.mock("@/features/radars/match", () => ({ useHasActiveRadar: () => false }));

import { FiltersSheetRoute } from "@/features/filters/FiltersSheetRoute";
import { resetReference } from "@/lib/reference/useReference";
import { storageSet } from "@/lib/storage";
import { consumeDrawRequest } from "@/lib/ui/shellState";

import { cityOf, feedReference } from "../helpers/reference";

const TASHKENT = cityOf({ zones: [{ code: "center", name: "Центр" }], districts: [{ code: "yunusabad", name: "Юнусабад" }] });
const SAMARKAND = cityOf({ code: "samarkand", name: "Самарканд", zones: [], districts: [], has_metro: false, has_median: false });

const intl = (children: ReactNode) => (
  <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
    {children}
  </NextIntlClientProvider>
);

function route(presentation: "layer" | "standalone" = "layer") {
  return render(intl(<FiltersSheetRoute presentation={presentation} />));
}

const sheet = () => screen.getByRole("dialog");
const content = () => sheet().querySelector<HTMLElement>('[data-route="filters"]')!;
const button = (name: string) => sheet().querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!;
/** Lets the promise chains of an apply, a subscribe or a save settle. */
const settle = () => act(async () => undefined);
const navigated = () => state.closeThen.mock.calls.map(([href]) => href);
/** The toast scope a subscribe call passed, read as `useSubscribe` reads it when the answer arrives. */
const scopeOf = (call: number) => {
  const scope = state.subscribe.mock.calls[call][3]?.scope;
  if (typeof scope !== "function") {
    throw new Error(`the subscribe call passed the scope ${String(scope)}, not a function`);
  }
  return scope;
};

async function apply(): Promise<string> {
  state.closeThen.mockClear();
  fireEvent.click(button("apply"));
  await settle();
  expect(state.closeThen).toHaveBeenCalledTimes(1);
  return state.closeThen.mock.calls[0][0];
}

function pickCity(code: string) {
  fireEvent.click(content().querySelector('[data-field="city"]')!);
  fireEvent.click(document.querySelector(`[data-slot="city-picker-nested"] [data-city="${code}"]`)!);
}

let fake: FakeTelegram | null = null;
const impacts = () => (fake?.calls ?? []).filter((entry) => entry.member === "HapticFeedback.impactOccurred").map((entry) => entry.args[0]);

beforeEach(() => {
  state.search = "city=tashkent";
  state.bfcacheId = "open-1";
  state.flags = {};
  state.fetched.length = 0;
  for (const spy of [state.back, state.closeThen, state.patchMe, state.updateSettings, state.subscribe]) {
    spy.mockClear();
  }
  state.updateSettings.mockResolvedValue({ ok: true, data: {}, meta: {} } as ActionResult<unknown>);
  layer.set(null);
  feedReference({ cities: [TASHKENT, SAMARKAND], stats: [], reference: { radars_enabled: true } });
  window.localStorage.clear();
  consumeDrawRequest();
  fake = fakeTelegram({ version: "8.0" });
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  // The sheet's address in the browser (`currentAddress()`); jsdom shares `window.location` across tests.
  window.history.replaceState(null, "", "/ru/filters?city=tashkent");
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  resetReference();
  fake?.uninstall();
  fake = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("FiltersSheetRoute: the addresses", () => {
  it("the copy in @sheet: the full sheet «Фильтры» with `data-route` and `data-layer` inside it", () => {
    route("layer");

    expect(screen.getByRole("dialog", { name: "Фильтры" }).getAttribute("data-variant")).toBe("full");
    const copy = document.querySelector('[data-slot="bottom-sheet"] [data-route="filters"][data-layer="sheet"]');
    expect(copy).toBe(content());
  });

  it("the direct load: `data-route` without `data-layer`, already in the server HTML", () => {
    const html = renderToString(intl(<FiltersSheetRoute presentation="standalone" />));
    expect(html).toContain('data-route="filters"');
    expect(html).not.toContain('data-layer="sheet"');

    route("standalone");
    expect(content().hasAttribute("data-layer")).toBe(false);
  });

  it.each(["layer", "standalone"] as const)("an unknown city does not throw (%s)", (presentation) => {
    state.search = "city=x";
    route(presentation);

    expect(content()).toBeTruthy();
    expect(button("apply").textContent).toBe("Показать");
  });

  it("refreshes the cities' statistics once per opening", () => {
    const { rerender } = route();
    rerender(intl(<FiltersSheetRoute presentation="layer" />));

    expect(state.fetched.filter((path) => path === "cities")).toHaveLength(1);
  });
});

describe("FiltersSheetRoute: «Показать …»", () => {
  it("a medium impact, then the feed with the draft and the sort, without the reserved parameters", async () => {
    state.search = "city=tashkent&rooms_min=2&sort=cheap&focus=other";
    route();

    expect(await apply()).toBe("/?city=tashkent&rooms_min=2&sort=cheap");
    expect(impacts()).toEqual(["medium"]);
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    expect(state.updateSettings).not.toHaveBeenCalled();
  });

  it("from the map: back to the map", async () => {
    state.search = "city=tashkent&deal=sale&from=map";
    route();

    expect(await apply()).toBe("/map?city=tashkent&deal=sale");
  });

  it("a city picked in the nested layer is saved, and a sort it does not offer falls back to `new`", async () => {
    state.search = "city=tashkent&zones=center&sort=center";
    route();

    pickCity("samarkand");
    expect(await apply()).toBe("/?city=samarkand");
    expect(window.localStorage.getItem("homi-city")).toBe("samarkand");
    expect(state.updateSettings).toHaveBeenCalledWith({ city: "samarkand" }, undefined, "ru");
    expect(state.patchMe).toHaveBeenCalledWith({ city: "samarkand" });
  });
});

describe("FiltersSheetRoute: «Включить радар»", () => {
  it("subscribes the draft from the filters entry, failures toasted in the sheet; on success it closes without applying", async () => {
    let resolve: (result: SubscribeResult) => void = () => undefined;
    state.subscribe.mockReturnValue(new Promise((done) => (resolve = done)));
    state.search = "city=tashkent&rooms_min=2";
    route();

    fireEvent.click(button("subscribe"));
    expect(state.subscribe).toHaveBeenCalledWith(expect.objectContaining({ rooms_min: 2 }), "filters", null, { scope: expect.any(Function), confirm: expect.any(Function) });
    expect(button("subscribe").disabled).toBe(true);
    fireEvent.click(button("subscribe"));
    expect(state.subscribe).toHaveBeenCalledTimes(1);
    // Still on the sheet: a failure would show inside it.
    expect(scopeOf(0)()).toBe("sheet");

    await act(async () => resolve({ ok: true }));
    expect(state.back).toHaveBeenCalledTimes(1);
    expect(state.closeThen).not.toHaveBeenCalled();
  });

  it("an answer that finds the user elsewhere (×, Back, «Показать») neither steps back nor toasts in the closed sheet", async () => {
    let resolve: (result: SubscribeResult) => void = () => undefined;
    state.subscribe.mockReturnValue(new Promise((done) => (resolve = done)));
    route();

    fireEvent.click(button("subscribe"));
    // «Показать» while the request runs: `applyFilters` went back to the feed and replaced it.
    window.history.pushState(null, "", "/ru?city=tashkent&rooms_min=2");
    expect(scopeOf(0)()).toBe("app");

    await act(async () => resolve({ ok: true }));
    expect(state.back).not.toHaveBeenCalled();
    // The route outlives the sheet under <Activity>: the button is not left disabled for the next showing.
    expect(button("subscribe").disabled).toBe(false);
  });

  it("on failure the sheet stays open and the button comes back", async () => {
    state.subscribe.mockResolvedValue({ ok: false });
    route();

    fireEvent.click(button("subscribe"));
    await settle();
    expect(state.back).not.toHaveBeenCalled();
    expect(button("subscribe").disabled).toBe(false);
  });
});

describe("FiltersSheetRoute: «Обвести на карте»", () => {
  it("requests drawing and goes to the map without districts, zones or a `draw` parameter", async () => {
    state.search = "city=tashkent&zones=center&price_max=500&sort=center";
    route();

    fireEvent.click(within(content()).getByRole("button", { name: "Обвести на карте" }));
    await settle();
    expect(navigated()).toEqual(["/map?city=tashkent&price_max=500&sort=center"]);
    expect(consumeDrawRequest()).toBe(true);
    expect(state.updateSettings).not.toHaveBeenCalled();
  });

  it("runs once per showing: a second tap steps back no second time; a changed address takes it again (review P-2)", async () => {
    const { rerender } = route();
    const chip = () => within(content()).getByRole("button", { name: "Обвести на карте" });

    fireEvent.click(chip());
    fireEvent.click(chip());
    await settle();
    expect(navigated()).toEqual(["/map?city=tashkent"]);

    state.search = "city=tashkent&pick=city";
    rerender(intl(<FiltersSheetRoute presentation="layer" />));
    fireEvent.click(chip());
    await settle();
    expect(navigated()).toEqual(["/map?city=tashkent", "/map?city=tashkent"]);
  });

  it("saves a city the nested picker changed", async () => {
    route();

    pickCity("samarkand");
    fireEvent.click(within(content()).getByRole("button", { name: "Обвести на карте" }));
    await settle();
    expect(navigated()).toEqual(["/map?city=samarkand"]);
    expect(window.localStorage.getItem("homi-city")).toBe("samarkand");
  });
});

describe("FiltersSheetRoute: the pets entry (BR-APP-057)", () => {
  // jsdom has no `scrollIntoView`: an apply case slower than the 350 ms focus delay would throw from the timer.
  beforeEach(() => {
    Element.prototype.scrollIntoView = () => {};
  });
  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  });

  it.each([
    ["sale", "city=tashkent&deal=sale&rooms_min=2&focus=pets", "/?city=tashkent"],
    ["daily rent", "city=tashkent&deal=rent_daily&rooms_min=2&focus=pets", "/?city=tashkent"],
    ["long-term rent", "city=tashkent&rooms_min=2&focus=pets", "/?city=tashkent&rooms_min=2"],
  ])("%s: %s applies %s", async (_deal, search, href) => {
    state.search = search;
    route();

    expect(content().querySelector('[data-focus="pets"]')).toBeTruthy();
    expect(await apply()).toBe(href);
  });

  it("scrolls to the pets section after 350 ms", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const scrolled: (string | null)[] = [];
    const original = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.getAttribute("data-focus"));
    };
    try {
      state.search = "city=tashkent&focus=pets";
      route();
      act(() => void vi.advanceTimersByTime(350));
      expect(scrolled).toEqual(["pets"]);
    } finally {
      if (original) {
        Object.defineProperty(Element.prototype, "scrollIntoView", original);
      } else {
        Reflect.deleteProperty(Element.prototype, "scrollIntoView");
      }
    }
  });
});

describe("FiltersSheetRoute: the draft's lifetime", () => {
  it("keeps the draft while `bfcacheId` stays (the nested layer, back/forward) and starts over when it changes", async () => {
    const { rerender } = route();
    fireEvent.click(within(content()).getByRole("button", { name: "Семья" }));

    rerender(intl(<FiltersSheetRoute presentation="layer" />));
    expect(await apply()).toBe("/?city=tashkent&tenant=family");

    state.bfcacheId = "open-2";
    rerender(intl(<FiltersSheetRoute presentation="layer" />));
    expect(await apply()).toBe("/?city=tashkent");
  });

  it("an address without a city follows the city it falls back to once the saved one is known", async () => {
    state.search = "";
    route();

    act(() => storageSet("homi-city", "samarkand"));
    expect(await apply()).toBe("/?city=samarkand");
    expect(state.updateSettings).not.toHaveBeenCalled();
  });
});

describe("FiltersSheetRoute: the flags", () => {
  it.each([
    [false, "/?city=tashkent"],
    [true, "/?city=tashkent&deal=rent_daily"],
  ] as const)("dev018ResetKeepsDaily %s: «Сбросить» on daily rent applies %s", async (dev018, href) => {
    state.flags = { dev018ResetKeepsDaily: dev018 };
    state.search = "city=tashkent&deal=rent_daily&rooms_min=1";
    route();

    fireEvent.click(button("reset"));
    expect(await apply()).toBe(href);
  });
});

describe("FiltersSheetRoute: the save phases of «Включить радар» (WP-39, BR-APP-114)", () => {
  const phase = () => button("subscribe").getAttribute("data-phase");
  const tick = () => button("subscribe").querySelector('[data-slot="save-tick"]');

  /** The flow as `useSubscribe` runs it: the answer, then the button's tick, then the result. */
  function confirming() {
    let answer: () => void = () => undefined;
    const arrived = new Promise<void>((done) => (answer = done));
    state.subscribe.mockImplementation(async (_filters, _entry, _relaxed, options) => {
      await arrived;
      await options?.confirm?.();
      return { ok: true };
    });
    return { answer: () => act(async () => answer()) };
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("idle → the spinner while the request runs → the tick for 900 ms → the sheet closes", async () => {
    const flow = confirming();
    route();
    expect(phase()).toBe("idle");

    fireEvent.click(button("subscribe"));
    expect(phase()).toBe("busy");
    expect(button("subscribe").querySelector('[data-slot="save-spinner"]')).not.toBeNull();

    await flow.answer();
    expect(phase()).toBe("done");
    expect(tick()).not.toBeNull();
    expect(state.back).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(899));
    expect(state.back).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(state.back).toHaveBeenCalledTimes(1);
  });

  it("a sheet the user already left draws no tick: the flow goes on at once and nothing steps back", async () => {
    const flow = confirming();
    route();

    fireEvent.click(button("subscribe"));
    window.history.pushState(null, "", "/ru?city=tashkent&rooms_min=2");
    await flow.answer();
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(tick()).toBeNull();
    expect(phase()).toBe("idle");
    expect(state.back).not.toHaveBeenCalled();
  });

  it("a failure gives the button back", async () => {
    state.subscribe.mockResolvedValue({ ok: false });
    route();

    fireEvent.click(button("subscribe"));
    expect(phase()).toBe("busy");
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(phase()).toBe("idle");
    expect(button("subscribe").disabled).toBe(false);
  });
});
