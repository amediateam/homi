import { expect, launchApp, test } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

/**
 * The crash screen (WP-23, SCR-045): the dev gallery's "throw" button raises a render error, the boundary of the
 * `[locale]` segment (`[locale]/error.tsx`) shows the crash screen in the address's locale in place of the page, and
 * «Обновить» reloads the document, which starts the launch afresh. The address's locale survives sign-in only when
 * `me.locale` agrees (the locale guard, WP-21), so the uz runs use the stub user of the `uz` scenario (WP-11), set
 * with the cookie WP-22 forwards. The report itself is asserted by the unit tests (`recentErrors()` is module memory).
 */

const TEXTS = {
  ru: { title: "Что-то пошло не так", text: "Ошибка записана. Обновите приложение — обычно это помогает.", reload: "Обновить" },
  uz: { title: "Nimadir xato ketdi", text: "Xato yozib olindi. Ilovani yangilang — odatda shu yordam beradi.", reload: "Yangilash" },
} as const;

const crash = (page: Page) => page.locator('[data-route="error"]').filter({ visible: true });
const gallery = (page: Page) => page.getByTestId("gallery-throw").filter({ visible: true });

/** Launches the gallery in `locale` (the user's saved locale follows the stub scenario) and waits for the session. */
async function openGallery(page: Page, mode: "cookie" | "header", locale: keyof typeof TEXTS) {
  if (locale !== "ru") {
    await page.context().addCookies([{ name: "homi_stub_scenario", value: locale, url: test.info().project.use.baseURL }]);
  }
  await launchApp(page, { mode, locale, path: `/${locale}/dev/ui` });
  await expect(page.locator("html")).toHaveAttribute("data-session", "ready");
  await expect(page).toHaveURL(new RegExp(`/${locale}/dev/ui$`));
  await expect(gallery(page)).toBeVisible();
}

/**
 * Cookie mode in each locale; header mode too, since the reload loses the token it keeps in memory (DEC-44) and the
 * launch after it must sign in again.
 */
for (const [mode, locales] of [
  ["cookie", ["ru", "uz"]],
  ["header", ["ru", "uz"]],
] as const) {
  test.describe(`crash screen (${mode} mode)`, () => {
    for (const locale of locales) {
      test(`a render error shows the crash screen in ${locale}, and «${TEXTS[locale].reload}» reloads`, async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await openGallery(page, mode, locale);

        await gallery(page).click();

        await expect(crash(page)).toBeVisible();
        await expect(crash(page).getByRole("alert")).toBeVisible();
        await expect(crash(page)).toContainText(TEXTS[locale].title);
        await expect(crash(page)).toContainText(TEXTS[locale].text);
        await expect(crash(page).getByRole("button")).toHaveCount(1);
        await expect(gallery(page)).toHaveCount(0);
        expect(await page.locator("html").getAttribute("lang")).toBe(locale);
        // React rethrows nothing to the page: the boundary caught the error.
        expect(errors).toEqual([]);

        // A mark on the window is gone after a reload, not after a soft navigation (both fire `framenavigated`).
        await page.evaluate(() => Object.assign(window, { __beforeReload: true }));
        const reloaded = page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame());
        await crash(page).getByRole("button", { name: TEXTS[locale].reload }).click();
        await reloaded;
        await expect.poll(() => page.evaluate(() => "__beforeReload" in window)).toBe(false);

        await expect(page).toHaveURL(new RegExp(`/${locale}/dev/ui$`));
        await expect(page.locator("html")).toHaveAttribute("data-session", "ready");
        await expect(gallery(page)).toBeVisible();
        await expect(crash(page)).toHaveCount(0);
      });
    }
  });
}
