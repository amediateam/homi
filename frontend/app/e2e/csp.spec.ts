import { readFileSync } from "node:fs";
import { join } from "node:path";

import { allowConsoleErrors, allowCspViolations, expect, launchApp, stubMedia, test } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

/** The nonce policy of `proxy.ts` (WP-21, ADR-0020, `25` §3.10) and the policy of MapLibre's worker (WP-27). */

/** The version in the worker's address, `public/maplibre/<version>/` (`scripts/copy-maplibre-worker.mjs`). */
const mapLibreVersion = () =>
  (JSON.parse(readFileSync(join(test.info().project.testDir, "../node_modules/maplibre-gl/package.json"), "utf8")) as { version: string }).version;

const directives = (policy: string): Record<string, string[]> =>
  Object.fromEntries(policy.split(";").map((part) => part.trim().split(/\s+/)).filter(([name]) => name).map(([name, ...sources]) => [name, sources]));

async function watchViolations(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.assign(window, { __violations: seen });
    document.addEventListener("securitypolicyviolation", (event) => seen.push(`${event.violatedDirective} ${event.blockedURI}`));
  });
  return () => page.evaluate(() => [...(window as unknown as { __violations: string[] }).__violations]);
}

test.describe("content security policy", () => {
  test("launch, soft navigation and an image raise no violation", async ({ page }) => {
    const violations = await watchViolations(page);
    // The card photos come from the stub CDN, which CI cannot resolve: answered here, they load as on a developer machine.
    const photos = await stubMedia(page);
    const response = page.waitForResponse((answer) => answer.request().resourceType() === "document" && answer.status() === 200);
    await launchApp(page);
    const headers = (await response).headers();
    expect(headers["content-security-policy"]).toContain("'strict-dynamic'");
    expect(headers["cache-control"]).toContain("no-store");
    expect(headers["x-frame-options"]).toBeUndefined();
    await expect(page.locator("html")).toHaveAttribute("data-session", "ready");

    // The feed's first card (WP-24): its photos are images too.
    await expect.poll(() => photos.length, { message: "no stub photo was asked for: is NEXT_PUBLIC_CDN_URL in img-src?" }).toBeGreaterThan(0);
    await page.locator("article[data-listing] a").filter({ visible: true }).first().click();
    await expect(page.locator('[data-route="listing"]').filter({ visible: true })).toBeVisible();
    await page.evaluate(async () => {
      const image = new Image();
      image.src = "/brand/logo.svg";
      document.body.append(image);
      await image.decode();
    });

    expect(await violations()).toEqual([]);
  });

  test("an inline script injected into the document without the nonce is blocked", async ({ page }) => {
    allowCspViolations(test.info());
    allowConsoleErrors(test.info(), /^Executing inline script violates the following Content Security Policy directive/);
    // The feed's photos: without an answer of their own they would go to the local CDN's host.
    await stubMedia(page);
    const violations = await watchViolations(page);
    await page.route("**/ru", async (route) => {
      if (route.request().resourceType() !== "document") {
        await route.fallback();
        return;
      }
      const response = await route.fetch();
      const html = (await response.text()).replace(/<head[^>]*>/, (head) => `${head}<script>window.__injected = true</script>`);
      expect(html).toContain("window.__injected");
      await route.fulfill({ response, body: html });
    });
    // Straight to /ru: a route handler is not called again for the target of a redirect.
    await launchApp(page, { path: "/ru" });
    await expect(page.locator("html")).toHaveAttribute("data-session", "ready");

    expect(await page.evaluate(() => (window as unknown as { __injected?: boolean }).__injected)).toBeUndefined();
    expect((await violations()).some((entry) => entry.startsWith("script-src"))).toBe(true);
  });

  test("MapLibre's worker has its own policy: its shared module and the page's tile hosts, cached for a year", async ({ page }) => {
    // A same-origin worker does not inherit the page's policy, and it fetches the tiles of a tile template itself.
    const app = await page.goto("/ru");
    const worker = await page.goto(`/maplibre/${mapLibreVersion()}/maplibre-gl-worker.mjs`);
    expect(worker?.status()).toBe(200);
    const headers = worker?.headers() ?? {};
    const policy = directives(headers["content-security-policy"] ?? "");
    expect(policy["default-src"]).toEqual(["'none'"]);
    expect(policy["script-src"]).toEqual(["'self'"]);
    expect(headers["content-security-policy"]).not.toContain("'nonce-");
    // `CSP_TILE_HOSTS` of the end-to-end server (`playwright.config.ts`), the same hosts as in the page's connect-src.
    expect(policy["connect-src"]).toContain("https://tile.openstreetmap.org");
    const appPolicy = directives(app?.headers()["content-security-policy"] ?? "");
    expect(appPolicy["connect-src"]).toEqual(expect.arrayContaining(policy["connect-src"] ?? []));
    // Next.js's own revalidated cache: the proxy sets none, so a 404 of a missing version is not kept for a year.
    expect(headers["cache-control"]).toBe("public, max-age=0");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["content-type"]).toContain("javascript");
  });
});
