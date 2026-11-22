import brandWords from "@homi/i18n/brand-words.json";
import { expect, launchApp, setScenario, stubMedia, test } from "@homi/testing/playwright";
import type { Response } from "@playwright/test";

import { LISTING } from "../support/pages";

/**
 * No legacy brand word reaches the browser (WP-33 `coverage/brand.spec.ts`, DEC-40, `25` §2 rule 5): the document and
 * every answer of the app's own origin a launch loads — scripts, styles, SVG images, the RSC payloads that carry the
 * messages, the `/bff` answers with the listings' own text — in ru, uz and en, for the feed, a listing, the map, the
 * radar tab and the owner list. The patterns are `brand-words.json` of `@homi/i18n`; the build itself is
 * `check-bundle.mjs`'s.
 */
const BRAND = brandWords.patterns.map((pattern) => new RegExp(pattern, "iu"));
const TEXT = /javascript|json|html|css|text\/x-component|text\/plain|image\/svg\+xml/;

/**
 * The addresses scanned, each a launch of its own, and what shows once the address's data is there, in whichever state
 * the stub gives it: in header mode the first document has no session and the data comes through `/bff`.
 */
const ADDRESSES = [
  { path: "/", content: "[data-card]" },
  { path: `/listing/${LISTING}`, content: '[data-listing-state="loaded"]' },
  { path: "/map", content: "[data-marker]" },
  { path: "/radars", content: '[data-radar-tile], [data-radar-state="empty"], [data-radar-state="soon"]' },
  { path: "/settings/owner", content: "[data-owner-card], [data-owner-list-empty]" },
] as const;

/** The first data of a launch. */
const API_MS = 20_000;

// A pass over the brand layer, not a proof of screens: it names none.
test.describe("brand", () => {
  for (const locale of ["ru", "uz", "en"] as const) {
    for (const address of ADDRESSES) {
      test(`${locale} ${address.path}: the document and every answer of the app's origin hold no legacy brand word`, async ({ page }) => {
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
        await launchApp(page, { path: `/${locale}${address.path === "/" ? "" : address.path}`, locale });
        await expect(page.locator("html")).toHaveAttribute("lang", locale === "uz" ? /^uz/ : locale);
        await expect(page.locator(address.content).filter({ visible: true }).first()).toBeVisible({ timeout: API_MS });
        await page.waitForLoadState("networkidle");

        const answers = (await Promise.all(bodies)).filter((body) => body !== null);
        expect(answers.length).toBeGreaterThan(3);
        const hits = answers.flatMap(({ url, text }) => BRAND.filter((pattern) => pattern.test(text)).map((pattern) => `${new URL(url).pathname}: ${pattern}`));
        expect(hits).toEqual([]);
      });
    }
  }
});
