import { getMessages, type MessageTree } from "@homi/i18n";
import brandWords from "@homi/i18n/brand-words.json";
import { expect, launchApp, setScenario, stubMedia, test } from "@homi/testing/playwright";

import { PAGES, pageName } from "../support/pages";

/**
 * Every address rendered in the project's locales and theme (WP-33 `coverage/render.spec.ts`, `@render`): no raw key
 * path in the text, no legacy brand word, and the bottom bar inside the viewport. A missing-message report fails any
 * test already (the session-mode checks of `@homi/testing`). `miniapp-cookie` and `miniapp-header` render `ru` in the
 * light theme; the manual run's `miniapp-locales` renders `uz` and `en` (the stub profiles `uz` and `en`), and
 * `miniapp-dark` the dark theme.
 */
function keyPaths(tree: MessageTree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) => (typeof value === "string" ? [`${prefix}${key}`] : keyPaths(value, `${prefix}${key}.`)));
}

/** The catalogue's key paths with a dot: a token of the page's text that is one of them is a key shown raw. */
const KEYS = new Set(keyPaths(getMessages("ru") as unknown as MessageTree).filter((path) => path.includes(".")));
const BRAND = brandWords.patterns.map((pattern) => new RegExp(pattern, "iu"));

/** The locales a project renders (`metadata.locales` of `frontend/playwright.config.ts`); `ru` by default. */
const localesOf = () => (test.info().project.metadata as { locales?: string[] }).locales ?? ["ru"];

test.describe("render @render", () => {
  for (const page of PAGES) {
    test(`${pageName(page)}: no raw key, no legacy brand word, the bottom bar in the viewport`, { annotation: page.screens.map((screen) => ({ type: "screen", description: screen })) }, async ({ page: first }) => {
      for (const [index, locale] of localesOf().entries()) {
        // Each locale is a launch of its own: a page carries one fake Telegram.
        const tab = index === 0 ? first : await first.context().newPage();
        await stubMedia(tab);
        // The stub profile's saved language decides the address (the locale guard, WP-21): `uz` and `en` are profiles
        // of their own. A page that needs a scenario of its own keeps the stub's `ru` profile and is checked as rendered.
        const profile = locale === "ru" ? null : locale;
        await setScenario(tab, page.scenario ?? profile);
        await launchApp(tab, { path: `/${locale}${page.path === "/" ? "" : page.path}`, locale });
        await expect(tab.locator(page.shows).filter({ visible: true }).first()).toBeVisible();
        if (page.scenario === undefined) {
          await expect(tab.locator("html")).toHaveAttribute("lang", locale === "uz" ? /^uz/ : locale);
        }

        const text = await tab.evaluate(() => document.body.innerText);
        const raw = (text.match(/[A-Za-z][\w]*(?:\.[\w]+)+/g) ?? []).filter((token) => KEYS.has(token));
        expect(raw, `${locale} ${page.path}: raw key paths`).toEqual([]);
        expect(
          BRAND.filter((pattern) => pattern.test(text)).map(String),
          `${locale} ${page.path}: legacy brand words`,
        ).toEqual([]);

        const viewport = tab.viewportSize();
        for (const bar of await tab.locator("[data-tabbar], [data-cta]").filter({ visible: true }).all()) {
          const box = await bar.boundingBox();
          expect(box && viewport ? box.y + box.height : 0, `${locale} ${page.path}: the bottom bar ends inside the viewport`).toBeLessThanOrEqual((viewport?.height ?? 0) + 1);
        }
      }
    });
  }
});
