import { expect, launchApp, stubMedia, test as base } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

/**
 * Motion of the pinned release (WP-39): what plays is read in the browser, as WP-36 read `listing-in` and
 * `listing-out`. A leaving copy (`@homi/ui` `lib/leave.ts`, BR-APP-112) is caught as it enters the document: its kind,
 * that it is inert and hidden from assistive technology, and the keyframes and timing of its Web Animations. The cases:
 * a sheet closed by Telegram's Back leaves a copy of itself and of its backdrop, which are gone within the leave's
 * 600 ms; a sheet closed by its drag leaves none; a toast leaves; under reduced motion and in lite graphics nothing
 * leaves; and «Включить радар» shows its tick for 900 ms before the sheet closes with the toast (BR-APP-114). Both
 * session modes.
 */

const test = base.extend<{ photos: readonly string[] }>({
  /** The stub photos answered so far: every test answers them itself, as CI has no `cdn.homi.loc`. */
  photos: [async ({ page }, use) => use(await stubMedia(page)), { auto: true }],
});

interface Fake {
  emit(eventType: string): void;
}

interface SeenLeave {
  kind: string | null;
  slot: string | null;
  inert: boolean;
  hidden: string | null;
  animations: Array<{ duration: number; easing: string; fill: string; frame: Record<string, string> }>;
}

type Mode = "cookie" | "header";

const API_MS = 20_000;
/** A search no fixture radar has: the footer offers «Включить радар». */
const OWN_SEARCH = "/?rooms_min=3&rooms_max=3";

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const html = (page: Page) => page.locator("html");
const chip = (page: Page, key: string) => visible(page, `[data-topbar="search-list"] [data-chip="${key}"]`);
const sheet = (page: Page) => visible(page, '[data-slot="bottom-sheet"]');
const copies = (page: Page) => page.locator("[data-leave]");
const appToast = (page: Page) => visible(page, '[data-toast-host="app"] [data-toast]');
const subscribeButton = (page: Page) => visible(page, '[data-slot="bottom-sheet"] [data-slot="filters-footer"] [data-action="subscribe"]');
const press = (page: Page, eventType: "backButtonClicked") =>
  page.evaluate((type) => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.emit(type), eventType);

/** Launches the app with the nudges silenced (`homi-nudge`), so none of them shows a toast or a sheet of its own here. */
async function open(page: Page, mode: Mode, path = "/"): Promise<void> {
  await page.addInitScript(() => {
    const far = Date.now() + 30 * 24 * 3_600_000;
    try {
      localStorage.setItem("homi-nudge", JSON.stringify({ asked: [], closed: 0, quietUntil: far, lastShown: 0, back: {}, feedOff: far }));
    } catch {
      // No storage on this document (about:blank): nothing to silence there.
    }
  });
  await launchApp(page, { mode, path });
  await expect(html(page)).toHaveAttribute("data-session", "ready", { timeout: API_MS });
}

/** The entrance has ended, so a gesture lands where the sheet rests and its copy is taken at rest. */
const settled = (page: Page) =>
  sheet(page).evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));

/** Every leaving copy from now on, read at the moment it enters the document. */
const watchLeaves = (page: Page) =>
  page.evaluate(() => {
    const seen: SeenLeave[] = [];
    (window as unknown as { __leaves: SeenLeave[] }).__leaves = seen;
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (node instanceof HTMLElement && node.hasAttribute("data-leave")) {
            seen.push({
              kind: node.getAttribute("data-leave"),
              slot: node.getAttribute("data-slot"),
              inert: node.inert,
              hidden: node.getAttribute("aria-hidden"),
              animations: node.getAnimations().map((animation) => {
                const timing = animation.effect?.getTiming();
                // The keyframe's own declarations, without what the engine adds to every keyframe.
                const frame: Record<string, string> = {};
                for (const [name, value] of Object.entries((animation.effect as KeyframeEffect).getKeyframes()[0] ?? {})) {
                  if (!["offset", "computedOffset", "easing", "composite"].includes(name)) {
                    frame[name] = String(value);
                  }
                }
                return { duration: Number(timing?.duration), easing: String(timing?.easing), fill: String(timing?.fill), frame };
              }),
            });
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
const leaves = (page: Page) => page.evaluate(() => (window as unknown as { __leaves: SeenLeave[] }).__leaves);

/** The sort sheet over the feed, at rest, with the watch on. */
async function openSort(page: Page): Promise<void> {
  await chip(page, "sort").click();
  await expect(sheet(page)).toBeVisible();
  await settled(page);
  await watchLeaves(page);
}

/** A drag of the sheet's header far enough down to close it. */
async function dragSheetDown(page: Page): Promise<void> {
  const header = await visible(page, '[data-slot="bottom-sheet-title"]').boundingBox();
  if (header === null) {
    throw new Error("no sheet header");
  }
  await page.mouse.move(header.x + 4, header.y + header.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(header.x + 4, header.y + header.height / 2 + step * 40);
  }
  await page.mouse.up();
}

for (const mode of ["cookie", "header"] as const) {
  test.describe(`motion (${mode} mode)`, () => {
    test("a sheet closed by Back leaves a copy sliding down over a copy of its backdrop fading; both are gone within 600 ms", async ({ page }) => {
      await open(page, mode);
      await openSort(page);

      const closedAt = Date.now();
      await press(page, "backButtonClicked");
      await expect(sheet(page)).toHaveCount(0);
      await expect.poll(async () => (await leaves(page)).length).toBe(2);

      const [backdrop, copy] = await leaves(page);
      expect(backdrop).toEqual({
        kind: "backdrop",
        slot: "bottom-sheet-overlay-leave",
        inert: true,
        hidden: "true",
        animations: [{ duration: 280, easing: "ease-out", fill: "forwards", frame: { backgroundColor: "transparent" } }],
      });
      expect(copy).toEqual({
        kind: "sheet",
        slot: "bottom-sheet-leave",
        inert: true,
        hidden: "true",
        animations: [{ duration: 280, easing: "cubic-bezier(0.3, 0, 0.2, 1)", fill: "forwards", frame: { transform: "translateY(100%)" } }],
      });

      await expect(copies(page)).toHaveCount(0);
      // 280 ms of motion, removed when it ends and never later than the leave's 600 ms; the rest is the poll's slack.
      expect(Date.now() - closedAt).toBeLessThan(2_000);
      // The feed below is live again: nothing of the copy is left over it.
      await chip(page, "sort").click();
      await expect(sheet(page)).toBeVisible();
    });

    test("a sheet closed by its drag slides out as built and leaves no copy", async ({ page }) => {
      await open(page, mode);
      await openSort(page);

      await dragSheetDown(page);
      await expect(sheet(page)).toHaveCount(0);
      await page.waitForTimeout(400);

      expect(await leaves(page)).toEqual([]);
    });

    test("under reduced motion a sheet closed by Back leaves no copy", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await open(page, mode);
      await openSort(page);

      await press(page, "backButtonClicked");
      await expect(sheet(page)).toHaveCount(0);
      await page.waitForTimeout(400);

      expect(await leaves(page)).toEqual([]);
    });

    test("in lite graphics a sheet closed by Back leaves no copy", async ({ page }) => {
      await open(page, mode);
      await openSort(page);
      await html(page).evaluate((root) => root.classList.add("lite"));

      await press(page, "backButtonClicked");
      await expect(sheet(page)).toHaveCount(0);
      await page.waitForTimeout(400);

      expect(await leaves(page)).toEqual([]);
    });

    test("«Включить радар»: the spinner, then the tick for 900 ms, then the sheet closes with the toast; the toast leaves on a tap", async ({ page }) => {
      await open(page, mode, OWN_SEARCH);
      await chip(page, "filters").click();
      await expect(subscribeButton(page)).toBeEnabled();
      await settled(page);
      await expect(subscribeButton(page)).toHaveAttribute("data-phase", "idle");

      // When each phase began and when the sheet went, on the page's own clock.
      await page.evaluate(() => {
        const marks: Record<string, number> = {};
        (window as unknown as { __save: Record<string, number> }).__save = marks;
        const button = document.querySelector('[data-slot="bottom-sheet"] [data-slot="filters-footer"] [data-action="subscribe"]')!;
        const owner = button.closest<HTMLElement>('[data-slot="bottom-sheet"]')!;
        const note = () => {
          const phase = button.getAttribute("data-phase");
          if (phase !== null && !(phase in marks)) {
            marks[phase] = performance.now();
          }
          if (phase === "done" && !("tick" in marks) && button.querySelector('[data-slot="save-tick"]') !== null) {
            marks.tick = performance.now();
          }
          if (!("closed" in marks) && (!owner.isConnected || getComputedStyle(owner).display === "none")) {
            marks.closed = performance.now();
          }
        };
        new MutationObserver(note).observe(document.body, { childList: true, subtree: true, attributes: true });
      });
      await watchLeaves(page);

      await subscribeButton(page).click();
      await expect(appToast(page)).toBeVisible({ timeout: API_MS });
      await expect(sheet(page)).toHaveCount(0);

      const marks = await page.evaluate(() => (window as unknown as { __save: Record<string, number> }).__save);
      expect(Object.keys(marks)).toEqual(expect.arrayContaining(["busy", "done", "tick", "closed"]));
      expect(marks.busy).toBeLessThanOrEqual(marks.done);
      // The tick is on the button from the moment it is done, and the sheet stays for its 900 ms.
      expect(marks.tick - marks.done).toBeLessThan(100);
      expect(marks.closed - marks.done).toBeGreaterThanOrEqual(850);
      expect(marks.closed - marks.done).toBeLessThan(2_000);
      // Closed by the flow, not by a drag: the sheet left.
      expect((await leaves(page)).map((one) => one.kind)).toEqual(["backdrop", "sheet"]);

      await appToast(page).click();
      await expect(appToast(page)).toHaveCount(0);
      await expect.poll(async () => (await leaves(page)).length).toBe(3);
      expect((await leaves(page))[2]).toEqual({
        kind: "toast",
        slot: null,
        inert: true,
        hidden: "true",
        animations: [
          { duration: 180, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards", frame: { transform: "translateY(10px)", opacity: "0" } },
        ],
      });
      await expect(copies(page)).toHaveCount(0);
    });
  });
}
