import { getMessages } from "@homi/i18n";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Activity, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LocationResult } from "@/lib/telegram/location";

const adapter = vi.hoisted(() => ({
  available: vi.fn(() => true),
  get: vi.fn<() => Promise<LocationResult>>(),
  impact: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/telegram", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telegram")>()),
  tg: {
    location: { available: () => adapter.available(), get: () => adapter.get() },
    haptic: { impact: adapter.impact, success: adapter.success, error: adapter.error },
  },
}));

import { CityList, type CityListProps } from "@/features/city/CityList";
import { LOCATION_TIMEOUT_MS } from "@/lib/telegram";

import { withDevFlags } from "../helpers/flags";

/** The stub reference cities (`default.ru.json`) and the counts of `cities/default.json` for two of them. */
const CITIES: CityListProps["cities"] = [
  { code: "tashkent", name: "Ташкент", center: { lat: 41.3111, lon: 69.2797 }, is_region: false },
  { code: "tashkent_region", name: "Ташкентская область", center: { lat: 41.2213, lon: 69.8597 }, is_region: true },
  { code: "andijan", name: "Андижан", center: { lat: 40.7821, lon: 72.3442 }, is_region: false },
];
const STATS: CityListProps["stats"] = {
  tashkent: { counts: { rent_long: 4120, rent_daily: 310, sale: 2890 } },
  tashkent_region: { counts: { rent_long: 640, rent_daily: 25, sale: 410 } },
};
const NEAR_TASHKENT = { lat: 41.32, lon: 69.28, accuracy: 20 };
const MOSCOW = { lat: 55.7558, lon: 37.6173, accuracy: 20 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function ru(children: ReactNode) {
  return (
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      {children}
    </NextIntlClientProvider>
  );
}

function list(props: Partial<CityListProps> = {}) {
  const onPick = props.onPick ?? vi.fn();
  const view = render(ru(<CityList cities={CITIES} stats={STATS} onPick={onPick} {...props} />));
  return { ...view, onPick };
}

const locateRow = () => document.querySelector<HTMLButtonElement>('[data-row="locate"]');
const row = (code: string) => document.querySelector<HTMLButtonElement>(`[data-city="${code}"]`)!;
const lineOf = (code: string) => row(code).querySelector("b + span")?.textContent ?? null;
/** The error under the row's label, as the eye reads it. */
const locateError = () => locateRow()?.querySelector("b + span")?.textContent ?? "";
/** The status line beside the row, which a screen reader announces. */
const locateStatus = () => document.querySelector('[data-locate-status][role="status"]')?.textContent ?? "";
const locating = () => locateRow()!.getAttribute("aria-disabled") === "true";

/** Taps «Определить по геопозиции» and lets the adapter's answer arrive. */
async function locate() {
  await act(async () => {
    fireEvent.click(locateRow()!);
  });
}

beforeEach(() => {
  adapter.available.mockReturnValue(true);
  adapter.get.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("CityList rows (SCR-005, SCR-017)", () => {
  it("shows the server name and «{rent} аренда · {sale} продажа» when the city has stats (LB-APP-035)", () => {
    list();

    expect([...document.querySelectorAll("[data-city] b")].map((name) => name.textContent)).toEqual([
      "Ташкент",
      "Ташкентская область",
      "Андижан",
    ]);
    expect(lineOf("tashkent")).toBe("4120 аренда · 2890 продажа");
    expect(lineOf("tashkent_region")).toBe("640 аренда · 410 продажа");
    expect(lineOf("andijan")).toBeNull();
  });

  it("goes without the count line while the stats load or after they failed", () => {
    list({ stats: null });

    for (const city of CITIES) {
      expect(lineOf(city.code)).toBeNull();
    }
  });

  it("with DEV-023 the line includes daily rent (city.countsDaily)", () => {
    withDevFlags({ dev023CityCountsIncludeDaily: true }, (flags) => list({ flags }));

    expect(lineOf("tashkent")).toBe("4120 аренда · 310 посуточно · 2890 продажа");
    expect(lineOf("andijan")).toBeNull();
  });

  it("a row tap gives a light haptic and picks the city", () => {
    const { onPick } = list();

    fireEvent.click(row("andijan"));

    expect(adapter.impact).toHaveBeenCalledTimes(1);
    expect(adapter.impact).toHaveBeenCalledWith();
    expect(onPick).toHaveBeenCalledExactlyOnceWith("andijan");
  });

  it("marks the current city only with showCheck", () => {
    const view = list({ current: "andijan" });
    expect(row("andijan").getAttribute("aria-pressed")).toBeNull();
    expect(row("andijan").querySelector("svg")).toBeNull();

    view.unmount();
    list({ current: "andijan", showCheck: true });
    expect(row("andijan").getAttribute("aria-pressed")).toBe("true");
    expect(row("andijan").querySelector("svg")).not.toBeNull();
    expect(row("tashkent").getAttribute("aria-pressed")).toBe("false");
    expect(row("tashkent").querySelector("svg")).toBeNull();
  });
});

describe("CityList location row (TMA-035, BR-APP-056)", () => {
  it("is absent when the adapter cannot ask for a position, or without showLocate", () => {
    adapter.available.mockReturnValue(false);
    const view = list({ showLocate: true });
    expect(locateRow()).toBeNull();

    view.unmount();
    adapter.available.mockReturnValue(true);
    list();
    expect(locateRow()).toBeNull();
  });

  it("says «Определяем…» with a spinner, disabled, while the position is on its way; a second tap asks nothing", async () => {
    const answer = deferred<LocationResult>();
    adapter.get.mockReturnValue(answer.promise);
    list({ showLocate: true });
    expect(locateRow()!.textContent).toContain("Определить по геопозиции");
    expect(locateStatus()).toBe("");

    locateRow()!.focus();
    await locate();
    expect(adapter.impact).toHaveBeenCalledTimes(1);
    expect(locating()).toBe(true);
    expect(locateRow()!.querySelector("b")!.textContent).toBe("Определяем…");
    expect(locateRow()!.querySelector('[data-slot="spinner"]')).not.toBeNull();
    expect(locateStatus()).toBe("Определяем…");
    // `aria-disabled`, not `disabled`: the focus of the tap stays on the row.
    expect(locateRow()!.disabled).toBe(false);
    expect(document.activeElement).toBe(locateRow());

    await locate();
    expect(adapter.get).toHaveBeenCalledTimes(1);

    await act(async () => answer.resolve("fail"));
    expect(locating()).toBe(false);
    expect(locateRow()!.querySelector('[data-slot="spinner"]')).toBeNull();
  });

  it("announces through a status line beside the row, which describes it; the text inside the row is not read twice", async () => {
    adapter.get.mockResolvedValue("denied");
    list({ showLocate: true });

    await locate();

    const status = document.querySelector('[data-locate-status][role="status"]')!;
    expect(locateRow()!.contains(status)).toBe(false);
    expect(locateRow()!.getAttribute("aria-describedby")).toBe(status.id);
    expect(locateStatus()).toBe(locateError());
    expect(locateRow()!.querySelector("[aria-live]")).toBeNull();
    expect(locateRow()!.querySelector("[data-locate-error]")!.getAttribute("aria-hidden")).toBe("true");
  });

  it.each([
    ["denied", "Нет доступа к геопозиции — выберите город из списка. Разрешить можно в настройках Telegram."],
    ["fail", "Не получилось определить, где вы, — выберите город из списка."],
  ] as const)("%s → its text under the row, no pick, the row can be tapped again", async (result, text) => {
    adapter.get.mockResolvedValue(result);
    const { onPick } = list({ showLocate: true });

    await locate();

    expect(locateError()).toBe(text);
    expect(locateStatus()).toBe(text);
    expect(locateRow()!.querySelector("b")!.textContent).toBe("Определить по геопозиции");
    expect(locating()).toBe(false);
    expect(onPick).not.toHaveBeenCalled();
    expect(adapter.success).not.toHaveBeenCalled();
  });

  it("an adapter that throws counts as a failure", async () => {
    adapter.get.mockImplementation(() => {
      throw new Error("no location");
    });
    list({ showLocate: true });

    await locate();

    expect(locateError()).toBe("Не получилось определить, где вы, — выберите город из списка.");
  });

  it("nothing after 12 s → city.locateFail", async () => {
    vi.useFakeTimers();
    adapter.get.mockReturnValue(new Promise<LocationResult>(() => undefined));
    const { onPick } = list({ showLocate: true });

    await locate();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOCATION_TIMEOUT_MS - 1);
    });
    expect(locating()).toBe(true);
    expect(locateError()).toBe("");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(locating()).toBe(false);
    expect(locateError()).toBe("Не получилось определить, где вы, — выберите город из списка.");
    expect(onPick).not.toHaveBeenCalled();
    expect(LOCATION_TIMEOUT_MS).toBe(12_000);
  });

  it("no city in range → city.locateFar", async () => {
    adapter.get.mockResolvedValue(MOSCOW);
    const { onPick } = list({ showLocate: true });

    await locate();

    expect(locateError()).toBe("Рядом с вами наших городов пока нет — выберите из списка.");
    expect(onPick).not.toHaveBeenCalled();
  });

  it("found → success haptic and the nearest city is picked at once", async () => {
    adapter.get.mockResolvedValue(NEAR_TASHKENT);
    const { onPick } = list({ showLocate: true });

    await locate();

    expect(adapter.success).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledExactlyOnceWith("tashkent");
    expect(locateError()).toBe("");
  });

  it("a new attempt clears the previous text", async () => {
    adapter.get.mockResolvedValueOnce("denied").mockReturnValueOnce(new Promise<LocationResult>(() => undefined));
    list({ showLocate: true });

    await locate();
    expect(locateError()).not.toBe("");

    await locate();
    expect(locateError()).toBe("");
    expect(adapter.impact).toHaveBeenCalledTimes(2);
  });

  it("drops a position that arrives after the list was unmounted", async () => {
    const answer = deferred<LocationResult>();
    adapter.get.mockReturnValue(answer.promise);
    const { onPick, unmount } = list({ showLocate: true });

    await locate();
    unmount();
    await act(async () => answer.resolve(NEAR_TASHKENT));

    expect(onPick).not.toHaveBeenCalled();
    expect(adapter.success).not.toHaveBeenCalled();
  });

  it("drops a position that arrives while the route is hidden, and is not stuck locating when shown again", async () => {
    const answer = deferred<LocationResult>();
    adapter.get.mockReturnValue(answer.promise);
    const onPick = vi.fn();
    const tree = (mode: "visible" | "hidden") =>
      ru(
        <Activity mode={mode}>
          <CityList cities={CITIES} stats={STATS} showLocate onPick={onPick} />
        </Activity>,
      );
    const view = render(tree("visible"));

    await locate();
    view.rerender(tree("hidden"));
    await act(async () => answer.resolve(NEAR_TASHKENT));
    view.rerender(tree("visible"));

    expect(onPick).not.toHaveBeenCalled();
    expect(locating()).toBe(false);
    expect(locateRow()!.querySelector("b")!.textContent).toBe("Определить по геопозиции");
  });

  it("a row tapped while locating wins: the later position picks nothing", async () => {
    const answer = deferred<LocationResult>();
    adapter.get.mockReturnValue(answer.promise);
    const { onPick } = list({ showLocate: true });

    await locate();
    fireEvent.click(row("andijan"));
    await act(async () => answer.resolve(NEAR_TASHKENT));

    expect(onPick).toHaveBeenCalledExactlyOnceWith("andijan");
    expect(adapter.success).not.toHaveBeenCalled();
    expect(locating()).toBe(false);
  });

  it("reads the cities of the latest render when the position arrives", async () => {
    const answer = deferred<LocationResult>();
    adapter.get.mockReturnValue(answer.promise);
    const onPick = vi.fn();
    const view = render(ru(<CityList cities={[CITIES[2]]} stats={null} showLocate onPick={onPick} />));

    await locate();
    view.rerender(ru(<CityList cities={CITIES} stats={null} showLocate onPick={onPick} />));
    await act(async () => answer.resolve(NEAR_TASHKENT));

    expect(onPick).toHaveBeenCalledExactlyOnceWith("tashkent");
  });
});
