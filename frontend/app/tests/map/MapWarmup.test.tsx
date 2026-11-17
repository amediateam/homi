import { act, cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrefetchOptions } from "@/features/map/tilePrefetch";

const state = vi.hoisted(() => ({
  pathname: "/",
  search: "city=tashkent",
  warmMap: vi.fn<(engine?: string) => Promise<void>>(),
  currentEngine: vi.fn(() => "gl"),
  prefetchTiles: vi.fn<(options: PrefetchOptions) => Promise<{ tiles: number; bytes: number }>>(),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.search) }));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ me: null }) }));
vi.mock("@/features/map/engine", () => ({ warmMap: state.warmMap, currentEngine: state.currentEngine }));
vi.mock("@/features/map/tilePrefetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/map/tilePrefetch")>()),
  prefetchTiles: state.prefetchTiles,
}));

import { MapWarmup, WARMUP_DELAY_MS } from "@/features/map/MapWarmup";
import { resetReference } from "@/lib/reference/useReference";

import { cityOf, feedReference } from "../helpers/reference";

const TEMPLATE = "https://tiles.test/basemap/{z}/{x}/{y}.mvt";
const SAMARKAND = cityOf({ code: "samarkand", name: "Самарканд", center: { lat: 39.6542, lon: 66.9597 }, zoom: 13 });

/** `navigator.connection` of Chromium with `values`. */
function stubConnection(values: { saveData?: boolean; effectiveType?: string }): void {
  Object.defineProperty(navigator, "connection", { configurable: true, value: values });
}

const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
  state.pathname = "/";
  state.search = "city=tashkent";
  state.warmMap.mockReset();
  state.warmMap.mockResolvedValue(undefined);
  state.currentEngine.mockClear();
  state.prefetchTiles.mockReset();
  state.prefetchTiles.mockResolvedValue({ tiles: 0, bytes: 0 });
  window.localStorage.clear();
  feedReference({ cities: [cityOf(), SAMARKAND] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  resetReference();
  document.documentElement.classList.remove("lite");
  delete (navigator as Navigator & { connection?: unknown }).connection;
});

describe("MapWarmup (WP-27 'Warm-up and tile prefetch', LB-APP-018)", () => {
  it("renders nothing and does nothing while rendering, on the server or in the browser", () => {
    // Only the markers of its own `<Suspense>`.
    expect(renderToString(<MapWarmup />).replaceAll(/<!--.*?-->/g, "")).toBe("");
    const { container } = render(<MapWarmup />);

    expect(container.innerHTML).toBe("");
    expect(state.warmMap).not.toHaveBeenCalled();
    expect(state.currentEngine).not.toHaveBeenCalled();
    expect(state.prefetchTiles).not.toHaveBeenCalled();
  });

  it("warms the engine the map will pick 2.5 s after the list settles, once under StrictMode", async () => {
    render(
      <StrictMode>
        <MapWarmup />
      </StrictMode>,
    );

    await wait(WARMUP_DELAY_MS - 1);
    expect(state.warmMap).not.toHaveBeenCalled();

    await wait(1);
    expect(state.currentEngine).toHaveBeenCalledTimes(1);
    expect(state.warmMap).toHaveBeenCalledTimes(1);
    expect(state.warmMap).toHaveBeenCalledWith("gl");

    await wait(10 * WARMUP_DELAY_MS);
    expect(state.warmMap).toHaveBeenCalledTimes(1);
  });

  it("a new search restarts the wait", async () => {
    const view = render(<MapWarmup />);
    await wait(2_000);

    state.search = "city=tashkent&deal=sale";
    view.rerender(<MapWarmup />);
    await wait(2_000);
    expect(state.warmMap).not.toHaveBeenCalled();

    await wait(WARMUP_DELAY_MS - 2_000);
    expect(state.warmMap).toHaveBeenCalledTimes(1);
  });

  it("leaving the list before 2.5 s cancels it", async () => {
    const view = render(<MapWarmup />);
    await wait(2_000);

    view.unmount();
    await wait(10 * WARMUP_DELAY_MS);

    expect(state.warmMap).not.toHaveBeenCalled();
    expect(state.prefetchTiles).not.toHaveBeenCalled();
  });

  it.each([{ saveData: true }, { effectiveType: "2g" }, { effectiveType: "slow-2g" }])("does nothing with %o", async (connection) => {
    stubConnection(connection);
    feedReference({ cities: [cityOf()], reference: { map: { tiles_url: TEMPLATE } } });
    render(<MapWarmup />);

    await wait(10 * WARMUP_DELAY_MS);

    expect(state.warmMap).not.toHaveBeenCalled();
    expect(state.prefetchTiles).not.toHaveBeenCalled();
  });

  it("a failed warm-up is swallowed", async () => {
    state.warmMap.mockRejectedValue(new Error("chunk"));
    render(<MapWarmup />);

    await wait(WARMUP_DELAY_MS);
    await act(async () => {});

    expect(state.warmMap).toHaveBeenCalledTimes(1);
  });

  it("a tile template prefetches the view of the list's city; leaving aborts it", async () => {
    state.search = "city=samarkand";
    feedReference({ cities: [cityOf(), SAMARKAND], reference: { map: { tiles_url: TEMPLATE } } });
    document.documentElement.classList.add("lite");
    stubConnection({ effectiveType: "4g" });
    const view = render(<MapWarmup />);

    await wait(WARMUP_DELAY_MS);

    expect(state.warmMap).toHaveBeenCalledTimes(1);
    expect(state.prefetchTiles).toHaveBeenCalledTimes(1);
    const options = state.prefetchTiles.mock.calls[0][0];
    expect(options).toMatchObject({
      template: TEMPLATE,
      city: { center: [39.6542, 66.9597], zoom: 13 },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      lite: true,
      network: { effectiveType: "4g" },
    });
    expect(options.signal?.aborted).toBe(false);

    view.unmount();
    expect(options.signal?.aborted).toBe(true);
  });

  it.each([
    ["null", null],
    ["a .pmtiles file", "https://media.test/basemap.pmtiles"],
  ] as const)("%s tiles warm the code only", async (_name, tiles) => {
    feedReference({ cities: [cityOf()], reference: { map: { tiles_url: tiles } } });
    render(<MapWarmup />);

    await wait(WARMUP_DELAY_MS);

    expect(state.warmMap).toHaveBeenCalledTimes(1);
    expect(state.prefetchTiles).not.toHaveBeenCalled();
  });

  it("reference data that did not load prefetches nothing", async () => {
    feedReference({ reference: null });
    render(<MapWarmup />);

    await wait(WARMUP_DELAY_MS);

    expect(state.warmMap).toHaveBeenCalledTimes(1);
    expect(state.prefetchTiles).not.toHaveBeenCalled();
  });
});
