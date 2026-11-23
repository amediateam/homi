import { expect, launchApp, test } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

import { perfMedia, recordMeasurement, throttle } from "../support/perf";

/**
 * Scrolling the feed (WP-33 "Performance budget", row 9; the manual run's `perf` project, DEC-100): the share of
 * frame intervals over 28 ms while the whole stub feed scrolls by touch with the CPU four times slower and full
 * graphics. 28 ms and 20 % are the app's own rule for switching itself to lite mode (`03` §1.7, `lib/graphics.ts`).
 *
 * The stub feed ends after 45 cards (20 + 20 + 5, `StubListingSource`): the whole feed, three pages, stands in for the
 * five pages of the row. The frames are sampled only while a gesture runs, so the pauses between gestures, whose
 * frames cost nothing, do not dilute the share.
 */

const SLOW_MS = 60_000;
/** A gesture: a flick of a phone's height at a quick reading pace. */
const GESTURE = { distance: 600, speed: 1_200 };
const OVER_MS = 28;

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });

test.describe("scrolling the feed @perf", () => {
  test("row 9: frames over 28 ms while the whole feed scrolls, CPU × 4, full graphics", async ({ page }) => {
    test.setTimeout(4 * SLOW_MS);
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("homi-graphics", "full");
      } catch {
        // No storage: the device rule decides, and the check below says so.
      }
    });
    await perfMedia(page, () => false);
    await launchApp(page, { path: "/" });
    await expect(visible(page, "article[data-listing]").first()).toBeVisible({ timeout: SLOW_MS });
    await expect(page.locator("html")).toHaveAttribute("data-session", "ready", { timeout: SLOW_MS });
    const cdp = await throttle(page, { network: false });

    await page.evaluate(() => {
      const state = { sampling: false, last: 0, frames: [] as number[] };
      (window as unknown as { __homiFrames: typeof state }).__homiFrames = state;
      const tick = (time: number) => {
        if (state.sampling && state.last > 0) {
          state.frames.push(time - state.last);
        }
        state.last = state.sampling ? time : 0;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const sample = (on: boolean) =>
      page.evaluate((value) => {
        (window as unknown as { __homiFrames: { sampling: boolean } }).__homiFrames.sampling = value;
      }, on);

    const end = visible(page, "[data-feed-end]");
    let gestures = 0;
    while ((await end.count()) === 0 && gestures < 120) {
      await sample(true);
      await cdp.send("Input.synthesizeScrollGesture", {
        x: 195,
        y: 640,
        yDistance: -GESTURE.distance,
        speed: GESTURE.speed,
        gestureSourceType: "touch",
      });
      await sample(false);
      gestures += 1;
    }
    await expect(end, "the whole stub feed scrolled by").toBeVisible();

    const frames = await page.evaluate(() => (window as unknown as { __homiFrames: { frames: number[] } }).__homiFrames.frames);
    const cards = await visible(page, "article[data-listing]").count();
    expect(await page.evaluate(() => document.documentElement.classList.contains("lite")), "full graphics all along").toBe(false);
    expect(frames.length, "frames were sampled").toBeGreaterThan(100);
    const over = frames.filter((frame) => frame > OVER_MS).length;
    recordMeasurement(test.info(), "9", over / frames.length, {
      frames: frames.length,
      over,
      gestures,
      cards,
      slowest: Math.round(Math.max(...frames)),
    });
  });
});
