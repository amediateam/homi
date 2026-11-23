import { expect, launchApp, test } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

import { bytesOf, markMoments, moments, perfMedia, recordMeasurement, scriptLog, throttle } from "../support/perf";

/**
 * Startup under the `perf` project's profile (WP-33 "Performance budget", rows 1, 2, 7 and 8; the manual run of
 * DEC-100). The specs measure and write `test-results/perf/`; `scripts/check-budgets.mjs` judges them.
 *
 * - "Session present" is a relaunch: a first launch without throttling leaves the session cookie, then the page is
 *   reloaded throttled. Playwright turns the HTTP cache off while routes are set (the guard of
 *   `@homi/testing/playwright` always sets one), so the relaunch downloads every file again, as a cold start does.
 * - The moment of rows 1 and 2 is the feed's first visible card with the session ready. With a session the cards are
 *   in the server's HTML and can show before any script runs, so the card alone would make the count a race with the
 *   parser; with the session ready the page is hydrated and the feed works.
 * - Rows 7 and 8 take the 75th percentile of `RUNS` relaunches: one test per run, each in a fresh context.
 */

const RUNS = 20;
const SLOW_MS = 60_000;

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const origin = () => new URL(test.info().project.use.baseURL ?? "http://localhost:3001").origin;

/** Waits for the feed's first card and the session. */
async function feedShown(page: Page): Promise<void> {
  await expect(visible(page, "article[data-listing]").first()).toBeVisible({ timeout: SLOW_MS });
  await expect(page.locator("html")).toHaveAttribute("data-session", "ready", { timeout: SLOW_MS });
}

/** A first launch without throttling, which leaves the session; then the relaunch is throttled. */
async function relaunchThrottled(page: Page): Promise<{ throttledSince: number }> {
  let throttled = false;
  await perfMedia(page, () => throttled);
  await launchApp(page, { path: "/" });
  await feedShown(page);
  await markMoments(page);
  await throttle(page);
  throttled = true;
  return { throttledSince: Date.now() };
}

test.describe("startup @perf", () => {
  test("row 1: the JavaScript asked for until the feed works, session present", async ({ page }) => {
    test.setTimeout(2 * SLOW_MS);
    await relaunchThrottled(page);
    const log = scriptLog(page, origin());
    await page.reload();
    await feedShown(page);

    const { ready } = await moments(page);
    expect(ready, "the page marked its first card with the session ready").not.toBeNull();
    const scripts = (await log.scripts()).filter((script) => script.sentAt <= ready![1]);
    recordMeasurement(test.info(), "1", bytesOf(scripts), { files: scripts.length, readyAt: Math.round(ready![0]) });
  });

  test("row 2: the JavaScript asked for until the first card on a first launch", async ({ page }) => {
    test.setTimeout(2 * SLOW_MS);
    await perfMedia(page, () => true);
    await markMoments(page);
    const log = scriptLog(page, origin());
    await throttle(page);
    await launchApp(page, { path: "/" });
    await feedShown(page);

    const { card, ready } = await moments(page);
    expect(card, "the page marked its first card").not.toBeNull();
    const scripts = (await log.scripts()).filter((script) => script.sentAt <= card![1]);
    const map = scripts.filter((script) => script.map.length > 0);
    recordMeasurement(test.info(), "2", bytesOf(scripts), {
      files: scripts.length,
      cardAt: Math.round(card![0]),
      readyAt: ready === null ? null : Math.round(ready[0]),
      // The warm-up waits for the first photo: no map code may be part of the first card's cost.
      map: map.map((script) => script.path),
    });
  });

  for (let run = 1; run <= RUNS; run++) {
    test(`rows 7 and 8: the first card photo and the largest paint of a relaunch (run ${run} of ${RUNS})`, async ({ page }) => {
      test.setTimeout(2 * SLOW_MS);
      await relaunchThrottled(page);
      await page.reload();
      await feedShown(page);
      await expect.poll(async () => (await moments(page)).photo, { timeout: SLOW_MS, message: "the first card photo loads" }).not.toBeNull();
      await page.waitForLoadState("load");

      const { photo, lcp } = await moments(page);
      const network = await page.evaluate(() => (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType ?? "");
      const source = await visible(page, 'article[data-listing] [data-slide="0"] img').first().evaluate((image) => (image as HTMLImageElement).currentSrc);
      recordMeasurement(test.info(), "7", Math.round(photo![0]), { run, network, source: new URL(source).pathname });
      expect(lcp, "the page reported a largest paint").not.toBeNull();
      recordMeasurement(test.info(), "8", Math.round(lcp!.at), { run, element: lcp!.element, size: lcp!.size, url: lcp!.url === "" ? "" : new URL(lcp!.url).pathname });
    });
  }
});
