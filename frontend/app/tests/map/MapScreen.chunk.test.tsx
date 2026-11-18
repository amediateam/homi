import { getMessages } from "@homi/i18n";
import { act, cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

/**
 * The view's own chunk failing to load (WP-27 "Engine choice", LB-APP-019): a module of its own, because the screen's
 * `next/dynamic` keeps the first load of the view for the whole module graph.
 */
const state = vi.hoisted(() => ({ reportError: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({ bffFetch: () => new Promise(() => undefined) }));
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: vi.fn(), reauthenticate: vi.fn() }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: "ready", me: null, renewed: false }) }));
vi.mock("@/lib/navigation/nav", () => ({ nav: { push: vi.fn(), replace: vi.fn(), tab: vi.fn(), back: vi.fn() } }));
vi.mock("next/navigation", () => ({ usePathname: () => "/ru/map", useSearchParams: () => new URLSearchParams("city=tashkent") }));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => "/map" }));
vi.mock("@/lib/deeplinks/launch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/deeplinks/launch")>()),
  launchMapOptions: () => ({ override: null, debug: false }),
}));
vi.mock("@/lib/errors/report", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/errors/report")>()),
  reportError: state.reportError,
}));
vi.mock("@/features/map/gl/library", () => ({ loadMapLibre: vi.fn() }));
vi.mock("@/features/map/gl/MapViewGL", () => {
  throw new Error("Failed to load chunk");
});
vi.mock("@/features/map/leaflet/library", () => ({ loadLeaflet: vi.fn() }));
vi.mock("@/features/map/leaflet/MapViewLeaflet", () => ({ default: () => <div data-map-view="stub-leaflet" /> }));
vi.mock("@/features/map/MapSelectionCard", () => ({ MapSelectionCard: () => null }));
vi.mock("@/features/map/useCardLayer", () => ({ useCardLayer: () => undefined }));

vi.mock("@/features/map/engine", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/map/engine")>();
  return { ...original, markGlFailed: vi.fn(original.markGlFailed) };
});

import { markGlFailed, resetEngineForTests } from "@/features/map/engine";
import { MapScreen } from "@/features/map/MapScreen";

beforeEach(() => {
  resetEngineForTests();
  state.reportError.mockReset();
  vi.mocked(markGlFailed).mockClear();
  const context = { getExtension: () => ({ loseContext: () => undefined }) };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(((type: string) => (type === "webgl2" ? context : null)) as never);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetEngineForTests();
});

it("a view chunk that does not load is a GL failure: Leaflet shows and `map_gl_failed` is reported once", async () => {
  render(
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      <MapScreen />
    </NextIntlClientProvider>,
  );
  await act(() => vi.dynamicImportSettled());
  await act(async () => undefined);
  await act(() => vi.dynamicImportSettled());

  expect(document.querySelector('[data-map-view="stub-leaflet"]')).not.toBeNull();
  expect(state.reportError).toHaveBeenCalledTimes(1);
  expect(state.reportError.mock.calls[0][1]).toMatchObject({ kind: "error", reason: "chunk" });
});

it("under StrictMode the failed chunk is reported once: the screen would close a drawing twice (WP-28 review)", async () => {
  render(
    <StrictMode>
      <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
        <MapScreen />
      </NextIntlClientProvider>
    </StrictMode>,
  );
  await act(() => vi.dynamicImportSettled());
  await act(async () => undefined);
  await act(() => vi.dynamicImportSettled());

  expect(document.querySelector('[data-map-view="stub-leaflet"]')).not.toBeNull();
  expect(markGlFailed).toHaveBeenCalledTimes(1);
});
