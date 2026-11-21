import brandWords from "@homi/i18n/brand-words.json";
import { expect, launchApp, setScenario, stubMedia, test } from "@homi/testing/playwright";
import type { Response } from "@playwright/test";

/**
 * No legacy brand word reaches the browser (WP-33 `coverage/brand.spec.ts`, DEC-40, `25` §2 rule 5): the document and
 * every answer of the app's own origin a launch loads — scripts, styles, the RSC payloads that carry the messages —
 * in ru, uz and en. The patterns are `brand-words.json` of `@homi/i18n`; the build itself is `check-bundle.mjs`'s.
 */
const BRAND = brandWords.patterns.map((pattern) => new RegExp(pattern, "iu"));
const TEXT = /javascript|json|html|css|text\/x-component|text\/plain/;

test.describe("brand", { annotation: [{ type: "screen", description: "SCR-006" }, { type: "screen", description: "SCR-007" }] }, () => {
  for (const locale of ["ru", "uz", "en"] as const) {
    test(`${locale}: the document and every answer of the app's origin hold no legacy brand word`, async ({ page }) => {
      await stubMedia(page);
      // The stub profile's saved language decides the address (the locale guard): `uz` and `en` are profiles of their own.
      await setScenario(page, locale === "ru" ? null : locale);
      const bodies: Promise<{ url: string; text: string } | null>[] = [];
      const origin = new URL(test.info().project.use.baseURL ?? "http://localhost:3001").origin;
      page.on("response", (response: Response) => {
        if (new URL(response.url()).origin !== origin || !TEXT.test(response.headers()["content-type"] ?? "")) {
          return;
        }
        bodies.push(
          response
            .text()
            .then((text) => ({ url: response.url(), text }))
            .catch(() => null),
        );
      });
      await launchApp(page, { path: `/${locale}`, locale });
      await expect(page.locator("html")).toHaveAttribute("lang", locale === "uz" ? /^uz/ : locale);
      await expect(page.locator("[data-card]").filter({ visible: true }).first()).toBeVisible();
      await page.waitForLoadState("networkidle");

      const answers = (await Promise.all(bodies)).filter((body) => body !== null);
      expect(answers.length).toBeGreaterThan(3);
      const hits = answers.flatMap(({ url, text }) => BRAND.filter((pattern) => pattern.test(text)).map((pattern) => `${new URL(url).pathname}: ${pattern}`));
      expect(hits).toEqual([]);
    });
  }
});
