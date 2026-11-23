import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { CDPSession, Page, Request, TestInfo } from "@playwright/test";

/**
 * What the performance specs of WP-33 share ("Performance budget"; `e2e/perf/`): the throttled profile, the markers
 * that name a package or a screen inside a response body, the log of the app's scripts, the moments the page marks
 * itself, the stub photos of the throttled runs, and the measurement files `scripts/check-budgets.mjs` reads.
 */

/**
 * The `perf` project's profile: Lighthouse's mobile "slow 4G" as DevTools applies it to each request (150 ms round
 * trip × 3.75 = 562.5 ms of latency, 1.6 Mbit/s × 0.9 down, 750 kbit/s × 0.9 up) and the CPU four times slower than
 * the host. A CPU factor is relative to the machine, so a timing limit holds only for the machine it was measured on:
 * the manual run on GitHub's runner (DEC-100).
 */
export const SLOW_4G = { latencyMs: 562.5, downloadKbps: 1474.56, uploadKbps: 675 } as const;
export const CPU_SLOWDOWN = 4;

/**
 * Throttles `page` through its own DevTools session, kept open until the test ends (a detached session drops the
 * throttling). Rows 1, 2, 7 and 8 throttle the network and the CPU, row 9 the CPU alone, and row 10 nothing. It reaches every request the browser sends, including those the guard of `@homi/testing/playwright`
 * passes on, but not an answer a route fulfils itself: `perfMedia` delays those by the same numbers.
 */
export async function throttle(page: Page, { network = true, cpu = true }: { network?: boolean; cpu?: boolean } = {}): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  if (network) {
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: SLOW_4G.latencyMs,
      downloadThroughput: (SLOW_4G.downloadKbps * 1024) / 8,
      uploadThroughput: (SLOW_4G.uploadKbps * 1024) / 8,
    });
  }
  if (cpu) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
  }
  return cdp;
}

/**
 * A string that survives minification and is found only in the code of one package or one screen (checked against
 * the packages' `dist` files and the built chunks on 2026-11-23). Bodies are scanned instead of the chunk names of
 * `next analyze --output`, which does not build the app: its chunk names do not match `next build`'s (1 of 95 the same).
 */
export const MAP_MARKERS: Readonly<Record<string, string>> = {
  "maplibre-gl": "maplibregl-canvas",
  pmtiles: "Archive is spec version ",
  leaflet: "Map container is being reused by another instance",
  "leaflet.markercluster": "Map has no maxZoom specified",
  "protomaps-leaflet": "Failed to initialize canvas2d context.",
  supercluster: "No cluster with the specified id.",
};
/** In every entry `posthog-js` has (`module`, web vitals, exception and dead-click capture, the recorder). */
export const POSTHOG_MARKER = "__PosthogExtensions__";
/** The screens that must not load with the feed (row 5). The filters form and the radar forms share their footer. */
export const SCREEN_MARKERS: Readonly<Record<string, string>> = {
  "photo viewer": "data-viewer-strip",
  "filters and radar forms": "filters-footer",
  settings: "data-settings-state",
};
/**
 * One message of each locale's catalogue that no other catalogue, the boot script or the code holds (row 6): the
 * feed's own texts, so they are in every payload that carries the messages. The key exists in all three catalogues,
 * so `uz` and `en` never fall back to the `ru` text.
 */
export const LOCALE_MARKERS = { ru: "Это всё по вашему поиску", uz: "Hech narsa topilmadi", en: "Try loosening the filters" } as const;

/** The MapLibre worker and its shared module, copied under `public/maplibre/<version>/` (not `.next` chunks). */
const MAP_PUBLIC = /^\/maplibre\//;

/** Packages of `MAP_MARKERS` found in `body`. */
export function mapPackagesIn(body: string): string[] {
  return Object.entries(MAP_MARKERS)
    .filter(([, marker]) => body.includes(marker))
    .map(([name]) => name);
}

export interface Script {
  /** The address's path. */
  path: string;
  /**
   * When the browser started it, by its wall clock (`request.timing().startTime`), which the page's `Date.now()` of
   * `markMoments` shares; the runner's clock when the browser gave none.
   */
  sentAt: number;
  /** The compressed body as it crossed the network (`request.sizes().responseBodySize`). */
  bytes: number;
  body: string;
  /** Packages of `MAP_MARKERS` in the body, or `maplibre` for the worker files. */
  map: string[];
}

/**
 * Logs every script `page` asks the app's origin for: the chunks under `/_next/static/chunks/` and the MapLibre
 * files under `/maplibre/`. Start it before the launch. `scripts()` waits for the answers that are still on their way.
 */
export function scriptLog(page: Page, origin: string): { scripts: () => Promise<Script[]> } {
  const pending: Promise<Script | null>[] = [];
  page.on("request", (request: Request) => {
    const url = new URL(request.url());
    const chunk = url.pathname.startsWith("/_next/static/chunks/") && url.pathname.endsWith(".js");
    if (url.origin !== origin || !(chunk || MAP_PUBLIC.test(url.pathname))) {
      return;
    }
    const seen = Date.now();
    pending.push(
      (async () => {
        const response = await request.response();
        if (response === null) {
          return null;
        }
        const body = await response.text();
        const { responseBodySize } = await request.sizes();
        const map = MAP_PUBLIC.test(url.pathname) ? ["maplibre"] : mapPackagesIn(body);
        const { startTime } = request.timing();
        return { path: url.pathname, sentAt: startTime > 0 ? startTime : seen, bytes: responseBodySize, body, map };
      })().catch(() => null),
    );
  });
  return { scripts: async () => (await Promise.all(pending)).filter((script): script is Script => script !== null) };
}

/** What the page marks about itself (`markMoments`), each by the page's clock and by the wall clock. */
export interface Moments {
  /** The first visible card of the feed: `performance.now()` and `Date.now()`. */
  card: [number, number] | null;
  /** The first visible card and `html[data-session="ready"]` together. */
  ready: [number, number] | null;
  /** The first card photo that finished loading. */
  photo: [number, number] | null;
  /** The last Largest Contentful Paint candidate before any input. */
  lcp: { at: number; element: string; size: number; url: string } | null;
}

/**
 * Marks, from before the page's own scripts, when the first feed card is visible, when the session is ready too, when
 * the first card photo loads and the Largest Contentful Paint. Add it before the launch; read it with `moments`.
 */
export async function markMoments(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state: Record<string, unknown> = { card: null, ready: null, photo: null, lcp: null };
    (window as unknown as { __homiPerf: Record<string, unknown> }).__homiPerf = state;
    const stamp = () => [performance.now(), Date.now()];
    const visibleCard = () => [...document.querySelectorAll("article[data-listing]")].some((card) => card.checkVisibility());
    const check = () => {
      if (state.card === null && visibleCard()) {
        state.card = stamp();
      }
      if (state.ready === null && state.card !== null && document.documentElement.dataset.session === "ready") {
        state.ready = stamp();
      }
      if (state.ready !== null) {
        observer.disconnect();
      }
    };
    const observer = new MutationObserver(check);
    observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-session", "class", "style", "hidden"] });
    document.addEventListener(
      "load",
      (event) => {
        const target = event.target;
        if (state.photo === null && target instanceof HTMLImageElement && target.closest("article[data-listing]") !== null && target.naturalWidth > 0) {
          state.photo = stamp();
        }
        check();
      },
      true,
    );
    try {
      new PerformanceObserver((list) => {
        const last = list.getEntries().at(-1) as (PerformanceEntry & { element?: Element | null; size?: number; url?: string }) | undefined;
        if (last !== undefined) {
          state.lcp = { at: last.startTime, element: last.element?.tagName.toLowerCase() ?? "", size: last.size ?? 0, url: last.url ?? "" };
        }
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      // No LCP in this engine: the row stays unmeasured.
    }
  });
}

export function moments(page: Page): Promise<Moments> {
  return page.evaluate(() => (window as unknown as { __homiPerf: Moments }).__homiPerf);
}

/** The stub catalogue's photos (`STUB_MEDIA` of `@homi/testing/playwright`). */
const STUB_PHOTO = /^https:\/\/cdn\.homi\.loc\/stub\/\d+\/(\d+)(\.s)?\.jpg/;
/** Playwright loads the specs of this (CommonJS) app as CommonJS: `__dirname`, not `import.meta`. */
const PLACEHOLDERS = join(__dirname, "../../../../backend/resources/fixtures/media");

/**
 * Answers the stub photos with the placeholders `php artisan sources:publish-stub-media` publishes (800 × 600 and the
 * 240 × 180 small ones, 13–14 KB and 2.6–2.8 KB), not `stubMedia`'s 8 × 6 image, so a photo decodes and paints like a
 * real one. A fulfilled answer never crosses the throttled network, so while `throttled()` holds it waits what slow 4G
 * would take: the latency and the bytes at the download rate. Each photo waits on its own, as if it had the line to
 * itself: photos never share the bandwidth with the scripts, so the growth of the scripts shows in rows 1 and 2, not in
 * row 7.
 */
export async function perfMedia(page: Page, throttled: () => boolean): Promise<void> {
  const files = new Map<string, Buffer>();
  await page.route(STUB_PHOTO, async (route) => {
    const [, index, small] = STUB_PHOTO.exec(route.request().url()) ?? [];
    const name = `placeholder-${((Number(index) - 1) % 6) + 1}${small ?? ""}.jpg`;
    let body = files.get(name);
    if (body === undefined) {
      body = readFileSync(join(PLACEHOLDERS, name));
      files.set(name, body);
    }
    if (throttled()) {
      const ms = SLOW_4G.latencyMs + (body.length * 8 * 1000) / (SLOW_4G.downloadKbps * 1024);
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
    await route.fulfill({ status: 200, contentType: "image/jpeg", body });
  });
}

/** The rows of `perf-budgets.json`. */
export type BudgetRow = "1" | "2" | "3" | "4" | "4-key" | "5" | "6" | "7" | "8" | "9" | "10";

/**
 * Writes one measurement of `row` for `scripts/check-budgets.mjs`: a file of its own under `test-results/perf/`, which
 * Playwright empties at the start of every run, so the check after a run sees only that run's measurements.
 */
export function recordMeasurement(info: TestInfo, row: BudgetRow, value: number, details: Record<string, unknown> = {}): void {
  const dir = join(info.project.outputDir, "perf");
  mkdirSync(dir, { recursive: true });
  const name = `${row}--${info.project.name}--${info.testId}--${info.repeatEachIndex}.json`;
  writeFileSync(join(dir, name), `${JSON.stringify({ row, value, project: info.project.name, test: info.title, ...details }, null, 2)}\n`);
}

/** Sums the compressed bytes of `scripts`. */
export const bytesOf = (scripts: readonly Script[]) => scripts.reduce((sum, script) => sum + script.bytes, 0);
