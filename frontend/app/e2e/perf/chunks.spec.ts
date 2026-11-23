import { expect, launchApp, setScenario, stubMedia, test } from "@homi/testing/playwright";
import type { Page, Response } from "@playwright/test";

import { bytesOf, LOCALE_MARKERS, markMoments, moments, POSTHOG_MARKER, recordMeasurement, SCREEN_MARKERS, scriptLog } from "../support/perf";

/**
 * What the feed's first load must not ask for (WP-33 "Performance budget", rows 3 to 6 and 10). The specs measure and
 * write `test-results/perf/`; `scripts/check-budgets.mjs` compares the values with `perf-budgets.json` after the run.
 *
 * - `@budget` (rows 3 to 6): every pull request, in both session modes, unthrottled — what is asked for does not
 *   depend on the network's speed. Each also proves that its markers still find the code they name (the map once it
 *   opens, each screen once it is loaded, its own locale's messages), so a renamed string cannot make it pass empty.
 * - `@analytics` (row 4 with a key): the analytics run, whose build has a PostHog key (`E2E_ANALYTICS=1`).
 * - `@perf` (row 10): the manual run's `perf` project (DEC-100).
 */

const API_MS = 20_000;
/** Row 3: no map code within 2 s of the first card. The warm-up starts 2.5 s after the first photo at the earliest. */
const WINDOW_MS = 2_000;
/** Row 4: past the PostHog loader's longest wait after the session (8 s without a first photo, then 500 ms). */
const POSTHOG_WAIT_MS = 9_500;
/** Stub ids (WP-12): the feed's first listing. */
const LISTING = 100001;

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const origin = () => new URL(test.info().project.use.baseURL ?? "http://localhost:3001").origin;

/** Launches on the feed and waits for the session and the first card. */
async function openFeed(page: Page, path = "/", locale?: "ru" | "uz" | "en"): Promise<void> {
  await launchApp(page, { path, ...(locale === undefined ? {} : { locale }) });
  await expect(page.locator("html")).toHaveAttribute("data-session", "ready", { timeout: API_MS });
  await expect(visible(page, "article[data-listing]").first()).toBeVisible({ timeout: API_MS });
}

/** Waits until the wall clock reaches `at` (ms since the epoch). */
async function until(page: Page, at: number): Promise<void> {
  const left = at - Date.now();
  if (left > 0) {
    await page.waitForTimeout(left);
  }
}

test.describe("first load of the feed @budget", () => {
  test("rows 3, 4 and 5: no map code within 2 s of the first card, no PostHog code without a key, no code of other screens", async ({ page }) => {
    test.setTimeout(90_000);
    await stubMedia(page);
    await markMoments(page);
    const log = scriptLog(page, origin());

    await openFeed(page);
    const { card, ready } = await moments(page);
    expect(card, "the page marked its first card").not.toBeNull();
    expect(ready, "the page marked its session").not.toBeNull();
    await until(page, Math.max(card![1] + WINDOW_MS, ready![1] + POSTHOG_WAIT_MS));

    const scripts = await log.scripts();
    expect(scripts.length, "the feed's own code was logged").toBeGreaterThan(5);
    const inWindow = scripts.filter((script) => script.sentAt <= card![1] + WINDOW_MS);
    const map = inWindow.filter((script) => script.map.length > 0);
    recordMeasurement(test.info(), "3", bytesOf(map), { files: map.map((script) => `${script.path} (${script.map.join(", ")})`) });
    const posthog = scripts.filter((script) => script.body.includes(POSTHOG_MARKER));
    recordMeasurement(test.info(), "4", bytesOf(posthog), { files: posthog.map((script) => script.path), waitedMs: POSTHOG_WAIT_MS });
    const screens = Object.entries(SCREEN_MARKERS).flatMap(([name, marker]) =>
      inWindow.filter((script) => script.body.includes(marker)).map((script) => `${name}: ${script.path}`),
    );
    recordMeasurement(test.info(), "5", screens.length, { files: screens });

    // The markers still find the map's code: it loads once the map opens.
    await visible(page, "[data-view-toggle]").click();
    await expect(visible(page, "[data-map-view]")).toBeVisible({ timeout: API_MS });
    await expect.poll(async () => (await log.scripts()).some((script) => script.map.length > 0), { timeout: API_MS }).toBe(true);

    // …and each screen's code once that screen loads.
    const loads = [
      { name: "photo viewer", path: `/ru/listing/${LISTING}/photos` },
      { name: "filters and radar forms", path: "/ru/filters" },
      { name: "filters and radar forms", path: "/ru/radars/new" },
      { name: "settings", path: "/ru/settings" },
    ];
    for (const { name, path } of loads) {
      const before = Date.now();
      await page.goto(path);
      await expect
        .poll(async () => (await log.scripts()).some((script) => script.sentAt >= before && script.body.includes(SCREEN_MARKERS[name])), {
          timeout: API_MS,
          message: `${path} loads the code its marker names (${name})`,
        })
        .toBe(true);
    }
  });

  for (const locale of ["ru", "uz", "en"] as const) {
    test(`row 6: a launch in ${locale} is sent the ${locale} messages and no other locale's`, async ({ page }) => {
      await stubMedia(page);
      // The stub profile's saved language decides the address (the locale guard): `uz` and `en` are profiles of their own.
      await setScenario(page, locale === "ru" ? null : locale);
      const bodies: Promise<{ path: string; text: string } | null>[] = [];
      page.on("response", (response: Response) => {
        const url = new URL(response.url());
        if (url.origin === origin()) {
          bodies.push(
            response
              .text()
              .then((text) => ({ path: url.pathname, text }))
              .catch(() => null),
          );
        }
      });

      await openFeed(page, `/${locale}`, locale);
      await page.waitForLoadState("networkidle");

      const answers = (await Promise.all(bodies)).filter((body) => body !== null);
      expect(
        answers.some(({ text }) => text.includes(LOCALE_MARKERS[locale])),
        `the ${locale} marker is in what the launch loaded: the scan sees the messages`,
      ).toBe(true);
      const foreign = answers.flatMap(({ path, text }) =>
        Object.entries(LOCALE_MARKERS)
          .filter(([other, marker]) => other !== locale && text.includes(marker))
          .map(([other]) => `${other} in ${path}`),
      );
      recordMeasurement(test.info(), "6", foreign.length, { locale, found: foreign });
    });
  }
});

test.describe("PostHog with a key @analytics", () => {
  test("row 4 with a key: no PostHog code is asked for before the first card photo plus 0.5 s", async ({ page }) => {
    test.setTimeout(60_000);
    // The fake key's unroutable host (`frontend/playwright.config.ts`): its configuration answers, nothing else.
    await page.route(
      (url) => url.hostname === "posthog.e2e.invalid",
      (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "{}" }),
    );
    await stubMedia(page);
    await markMoments(page);
    const log = scriptLog(page, origin());

    await openFeed(page);
    await expect.poll(async () => (await log.scripts()).some((script) => script.body.includes(POSTHOG_MARKER)), { timeout: 15_000 }).toBe(true);
    const { photo } = await moments(page);
    expect(photo, "the first card photo loaded").not.toBeNull();

    const posthog = new Set((await log.scripts()).filter((script) => script.body.includes(POSTHOG_MARKER)).map((script) => script.path));
    // The page's own clock: when each PostHog file was asked for, against the photo's `load`.
    const sent = await page.evaluate(
      (paths) =>
        performance
          .getEntriesByType("resource")
          .filter((entry) => paths.includes(new URL(entry.name).pathname))
          .map((entry) => ({ path: new URL(entry.name).pathname, at: entry.startTime, bytes: (entry as PerformanceResourceTiming).encodedBodySize })),
      [...posthog],
    );
    expect(sent.length, "the PostHog files are in the page's resource timing").toBe(posthog.size);
    const early = sent.filter((entry) => entry.at < photo![0] + 500);
    recordMeasurement(
      test.info(),
      "4-key",
      early.reduce((sum, entry) => sum + entry.bytes, 0),
      { photoAt: Math.round(photo![0]), sent: sent.map((entry) => `${entry.path} at ${Math.round(entry.at)}`) },
    );
  });
});

test.describe("the map's second opening @perf", () => {
  test("row 10: opening the map again asks for no map code again", async ({ page }) => {
    test.setTimeout(90_000);
    await stubMedia(page);
    const log = scriptLog(page, origin());
    await openFeed(page);

    await visible(page, "[data-view-toggle]").click();
    await expect(visible(page, "[data-map-view]")).toBeVisible({ timeout: API_MS });
    await expect(visible(page, "[data-marker]").first()).toBeVisible({ timeout: API_MS });
    const first = (await log.scripts()).filter((script) => script.map.length > 0);
    expect(first.length, "the first opening loaded the map's code").toBeGreaterThan(0);

    await visible(page, "[data-view-toggle]").click();
    await expect(visible(page, "article[data-listing]").first()).toBeVisible({ timeout: API_MS });
    const back = Date.now();
    await visible(page, "[data-view-toggle]").click();
    await expect(visible(page, "[data-map-view]")).toBeVisible({ timeout: API_MS });
    await expect(visible(page, "[data-marker]").first()).toBeVisible({ timeout: API_MS });
    await page.waitForTimeout(2_000);

    const known = new Set(first.map((script) => script.path));
    const again = (await log.scripts()).filter((script) => script.sentAt >= back && (script.map.length > 0 || known.has(script.path)));
    recordMeasurement(test.info(), "10", again.length, { first: first.map((script) => script.path), again: again.map((script) => script.path) });
  });
});
