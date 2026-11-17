import { getMessages } from "@homi/i18n";
import type { SearchFilters } from "@homi/search";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SubscribeResult } from "@/features/radars/subscribe";
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
  subscribe: vi.fn<(filters: SearchFilters, entry: string, relaxed?: string | null) => Promise<SubscribeResult>>(),
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
vi.mock("@/features/radars/subscribe", () => ({
  subscribe: (filters: SearchFilters, entry: string, relaxed?: string | null) => state.subscribe(filters, entry, relaxed),
  useHasActiveRadar: () => false,
}));

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
});

afterEach(() => {
  cleanup();
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
  it("subscribes the draft from the filters entry; on success the sheet closes without applying", async () => {
    let resolve: (result: SubscribeResult) => void = () => undefined;
    state.subscribe.mockReturnValue(new Promise((done) => (resolve = done)));
    state.search = "city=tashkent&rooms_min=2";
    route();

    fireEvent.click(button("subscribe"));
    expect(state.subscribe).toHaveBeenCalledWith(expect.objectContaining({ rooms_min: 2 }), "filters", null);
    expect(button("subscribe").disabled).toBe(true);
    fireEvent.click(button("subscribe"));
    expect(state.subscribe).toHaveBeenCalledTimes(1);

    await act(async () => resolve({ ok: true }));
    expect(state.back).toHaveBeenCalledTimes(1);
    expect(state.closeThen).not.toHaveBeenCalled();
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
