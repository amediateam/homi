import { expect, launchApp, setScenario, stubMedia, test } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

import { pageName, PAGES, SHOWS_TIMEOUT_MS } from "../support/pages";

/**
 * Every address loaded directly (WP-33 `coverage/routes.spec.ts`): it shows its own content, and Back goes to its
 * parent (`parentOf`, WP-20), or is hidden, once the app has decided it, on a root tab and a gate. Opening each layer over its base is the feature
 * specs' (`back`, `listing-open`, `filters`, `radars`, `owner-*`), and so is the tab bar: a pushed page or a layer
 * covers it, so a tab press always starts from a tab (`shell.spec.ts`). No mode in a title: both projects run it all.
 */
const telegram = (page: Page) => page.evaluateHandle(() => (window as unknown as { Telegram: { WebApp: { BackButton: { isVisible: boolean } } } }).Telegram.WebApp);
const backVisible = async (page: Page) => (await telegram(page)).evaluate((app) => app.BackButton.isVisible);
const pressBack = (page: Page) => page.evaluate(() => (window as unknown as { __homiFakeTelegram: { emit(type: string): void } }).__homiFakeTelegram.emit("backButtonClicked"));

/** The address of `path` under the project's locale, as the location shows it. */
const address = (path: string) => new RegExp(`/ru${path === "/" ? "" : path.replace(/[?]/g, "\\?")}$`);

test.describe("every address loaded directly", () => {
  for (const page of PAGES) {
    test(
      `${pageName(page)} shows its content; Back ${page.parent === null ? "is hidden" : `goes to ${page.parent}`}`,
      { annotation: page.screens.map((screen) => ({ type: "screen", description: screen })) },
      async ({ page: tab }) => {
        await stubMedia(tab);
        await setScenario(tab, page.scenario ?? null);
        const app = await launchApp(tab, { path: page.path });
        await expect(tab.locator(page.shows).filter({ visible: true }).first()).toBeVisible({ timeout: SHOWS_TIMEOUT_MS });
        if (page.parent === null) {
          // The fake starts with Back hidden, so its state proves nothing until the app has decided: `TelegramButtons`
          // records `BackButton.hide` once it has run. A root at depth 0 never shows Back, not even for a moment.
          const backCalls = async () => (await app.calls()).map((call) => call.member).filter((member) => member === "BackButton.show" || member === "BackButton.hide");
          await expect.poll(async () => (await backCalls()).includes("BackButton.hide")).toBe(true);
          expect(await backCalls()).not.toContain("BackButton.show");
          expect(await backVisible(tab)).toBe(false);
          return;
        }
        await expect.poll(() => backVisible(tab)).toBe(true);
        await setScenario(tab, null);
        await pressBack(tab);
        await expect(tab).toHaveURL(address(page.parent));
      },
    );
  }
});
