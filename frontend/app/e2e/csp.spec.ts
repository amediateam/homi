import { expect, launchApp, test } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

/** The nonce policy of `proxy.ts` (WP-21, ADR-0020, `25` §3.10). */

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
    const response = page.waitForResponse((answer) => answer.request().resourceType() === "document" && answer.status() === 200);
    await launchApp(page);
    const headers = (await response).headers();
    expect(headers["content-security-policy"]).toContain("'strict-dynamic'");
    expect(headers["cache-control"]).toContain("no-store");
    expect(headers["x-frame-options"]).toBeUndefined();
    await expect(page.locator("html")).toHaveAttribute("data-session", "ready");

    // The feed's first card (WP-24): its photos are images too.
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
});
