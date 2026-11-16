import { getMessages } from "@homi/i18n";
import { defaultFilters, toSearchParams } from "@homi/search";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Activity, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/actions/run";
import type { LocationResult } from "@/lib/telegram/location";

const state = vi.hoisted(() => ({
  status: "ready" as string,
  log: [] as string[],
  patchMe: vi.fn(),
  updateSettings: vi.fn<(input: unknown, auth?: unknown, locale?: string) => Promise<ActionResult<unknown>>>(),
  located: false,
  get: vi.fn<() => Promise<LocationResult>>(),
  impact: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: state.status, patchMe: state.patchMe }) }));
vi.mock("@/lib/actions/settings", () => ({ updateSettings: state.updateSettings }));
vi.mock("@/lib/telegram", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telegram")>()),
  tg: {
    location: { available: () => state.located, get: () => state.get() },
    haptic: { impact: state.impact, success: state.success, error: state.error },
  },
}));
vi.mock("@/lib/storage", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/storage")>();
  return {
    ...original,
    storageSet: vi.fn((key: string, value: string | null) => {
      state.log.push(`storage ${key}=${value}`);
      original.storageSet(key as Parameters<typeof original.storageSet>[0], value);
    }),
  };
});
vi.mock("@homi/search", async (importOriginal) => {
  const original = await importOriginal<typeof import("@homi/search")>();
  return {
    ...original,
    pickCity: vi.fn((...args: Parameters<typeof original.pickCity>) => {
      state.log.push("pickCity");
      return original.pickCity(...args);
    }),
  };
});

import { pickCity } from "@homi/search";

import Page from "@/app/[locale]/welcome/city/page";
import { publishBootRetry, resetBootRetry, setBootRetryHandler } from "@/features/gates/bootRetryStore";
import { gateState, resetGateState } from "@/features/gates/gateState";
import { WelcomeCity } from "@/features/gates/WelcomeCity";
import { EMPTY_REFERENCE } from "@/lib/reference/empty";
import type { City, CityStats } from "@/lib/reference/types";
import { resetReference, setReference } from "@/lib/reference/useReference";
import { storageGet } from "@/lib/storage";
import { currentToast, dismissToast } from "@/lib/ui/toast";

function city(code: string, name: string, center: { lat: number; lon: number }, extra: Partial<City> = {}): City {
  return { code, name, center, zoom: 12, is_region: false, has_metro: false, has_median: false, districts: [], zones: [], ...extra };
}

/** The three cities of the stub reference data (`default.ru.json`). */
const CITIES: City[] = [
  city("tashkent", "Ташкент", { lat: 41.3111, lon: 69.2797 }, { has_metro: true, has_median: true, districts: [{ code: "chilonzor", name: "Чиланзар" }] }),
  city("tashkent_region", "Ташкентская область", { lat: 41.2213, lon: 69.8597 }, { zoom: 9, is_region: true }),
  city("andijan", "Андижан", { lat: 40.7821, lon: 72.3442 }),
];
const STATS: CityStats[] = [
  { code: "tashkent", counts: { rent_long: 4120, rent_daily: 310, sale: 2890 }, price_presets: {}, typical_price: {} },
];

const SAVED: ActionResult<unknown> = { ok: true, data: { city: "andijan" }, meta: {} };
const REFUSED: ActionResult<unknown> = { ok: false, error: "server", status: 500, method: "PATCH", path: "settings" };

function ru(children: ReactNode) {
  return (
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      {children}
    </NextIntlClientProvider>
  );
}

const row = (code: string) => document.querySelector<HTMLButtonElement>(`[data-city="${code}"]`)!;

beforeEach(() => {
  state.status = "ready";
  state.located = false;
  state.log.length = 0;
  state.get.mockReset();
  state.updateSettings.mockReset();
  state.updateSettings.mockImplementation(async () => {
    state.log.push("updateSettings");
    return SAVED;
  });
  state.patchMe.mockImplementation(() => {
    state.log.push(`patchMe cityPicked=${gateState.cityPicked} returnTo=${gateState.returnTo}`);
  });
  setReference({
    reference: { loaded: true, data: { ...EMPTY_REFERENCE, cities: CITIES } },
    cities: { loaded: true, data: STATS },
  });
});

afterEach(() => {
  cleanup();
  resetReference();
  resetGateState();
  resetBootRetry();
  dismissToast("app");
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("WelcomeCity (SCR-005)", () => {
  it("blocks with «Где ищете жильё?» over the city rows: no ×, no checkmark, nothing but the rows to tap", () => {
    render(ru(<Page />));

    const main = document.querySelector('main[data-route="welcome/city"]')!;
    expect(main.querySelector("h1")!.textContent).toBe("Где ищете жильё?");
    const buttons = [...main.querySelectorAll("button")];
    expect(buttons.map((button) => button.dataset.city)).toEqual(["tashkent", "tashkent_region", "andijan"]);
    expect(main.querySelector('[aria-label="Закрыть"]')).toBeNull();
    expect(main.querySelector("[aria-pressed]")).toBeNull();
    expect(main.querySelector("svg")).toBeNull();
    expect(row("tashkent").textContent).toContain("4120 аренда · 2890 продажа");
    expect(row("andijan").textContent).toBe("Андижан");
  });

  it("offers the location row when the adapter can ask for a position", () => {
    state.located = true;
    render(ru(<WelcomeCity />));

    expect(document.querySelector('[data-row="locate"]')!.textContent).toContain("Определить по геопозиции");
  });

  it("a pick runs the chain in order: pickCity on the defaults, the save, homi-city, the gate memory, patchMe", () => {
    render(ru(<WelcomeCity />));

    fireEvent.click(row("andijan"));

    const andijan = CITIES[2];
    expect(pickCity).toHaveBeenCalledExactlyOnceWith(defaultFilters(), andijan);
    expect(state.updateSettings).toHaveBeenCalledExactlyOnceWith({ city: "andijan" }, undefined, "ru");
    expect(storageGet("homi-city")).toBe("andijan");
    expect(gateState.cityPicked).toBe(true);
    expect(gateState.returnTo).toBe("/?city=andijan");
    expect(state.patchMe).toHaveBeenCalledExactlyOnceWith({ city: "andijan", city_chosen: true });
    expect(state.log).toEqual([
      "pickCity",
      "updateSettings",
      "storage homi-city=andijan",
      "patchMe cityPicked=true returnTo=/?city=andijan",
    ]);
    expect(state.impact).toHaveBeenCalledTimes(1);
  });

  it("the return address is the feed with the picked city's search state (BR-APP-009 on the defaults)", () => {
    render(ru(<WelcomeCity />));

    fireEvent.click(row("tashkent_region"));

    expect(gateState.returnTo).toBe(`/?${toSearchParams(pickCity(defaultFilters(), CITIES[1])).toString()}`);
    expect(gateState.returnTo).toBe("/?city=tashkent_region");
  });

  it("takes one pick: a double tap, or a second row before the gate leaves, changes nothing", () => {
    render(ru(<WelcomeCity />));

    fireEvent.click(row("andijan"));
    fireEvent.click(row("andijan"));
    fireEvent.click(row("tashkent"));

    expect(state.updateSettings).toHaveBeenCalledExactlyOnceWith({ city: "andijan" }, undefined, "ru");
    expect(state.patchMe).toHaveBeenCalledExactlyOnceWith({ city: "andijan", city_chosen: true });
    expect(gateState.returnTo).toBe("/?city=andijan");
    expect(storageGet("homi-city")).toBe("andijan");
  });

  it("takes a pick again once the page is shown again after it was hidden", () => {
    const tree = (mode: "visible" | "hidden") =>
      ru(
        <Activity mode={mode}>
          <WelcomeCity />
        </Activity>,
      );
    const view = render(tree("visible"));

    fireEvent.click(row("andijan"));
    view.rerender(tree("hidden"));
    view.rerender(tree("visible"));
    fireEvent.click(row("tashkent"));

    expect(state.patchMe.mock.calls).toEqual([[{ city: "andijan", city_chosen: true }], [{ city: "tashkent", city_chosen: true }]]);
    expect(gateState.returnTo).toBe("/?city=tashkent");
  });

  it("the title takes the focus when the list shows", () => {
    state.status = "booting";
    const view = render(ru(<WelcomeCity />));
    expect(document.activeElement).toBe(document.body);

    state.status = "ready";
    view.rerender(ru(<WelcomeCity />));
    const title = document.querySelector("h1")!;
    expect(title.textContent).toBe("Где ищете жильё?");
    expect(document.activeElement).toBe(title);
    expect(title.tabIndex).toBe(-1);
  });

  it("does not wait for the save, and ignores its failure", async () => {
    let settle!: (result: ActionResult<unknown>) => void;
    state.updateSettings.mockReturnValue(
      new Promise((done) => {
        settle = done;
      }),
    );
    render(ru(<WelcomeCity />));

    fireEvent.click(row("andijan"));
    expect(state.patchMe).toHaveBeenCalledExactlyOnceWith({ city: "andijan", city_chosen: true });

    await act(async () => settle(REFUSED));
    expect(state.error).not.toHaveBeenCalled();
    expect(currentToast()).toBeNull();
    expect(gateState.cityPicked).toBe(true);
  });

  it("a located city is picked at once with the success haptic", async () => {
    state.located = true;
    state.get.mockResolvedValue({ lat: 40.79, lon: 72.35, accuracy: 30 });
    render(ru(<WelcomeCity />));

    await act(async () => {
      fireEvent.click(document.querySelector('[data-row="locate"]')!);
    });

    expect(state.success).toHaveBeenCalledTimes(1);
    expect(state.patchMe).toHaveBeenCalledExactlyOnceWith({ city: "andijan", city_chosen: true });
    expect(gateState.returnTo).toBe("/?city=andijan");
  });

  it("a position that arrives after the page was left picks nothing (CityList drops it)", async () => {
    state.located = true;
    let answer!: (result: LocationResult) => void;
    state.get.mockReturnValue(
      new Promise((done) => {
        answer = done;
      }),
    );
    const view = render(ru(<WelcomeCity />));

    await act(async () => {
      fireEvent.click(document.querySelector('[data-row="locate"]')!);
    });
    view.unmount();
    await act(async () => answer({ lat: 40.79, lon: 72.35, accuracy: 30 }));

    expect(state.updateSettings).not.toHaveBeenCalled();
    expect(state.patchMe).not.toHaveBeenCalled();
    expect(gateState.cityPicked).toBe(false);
    expect(storageGet("homi-city")).toBeNull();
  });

  it("waits quietly while the session is not ready, and shows ErrorState after the boot retry gave up", () => {
    state.status = "booting";
    const retry = vi.fn();
    setBootRetryHandler(retry);
    render(ru(<Page />));

    const main = document.querySelector('main[data-route="welcome/city"]')!;
    expect(main.querySelector("[data-city]")).toBeNull();
    expect(main.querySelector('[data-gate-wait][aria-busy="true"]')).not.toBeNull();

    act(() => publishBootRetry({ failed: true, kind: "server", checking: false }));
    const error = main.querySelector('[data-slot="error-state"]')!;
    expect(error.textContent).toContain("Не загрузилось");
    fireEvent.click(error.querySelector("button")!);
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
