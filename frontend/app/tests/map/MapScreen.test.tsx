import { getMessages } from "@homi/i18n";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Activity, type ActivityProps, createElement, type ReactNode, StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MapPoint, MapViewProps, Selection } from "@/features/map/types";
import type { BffOptions } from "@/lib/api/browser";
import type { ApiResult } from "@/lib/api/types";
import type { LocationResult } from "@/lib/telegram/location";

type Answer = ApiResult<{ points: MapPoint[]; total?: number; with_point?: number }>;

/** One `bffFetch` the screen sent; the test answers it when it wants. */
interface Sent {
  path: string;
  query: URLSearchParams;
  signal: AbortSignal;
  resolve: (answer: Answer) => void;
}

const state = vi.hoisted(() => ({
  sent: [] as Sent[],
  status: "ready",
  /** The locale-less address the screen is mounted at, and its query. */
  pathname: "/map",
  search: "city=tashkent",
  /** What the two WebGL2 probes of the engine rule answer. */
  webgl2: true,
  reportError: vi.fn(),
  impact: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  openLink: vi.fn(),
  applyFilters: vi.fn(() => Promise.resolve()),
  locationAvailable: vi.fn(),
  getLocation: vi.fn<() => Promise<LocationResult>>(),
  cardLayer: vi.fn(),
  /** The stub view: its latest props and how often its mount effect ran. */
  view: { props: null as MapViewProps | null, mounts: 0 },
  /** The stub Leaflet view (WP-28). */
  leaflet: { props: null as MapViewProps | null, mounts: 0 },
  /** The stub GL view throws while rendering (WP-37). */
  viewThrows: false,
}));
vi.mock("@/lib/api/browser", () => ({
  bffFetch: (path: string, options: BffOptions) =>
    new Promise<Answer>((resolve) => {
      state.sent.push({ path, query: options.query as URLSearchParams, signal: options.signal!, resolve });
    }),
}));
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: vi.fn(), reauthenticate: vi.fn() }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: state.status, me: null, renewed: false }) }));
vi.mock("@/lib/navigation/nav", () => ({ nav: { push: vi.fn(), replace: vi.fn(), tab: vi.fn(), back: vi.fn() } }));
vi.mock("next/navigation", () => ({
  usePathname: () => `/ru${state.pathname}`,
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@/lib/telegram", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/telegram")>();
  return {
    ...original,
    tg: {
      ...original.tg,
      haptic: { impact: state.impact, success: state.success, error: state.error },
      openLink: state.openLink,
      location: { available: state.locationAvailable, get: state.getLocation },
    },
  };
});
vi.mock("@/lib/deeplinks/launch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/deeplinks/launch")>()),
  launchMapOptions: () => ({ override: null, debug: false }),
}));
vi.mock("@/lib/errors/report", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/errors/report")>()),
  reportError: state.reportError,
}));
vi.mock("@/features/map/gl/library", () => ({ loadMapLibre: vi.fn() }));
/** The views the screen loads with `next/dynamic`: they only expose the props they are given (WP-27 step 5). */
vi.mock("@/features/map/gl/MapViewGL", async () => {
  const { useEffect } = await import("react");
  return {
    default: function StubView(props: MapViewProps) {
      if (state.viewThrows) {
        throw new Error("view render");
      }
      state.view.props = props;
      useEffect(() => {
        state.view.mounts += 1;
      }, []);
      return <div data-map-view="stub" />;
    },
  };
});
vi.mock("@/features/map/leaflet/library", () => ({ loadLeaflet: vi.fn() }));
vi.mock("@/features/map/leaflet/MapViewLeaflet", async () => {
  const { useEffect } = await import("react");
  return {
    default: function StubLeafletView(props: MapViewProps) {
      state.leaflet.props = props;
      useEffect(() => {
        state.leaflet.mounts += 1;
      }, []);
      return <div data-map-view="stub-leaflet" />;
    },
  };
});
vi.mock("@/features/map/MapSelectionCard", () => ({
  MapSelectionCard: ({ selection, onIndex, onClose }: { selection: NonNullable<Selection>; onIndex: (at: number) => void; onClose: () => void }) => (
    <div data-map-card="" data-numbers={selection.numbers.join(",")} data-at={selection.at}>
      <button type="button" data-card-swipe="" onClick={() => onIndex(1)} />
      <button type="button" data-card-close="" onClick={onClose} />
    </div>
  ),
}));
vi.mock("@/features/map/useCardLayer", () => ({
  useCardLayer: (selection: Selection, close: () => void) => state.cardLayer(selection, close),
}));
vi.mock("@/features/filters/applyFilters", () => ({ applyFilters: state.applyFilters }));

import { resetEngineForTests } from "@/features/map/engine";
import { LOCATE_NOTE_MS, MapScreen, NOTE_MS } from "@/features/map/MapScreen";
import { hide, resetSessionMaps } from "@/lib/data/sessionMaps";
import { reportSource, resetSources, useHasStubData } from "@/lib/data/sources";
import { pushEntry, resetDepth } from "@/lib/navigation/history";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { resetReference } from "@/lib/reference/useReference";
import { searchRules } from "@/lib/search/rules";
import { areaTooSmall, consumeDrawRequest, requestDraw, setAreaTooSmall } from "@/lib/ui/shellState";

import { cityOf, feedReference } from "../helpers/reference";

function point(number: number, lat = 41.3111, lon = 69.2797, usd = 500): MapPoint {
  return { number, lat, lon, label: `$${usd}`, tone: null, priced: true, usd };
}

function answered(points: MapPoint[], total?: number): Answer {
  return { ok: true, data: total === undefined ? { points } : { points, total }, meta: { source: "stub" } };
}

const failed = (error: "server" | "offline", status: number): Answer => ({ ok: false, error, status, method: "GET", path: "listings/map" });

/** The address the screen is mounted at: `path` with `query`. */
const at = (path: string, query: string) => {
  state.pathname = path;
  state.search = query;
};

const intl = (children: ReactNode) => (
  <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
    {children}
  </NextIntlClientProvider>
);

/** Renders `tree` and lets the view's chunk load. */
async function mount(tree: () => ReactNode = () => <MapScreen />) {
  const view = render(intl(tree()));
  await act(() => vi.dynamicImportSettled());
  return { ...view, rerender: (next: ReactNode = tree()) => view.rerender(intl(next)) };
}

const answer = (index: number, value: Answer) => act(async () => state.sent[index].resolve(value));
const props = () => state.view.props!;
const select = (numbers: number[], at?: number) => act(() => props().onSelect(numbers, at));
const card = () => document.querySelector<HTMLElement>("[data-map-card]");
const pill = () => document.querySelector<HTMLElement>("[data-map-status]");
const note = () => document.querySelector("[data-map-note]")?.textContent ?? null;
const locateButton = () => document.querySelector<HTMLButtonElement>("[data-map-locate]");
const attribution = () => document.querySelector<HTMLElement>("[data-map-attribution]");

beforeEach(() => {
  state.sent.length = 0;
  state.status = "ready";
  state.webgl2 = true;
  state.view = { props: null, mounts: 0 };
  state.leaflet = { props: null, mounts: 0 };
  state.viewThrows = false;
  at("/map", "city=tashkent");
  for (const mock of [
    state.reportError,
    state.impact,
    state.success,
    state.error,
    state.openLink,
    state.locationAvailable,
    state.getLocation,
    state.cardLayer,
    state.applyFilters,
  ]) {
    mock.mockReset();
  }
  state.applyFilters.mockResolvedValue(undefined);
  state.locationAvailable.mockReturnValue(true);
  state.openLink.mockReturnValue(true);
  for (const mock of Object.values(nav)) {
    vi.mocked(mock).mockReset();
  }
  const context = { getExtension: () => ({ loseContext: () => undefined }) };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(((type: string) =>
    state.webgl2 && type === "webgl2" ? context : null) as never);
  resetEngineForTests();
  window.localStorage.clear();
  document.documentElement.dataset.scheme = "light";
  document.documentElement.classList.remove("lite");
  feedReference({});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetEngineForTests();
  resetSessionMaps();
  resetReference();
  consumeDrawRequest();
  setAreaTooSmall(false);
  resetDepth("/");
  resetSources();
  window.history.replaceState(null, "", "/");
});

describe("MapScreen: the engine (`03` §1.8, LB-APP-019)", () => {
  it("the server renders the centred spinner; the browser picks GL and renders the view with the screen's inputs", async () => {
    const html = renderToString(intl(<MapScreen />));
    expect(html).toContain("data-map-engine-loading");
    expect(html).not.toContain("data-map-view");

    await mount();

    expect(document.querySelector("[data-map-view]")).not.toBeNull();
    expect(document.querySelector("[data-map-engine-loading]")).toBeNull();
    expect(props()).toMatchObject({
      groups: [],
      responseId: 0,
      selection: null,
      polygon: null,
      cityView: { center: [41.3111, 69.2797], zoom: 12 },
      cityKnown: true,
      tiles: null,
      locale: "ru",
      scheme: "light",
      lite: false,
      me: null,
      drawing: false,
    });
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].path).toBe("listings/map");
  });

  it("a failure of the view moves the session to Leaflet: reported once, and the next mount does not try GL", async () => {
    const first = await mount();
    act(() => props().onFail("webgl"));
    await act(() => vi.dynamicImportSettled());

    expect(document.querySelector('[data-map-view="stub-leaflet"]')).not.toBeNull();
    expect(document.querySelector('[data-map-view="stub"]')).toBeNull();

    first.unmount();
    state.view.mounts = 0;
    await mount();

    expect(document.querySelector('[data-map-view="stub-leaflet"]')).not.toBeNull();
    expect(state.view.mounts).toBe(0);
    expect(state.reportError).toHaveBeenCalledTimes(1);
    expect(state.reportError.mock.calls[0][0]).toEqual(new Error("map_gl_failed"));
    expect(state.reportError.mock.calls[0][1]).toMatchObject({ kind: "error", reason: "webgl" });
    // The points are the screen's: one read per mount of the screen, whichever view draws them.
    expect(state.sent).toHaveLength(2);
    // Not drawing: nothing to close.
    expect(nav.back).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("without WebGL2 the rule picks Leaflet: it gets the same props, and the points are asked for", async () => {
    state.webgl2 = false;
    at("/map", "city=tashkent&rooms_min=2");
    await mount();
    await act(() => vi.dynamicImportSettled());

    expect(state.leaflet.mounts).toBe(1);
    expect(state.view.mounts).toBe(0);
    expect(state.leaflet.props).toMatchObject({ polygon: null, cityKnown: true, tiles: null, drawing: false });
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].path).toBe("listings/map");
    expect(screen.queryByText("Карта на этом устройстве пока недоступна")).toBeNull();
  });

  it("a view that throws while rendering stays in the map: «Не загрузилось» with «Повторить», reported as `render`; «Повторить» remounts it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.viewThrows = true;
    await mount();

    expect(document.querySelector("[data-map-screen]")).not.toBeNull();
    expect(document.querySelector("[data-map-view]")).toBeNull();
    expect(document.querySelectorAll("[data-map-status]")).toHaveLength(1);
    expect(pill()?.dataset.mapStatus).toBe("error");
    expect(pill()?.textContent).toContain("Не загрузилось");
    expect(state.reportError).toHaveBeenCalledTimes(1);
    expect(state.reportError.mock.calls[0]?.[1]).toMatchObject({ kind: "render" });

    state.viewThrows = false;
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    await act(() => vi.dynamicImportSettled());

    expect(state.impact).toHaveBeenCalledWith("light");
    expect(document.querySelector('[data-map-view="stub"]')).not.toBeNull();
    expect(state.view.mounts).toBe(1);
    expect(document.querySelector('[data-map-status="error"]')).toBeNull();
  });

  it("a Leaflet failure shows the error pill; «Повторить» mounts the view anew", async () => {
    state.webgl2 = false;
    await mount();
    await act(() => vi.dynamicImportSettled());
    act(() => state.leaflet.props?.onFail("chunk"));

    const pill = document.querySelector('[data-map-status="error"]');
    expect(pill).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    await act(() => vi.dynamicImportSettled());

    expect(state.leaflet.mounts).toBe(2);
    expect(state.reportError).not.toHaveBeenCalled();
  });
});

describe("MapScreen: the pills (SCR-011, LB-APP-044, LB-APP-008)", () => {
  it("a spinner named «Загружаем объявления…» while the points load, then «Ничего не найдено в этой области»", async () => {
    await mount();
    expect(pill()?.dataset.mapStatus).toBe("loading");
    expect(screen.getByRole("status", { name: "Загружаем объявления…" })).toBeTruthy();

    await answer(0, answered([], 0));

    expect(pill()?.dataset.mapStatus).toBe("empty");
    expect(pill()?.textContent).toBe("Ничего не найдено в этой области");
  });

  it("a server error shows «Не загрузилось» with «Повторить», which asks again; the answer draws without a pill", async () => {
    await mount();
    await answer(0, failed("server", 500));

    expect(pill()?.dataset).toMatchObject({ mapStatus: "error", error: "server" });
    expect(pill()?.textContent).toContain("Не загрузилось");
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(state.sent).toHaveLength(2);
    expect(pill()?.dataset.mapStatus).toBe("loading");

    await answer(1, answered([point(1)]));
    expect(pill()).toBeNull();
    expect(props().groups.map((group) => group.key)).toHaveLength(1);
    expect(props().responseId).toBe(1);
  });

  it("offline shows «Нет связи» with «Повторить»", async () => {
    await mount();
    await answer(0, failed("offline", 0));

    expect(pill()?.dataset).toMatchObject({ mapStatus: "error", error: "offline" });
    expect(pill()?.textContent).toContain("Нет связи");
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(state.sent).toHaveLength(2);
  });

  it("asks for nothing until the session is ready", async () => {
    state.status = "booting";
    const view = await mount();
    expect(state.sent).toHaveLength(0);

    state.status = "ready";
    view.rerender();
    expect(state.sent).toHaveLength(1);
  });
});

describe("MapScreen: the note (BR-APP-062, KV-FE-031)", () => {
  it("«На карте 2 из 5 · у 3 объявлений известен только район» for 6 s after the answer", async () => {
    await mount();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await answer(0, answered([point(1), point(2, 41.32, 69.25)], 5));

    expect(note()).toBe("На карте 2 из 5 · у 3 объявлений известен только район");
    act(() => vi.advanceTimersByTime(NOTE_MS - 1));
    expect(note()).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(note()).toBeNull();
  });

  it("a cut answer: «На карте — 2 самых свежих. Остальные — в списке» for 6 s; cut and missing at once give the cut note only", async () => {
    await mount();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await answer(0, { ok: true, data: { points: [point(1), point(2, 41.32, 69.25)], total: 9, with_point: 6 }, meta: { source: "stub" } });

    expect(note()).toBe("На карте — 2 самых свежих. Остальные — в списке");
    expect(document.querySelectorAll("[data-map-note]")).toHaveLength(1);
    act(() => vi.advanceTimersByTime(NOTE_MS - 1));
    expect(note()).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(note()).toBeNull();
  });

  it("the cut note counts the points shown: a listing hidden in this launch lowers it; the props carry the search as the camera key", async () => {
    await mount();
    await answer(0, { ok: true, data: { points: [point(1), point(2, 41.32, 69.25)], total: 6, with_point: 6 }, meta: { source: "stub" } });
    act(() => hide([2]));

    expect(note()).toBe("На карте — 1 самых свежих. Остальные — в списке");
    expect(props().cameraKey).toBe(String(state.sent[0]?.query));
  });

  it("«N из M» counts the listings without a point beside the points shown, not the hidden ones", async () => {
    await mount();
    await answer(0, { ok: true, data: { points: [point(1), point(2, 41.32, 69.25)], total: 5, with_point: 2 }, meta: { source: "stub" } });
    act(() => hide([2]));

    expect(note()).toBe("На карте 1 из 4 · у 3 объявлений известен только район");
  });

  it("no note when every listing of the search is on the map", async () => {
    await mount();
    await answer(0, answered([point(1)], 1));

    expect(note()).toBeNull();
  });

  it("a locate failure takes the note's place for 5 s: denied, then fail; the counts do not come back", async () => {
    state.getLocation.mockResolvedValueOnce("denied").mockResolvedValueOnce("fail");
    await mount();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await answer(0, answered([point(1)], 3));
    expect(note()).toContain("На карте 1 из 3");

    await act(async () => void fireEvent.click(locateButton()!));
    expect(note()).toBe("Нет доступа к геопозиции. Разрешить можно в настройках Telegram.");
    act(() => vi.advanceTimersByTime(LOCATE_NOTE_MS - 1));
    expect(note()).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(note()).toBeNull();

    await act(async () => void fireEvent.click(locateButton()!));
    expect(note()).toBe("Не получилось определить, где вы.");
    act(() => vi.advanceTimersByTime(LOCATE_NOTE_MS));
    expect(note()).toBeNull();
    expect(state.success).not.toHaveBeenCalled();
  });
});

describe("MapScreen: locate (KV-FE-031, TMA-035)", () => {
  it("a light haptic and a busy button while asking, then the success haptic and `me` for the view; nothing is sent", async () => {
    let found: (result: LocationResult) => void = () => undefined;
    state.getLocation.mockReturnValue(new Promise((resolve) => (found = resolve)));
    await mount();
    await answer(0, answered([point(1)]));
    const button = locateButton()!;
    expect(button.getAttribute("aria-label")).toBe("Где я");

    fireEvent.click(button);
    expect(state.impact).toHaveBeenCalledTimes(1);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(state.getLocation).toHaveBeenCalledTimes(1);

    await act(async () => found({ lat: 41.2, lon: 69.1, accuracy: 30 }));
    expect(state.success).toHaveBeenCalledTimes(1);
    expect(props().me).toEqual({ lat: 41.2, lon: 69.1, accuracy: 30 });
    expect(button.getAttribute("aria-busy")).toBe("false");
    expect(state.sent).toHaveLength(1);
  });

  it("is hidden while a card is open, and when the adapter cannot locate", async () => {
    const view = await mount();
    await answer(0, answered([point(1)]));
    expect(locateButton()).not.toBeNull();

    select([1]);
    expect(locateButton()).toBeNull();
    fireEvent.click(document.querySelector("[data-card-close]")!);
    expect(locateButton()).not.toBeNull();

    view.unmount();
    state.locationAvailable.mockReturnValue(false);
    await mount();
    expect(locateButton()).toBeNull();
  });
});

describe("MapScreen: the selection (SCR-013)", () => {
  it("a pin and a stack select with a light haptic; a spread pin of the open stack only moves the track", async () => {
    await mount();
    await answer(0, answered([point(1), point(4, 41.32), point(5, 41.32), point(6, 41.32)]));

    select([1]);
    expect(state.impact).toHaveBeenCalledTimes(1);
    expect(card()?.dataset).toMatchObject({ numbers: "1", at: "0" });
    select([1]);
    expect(state.impact).toHaveBeenCalledTimes(1);

    select([4, 5, 6]);
    expect(state.impact).toHaveBeenCalledTimes(2);
    expect(card()?.dataset).toMatchObject({ numbers: "4,5,6", at: "0" });
    select([4, 5, 6], 2);
    expect(state.impact).toHaveBeenCalledTimes(2);
    expect(props().selection).toEqual({ numbers: [4, 5, 6], at: 2 });

    fireEvent.click(document.querySelector("[data-card-swipe]")!);
    expect(props().selection).toEqual({ numbers: [4, 5, 6], at: 1 });
    expect(state.impact).toHaveBeenCalledTimes(2);
    expect(state.cardLayer).toHaveBeenLastCalledWith({ numbers: [4, 5, 6], at: 1 }, expect.any(Function));
  });

  it("closes on a background tap and on the card's ×", async () => {
    await mount();
    await answer(0, answered([point(1)]));

    select([1]);
    act(() => props().onBackground());
    expect(card()).toBeNull();
    expect(props().selection).toBeNull();

    select([1]);
    fireEvent.click(document.querySelector("[data-card-close]")!);
    expect(card()).toBeNull();
  });

  it("closes at once on another search, and on a new answer", async () => {
    const view = await mount();
    await answer(0, answered([point(1)]));
    select([1]);

    at("/map", "city=tashkent&rooms_min=2");
    view.rerender();
    expect(card()).toBeNull();
    expect(state.sent).toHaveLength(2);

    select([7]);
    expect(card()).not.toBeNull();
    await answer(1, answered([point(7)]));
    expect(card()).toBeNull();
    expect(props().responseId).toBe(2);
  });

  it("closes when one of its listings is hidden; another hidden listing leaves it open", async () => {
    await mount();
    await answer(0, answered([point(1), point(2), point(3, 41.32)]));
    select([1, 2]);

    act(() => hide([3]));
    expect(card()?.dataset.numbers).toBe("1,2");
    act(() => hide([2]));
    expect(card()).toBeNull();
  });

  it("is cleared when the route is hidden and shown again: the view's effect runs again without a card", async () => {
    const tree = (mode: "visible" | "hidden") => createElement(Activity, { mode } as ActivityProps, <MapScreen />);
    const view = await mount(() => tree("visible"));
    await answer(0, answered([point(1)]));
    select([1]);
    expect(card()).not.toBeNull();
    expect(state.view.mounts).toBe(1);

    view.rerender(tree("hidden"));
    view.rerender(tree("visible"));
    await act(async () => undefined);

    expect(state.view.mounts).toBe(2);
    expect(card()).toBeNull();
    expect(props().selection).toBeNull();
  });
});

describe("MapScreen: the demo marker (`25` §4.4, DEC-50, KI-43)", () => {
  /** The root layout's marker: shown while an answer of the current pathname came from a stub. */
  function Marker() {
    return useHasStubData() ? <i data-demo-marker="" /> : null;
  }
  const marker = () => document.querySelector("[data-demo-marker]") !== null;

  /** The answer as `bffFetch` gives it: reported once, for the pathname it arrived at. */
  const answerFromStub = (points: MapPoint[]) =>
    act(async () => {
      reportSource("stub", `/ru${state.pathname}`);
      state.sent[0].resolve(answered(points));
    });

  it("is raised again when the map's own address is shown again after a listing or a sheet over it, never under them", async () => {
    const view = await mount(() => (
      <>
        <MapScreen />
        <Marker />
      </>
    ));
    await answerFromStub([point(1)]);
    expect(marker()).toBe(true);

    for (const [path, query] of [
      ["/listing/1", ""],
      ["/filters", "city=tashkent&from=map"],
    ]) {
      at(path, query);
      view.rerender();
      await act(async () => undefined);
      expect(marker()).toBe(false);

      at("/map", "city=tashkent");
      view.rerender();
      await act(async () => undefined);
      expect(marker()).toBe(true);
    }
    expect(state.sent).toHaveLength(1);
  });

  it("is raised again when the map's route is shown again after another tab", async () => {
    const tree = (mode: "visible" | "hidden") => (
      <>
        {createElement(Activity, { mode } as ActivityProps, <MapScreen />)}
        <Marker />
      </>
    );
    const view = await mount(() => tree("visible"));
    await answerFromStub([point(1)]);
    expect(marker()).toBe(true);

    at("/saved", "");
    view.rerender(tree("hidden"));
    await act(async () => undefined);
    expect(marker()).toBe(false);

    at("/map", "city=tashkent");
    view.rerender(tree("visible"));
    await act(async () => undefined);
    expect(marker()).toBe(true);
    expect(state.sent).toHaveLength(1);
  });
});

describe("MapScreen: drawing (SCR-012, WP-28 \"Drawing layer\")", () => {
  const AREA = [
    [41.31, 69.24],
    [41.32, 69.26],
    [41.3, 69.27],
  ] as const;

  /** The browser's address, which `useLayerState` pushes `draw=1` onto. */
  const browserAt = (href: string) => window.history.replaceState(null, "", `/ru${href}`);
  const pushed = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((call) => String(call[2]));

  it("a draw request is taken once when the screen is activated: light haptic, `areaTooSmall` reset, `draw=1` pushed", async () => {
    const pushState = vi.spyOn(window.history, "pushState");
    browserAt("/map?city=tashkent");
    act(() => setAreaTooSmall(true));
    requestDraw();
    // StrictMode at the root: React runs the activation effect twice; the request is taken once.
    const view = render(<StrictMode>{intl(<MapScreen />)}</StrictMode>);
    await act(() => vi.dynamicImportSettled());

    expect(pushed(pushState)).toEqual(["/ru/map?city=tashkent&draw=1"]);
    expect(state.impact).toHaveBeenCalledTimes(1);
    expect(areaTooSmall()).toBe(false);
    expect(consumeDrawRequest()).toBe(false);

    view.rerender(<StrictMode>{intl(<MapScreen />)}</StrictMode>);
    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it("is activated again when the address is back from a sheet, and when Activity shows the route again", async () => {
    const pushState = vi.spyOn(window.history, "pushState");
    browserAt("/map?city=tashkent");
    const tree = (mode: "visible" | "hidden") => createElement(Activity, { mode } as ActivityProps, <MapScreen />);
    const view = await mount(() => tree("visible"));
    expect(pushState).not.toHaveBeenCalled();
    // A request while the map is shown waits for its next activation.
    requestDraw();
    view.rerender(tree("visible"));
    expect(pushState).not.toHaveBeenCalled();

    at("/filters", "city=tashkent&from=map");
    view.rerender(tree("visible"));
    at("/map", "city=tashkent");
    view.rerender(tree("visible"));
    expect(pushState).toHaveBeenCalledTimes(1);

    requestDraw();
    view.rerender(tree("hidden"));
    expect(consumeDrawRequest()).toBe(true);
    requestDraw();
    view.rerender(tree("visible"));
    await act(async () => undefined);
    expect(pushState).toHaveBeenCalledTimes(2);
    expect(consumeDrawRequest()).toBe(false);
  });

  it("drawing closes the card, hides locate and keeps markers from opening it; both views get the lasso's inputs", async () => {
    const view = await mount();
    await answer(0, answered([point(1)]));
    select([1]);
    expect(card()).not.toBeNull();
    expect(props()).toMatchObject({ drawing: false });

    at("/map", "city=tashkent&draw=1");
    view.rerender();

    expect(card()).toBeNull();
    expect(locateButton()).toBeNull();
    expect(props()).toMatchObject({ drawing: true, onDrawn: expect.any(Function), onTooSmall: expect.any(Function) });
    state.impact.mockClear();
    select([1]);
    expect(card()).toBeNull();
    expect(state.impact).not.toHaveBeenCalled();

    // The address without `draw`: the layer closed, the map is back as it was.
    at("/map", "city=tashkent");
    view.rerender();
    expect(props().drawing).toBe(false);
    expect(locateButton()).not.toBeNull();
    // The same parameter under a listing opened over the map is not drawing on the map.
    at("/listing/1", "draw=1");
    view.rerender();
    expect(props().drawing).toBe(false);
  });

  it("on Leaflet as on GL", async () => {
    state.webgl2 = false;
    at("/map", "city=tashkent&draw=1");
    await mount();
    await act(() => vi.dynamicImportSettled());

    expect(state.leaflet.props).toMatchObject({ drawing: true, onDrawn: expect.any(Function), onTooSmall: expect.any(Function) });
  });

  it("a drawn area applies through `applyFilters`: the polygon, no districts or zones, the sort, the map as target", async () => {
    at("/map", "city=tashkent&zones=center&rooms_min=2&sort=cheap&draw=1");
    await mount();

    act(() => props().onDrawn!(AREA));

    expect(state.success).toHaveBeenCalledTimes(1);
    expect(state.applyFilters).toHaveBeenCalledTimes(1);
    const [next, options] = state.applyFilters.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
    expect(next).toMatchObject({ city: "tashkent", rooms_min: 2, polygon: AREA, districts: [], zones: [] });
    expect(options).toMatchObject({ sort: "cheap", target: routes.map, city: { code: "tashkent" } });
    expect(options.rules).toEqual(searchRules());
    expect(state.error).not.toHaveBeenCalled();
  });

  it("a stroke too small: the error haptic and `areaTooSmall` for the top bar; drawing goes on", async () => {
    at("/map", "city=tashkent&draw=1");
    await mount();

    act(() => props().onTooSmall!());

    expect(state.error).toHaveBeenCalledTimes(1);
    expect(areaTooSmall()).toBe(true);
    expect(props().drawing).toBe(true);
    expect(state.applyFilters).not.toHaveBeenCalled();
    expect(nav.back).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("a reload on `draw=1` keeps drawing: nothing closes the layer", async () => {
    at("/map", "city=tashkent&draw=1");
    const view = await mount();
    view.rerender();

    expect(props().drawing).toBe(true);
    expect(locateButton()).toBeNull();
    expect(nav.back).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("GL failing while drawing mounts Leaflet and closes the layer; the filters stay", async () => {
    at("/map", "city=tashkent&rooms_min=2&draw=1");
    await mount();

    act(() => props().onFail("webgl"));
    await act(() => vi.dynamicImportSettled());

    expect(document.querySelector('[data-map-view="stub-leaflet"]')).not.toBeNull();
    expect(state.reportError).toHaveBeenCalledTimes(1);
    // At depth 0 the layer closes to its parent address: the same search without `draw`.
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith("/map?city=tashkent&rooms_min=2");
  });

  it("GL failing while not drawing closes nothing, also with a step behind", async () => {
    act(() => pushEntry("/map?city=tashkent"));
    await mount();

    act(() => props().onFail("webgl"));

    expect(nav.back).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("GL failing while drawing with the layer pushed closes it with one Back", async () => {
    act(() => pushEntry("/map?city=tashkent&draw=1"));
    at("/map", "city=tashkent&draw=1");
    await mount();

    act(() => props().onFail("style"));

    expect(nav.back).toHaveBeenCalledTimes(1);
    expect(nav.replace).not.toHaveBeenCalled();
  });
});

describe("MapScreen: the basemap's inputs (WP-27 \"Basemap and tiles\", \"Camera\")", () => {
  it("the city of the search and the tiles of the reference data; the attribution follows the basemap", async () => {
    feedReference({
      cities: [cityOf(), cityOf({ code: "samarkand", name: "Самарканд", center: { lat: 39.6542, lon: 66.9597 }, zoom: 13 })],
      reference: { map: { tiles_url: "https://cdn.test/basemap.pmtiles" } },
    });
    at("/map", "city=samarkand&polygon=41.31100,69.24000;41.32000,69.26000;41.30000,69.27000");
    await mount();

    expect(props().cityView).toEqual({ center: [39.6542, 66.9597], zoom: 13 });
    expect(props().polygon).toHaveLength(3);
    expect(props().tiles).toBe("https://cdn.test/basemap.pmtiles");
    expect(attribution()?.textContent).toBe("© OpenStreetMap · Protomaps");

    const cityView = props().cityView;
    await answer(0, answered([point(1)]));
    select([1]);
    expect(props().cityView).toBe(cityView);
  });

  it("tells the view whether the city view is known: not without reference data, nor for a city they do not list", async () => {
    feedReference({ reference: null });
    const view = await mount();
    expect(props()).toMatchObject({ cityView: { center: [41.3111, 69.2797], zoom: 12 }, cityKnown: false });

    act(() => feedReference({}));
    expect(props().cityKnown).toBe(true);

    at("/map", "city=nukus");
    view.rerender();
    expect(props()).toMatchObject({ cityView: { center: [41.3111, 69.2797], zoom: 12 }, cityKnown: false });
  });

  it("the attribution follows the basemap the view reports: «© OpenStreetMap» once a vector basemap fell back to the raster", async () => {
    feedReference({ reference: { map: { tiles_url: "https://x.example/a.pmtiles" } } });
    await mount();
    expect(attribution()?.textContent).toBe("© OpenStreetMap · Protomaps");

    act(() => props().onBasemap!({ kind: "raster" }));

    expect(attribution()?.textContent).toBe("© OpenStreetMap");
  });

  it("without reference data there are no tiles and no attribution; `null` tiles are the raster, whose link opens outside", async () => {
    feedReference({ reference: null });
    await mount();
    expect(props().tiles).toBeUndefined();
    expect(attribution()).toBeNull();

    act(() => feedReference({}));
    expect(props().tiles).toBeNull();
    expect(attribution()?.textContent).toBe("© OpenStreetMap");
    const link = screen.getByRole("link", { name: "© OpenStreetMap" });

    expect(fireEvent.click(link)).toBe(false);
    expect(state.openLink).toHaveBeenCalledWith("https://www.openstreetmap.org/copyright");
  });

  it("follows the scheme and the lite mode of <html> without re-creating the view", async () => {
    await mount();
    await act(async () => {
      document.documentElement.dataset.scheme = "dark";
      document.documentElement.classList.add("lite");
    });

    expect(props()).toMatchObject({ scheme: "dark", lite: true });
    expect(state.view.mounts).toBe(1);
  });
});
