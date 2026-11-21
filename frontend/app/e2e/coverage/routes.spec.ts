import { expect, launchApp, setScenario, stubMedia, test } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

import { PAGES, pageName } from "../support/pages";

/**
 * Every address loaded directly (WP-33 `coverage/routes.spec.ts`): it shows its own content, and Back goes to its
 * parent (`parentOf`, WP-20), or is hidden on a root tab and a gate. Opening each layer over its base is the feature
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
        await launchApp(tab, { path: page.path });
        await expect(tab.locator(page.shows).filter({ visible: true }).first()).toBeVisible();
        if (page.parent === null) {
          await expect.poll(() => backVisible(tab)).toBe(false);
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
