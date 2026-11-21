import { expect, launchApp, type LaunchAppOptions, stubMedia, test as base } from "@homi/testing/playwright";
import type { Page } from "@playwright/test";

/**
 * The settings tab (WP-31, SCR-032 … SCR-038, SCR-048) on stubs, in cookie mode and header mode: the groups and values
 * of `settings/default.json`; each row opens its page and Telegram's Back returns; a theme pick re-colours the app at
 * once; quiet-hour and digest picks show in their rows (the stub answers a `PATCH` with the fixture and the sent keys,
 * stores nothing); a direct load of a page closes to the list; «Вид карточек» with its scenarios `card_rich` and
 * `card_sample_unsent`; and without the SDK every page shows the fallback cross (WP-36).
 */

const test = base.extend<{ photos: readonly string[] }>({
  photos: [async ({ page }, use) => use(await stubMedia(page)), { auto: true }],
});

interface Fake {
  emit(eventType: string): void;
}

type Mode = "cookie" | "header";
const API_MS = 20_000;

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const html = (page: Page) => page.locator("html");
const row = (page: Page, id: string) => visible(page, `[data-route="settings"] [data-settings-row="${id}"]`);
const value = (page: Page, id: string) => row(page, id).locator("[data-settings-value]");
const subPage = (page: Page, name: string) => visible(page, `[data-route="settings/${name}"]`);
const radio = (page: Page, name: string) => page.getByRole("radio", { name, exact: true });
const press = (page: Page, eventType: "backButtonClicked") =>
  page.evaluate((type) => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.emit(type), eventType);
const address = (page: Page) => new URL(page.url()).pathname;

async function stubScenario(page: Page, scenario: string): Promise<void> {
  await page.context().addCookies([{ name: "homi_stub_scenario", value: scenario, url: test.info().project.use.baseURL }]);
}

/** Launches the app on `path` and waits for the session and the settings list. */
async function open(page: Page, mode: Mode, path = "/settings", options: Omit<LaunchAppOptions, "mode" | "path"> = {}): Promise<void> {
  await launchApp(page, { mode, path, ...options });
  await expect(html(page)).toHaveAttribute("data-session", "ready", { timeout: API_MS });
  await expect(row(page, "theme")).toBeVisible({ timeout: API_MS });
}

/** The page is up, with its title, and the list stays below it. */
async function onPage(page: Page, name: string, title: string): Promise<void> {
  await expect(subPage(page, name)).toBeVisible();
  await expect(page.getByRole("region", { name: title })).toBeVisible();
  await expect(page.locator('[data-route="settings"]')).toBeAttached();
}

for (const mode of ["cookie", "header"] as const) {
  test.describe(`settings (${mode} mode)`, () => {
    test("the groups and values of the stub; every row opens its page and Back returns to the list", async ({ page }) => {
      await open(page, mode);

      // The stub hides listings and blocks authors (`hidden/default.json`), so «Лента» shows as the fifth group.
      await expect(visible(page, "[data-settings-group]")).toHaveCount(6);
      await expect(value(page, "hidden")).toHaveText(/^\d+$/);
      await expect(value(page, "theme")).toHaveText("Как в Telegram");
      await expect(value(page, "language")).toHaveText("Русский");
      await expect(value(page, "currency")).toHaveText("Доллары");
      await expect(value(page, "quiet-hours")).toHaveText("23–08");
      await expect(value(page, "digest")).toHaveText("9 и 19");
      await expect(value(page, "cards")).toHaveText("Классический");

      const pages = [
        ["theme", "Тема"],
        ["language", "Язык"],
        ["currency", "Валюта"],
        ["quiet-hours", "Тихие часы"],
        ["digest", "Время подборок"],
        ["cards", "Вид карточек"],
      ] as const;
      for (const [name, title] of pages) {
        await row(page, name).click();
        await onPage(page, name, title);
        expect(address(page)).toBe(`/ru/settings/${name}`);
        await press(page, "backButtonClicked");
        await expect(subPage(page, name)).toHaveCount(0);
        expect(address(page)).toBe("/ru/settings");
      }
    });

    test("a theme pick re-colours the app at once and the row follows; quiet hours and digest show in their rows", async ({ page }) => {
      await open(page, mode);

      await row(page, "theme").click();
      await onPage(page, "theme", "Тема");
      await radio(page, "Тёмная").click();
      await expect(html(page)).toHaveAttribute("data-scheme", "dark");
      await expect(radio(page, "Тёмная")).toHaveAttribute("aria-checked", "true");
      await press(page, "backButtonClicked");
      await expect(value(page, "theme")).toHaveText("Тёмная");

      await row(page, "quiet-hours").click();
      await onPage(page, "quiet-hours", "Тихие часы");
      await radio(page, "Выкл").click();
      await expect(radio(page, "Выкл")).toHaveAttribute("aria-checked", "true");
      await press(page, "backButtonClicked");
      await expect(value(page, "quiet-hours")).toHaveText("Выкл");

      await row(page, "digest").click();
      await onPage(page, "digest", "Время подборок");
      await expect(subPage(page, "digest")).toContainText("Время — ташкентское.");
      await radio(page, "12 и 20").click();
      await expect(radio(page, "12 и 20")).toHaveAttribute("aria-checked", "true");
      await press(page, "backButtonClicked");
      await expect(value(page, "digest")).toHaveText("12 и 20");
    });

    test("a direct load of /settings/theme closes to the list", async ({ page }) => {
      await launchApp(page, { mode, path: "/settings/theme" });
      await expect(html(page)).toHaveAttribute("data-session", "ready", { timeout: API_MS });
      await onPage(page, "theme", "Тема");

      await press(page, "backButtonClicked");
      await expect(subPage(page, "theme")).toHaveCount(0);
      await expect.poll(() => address(page)).toBe("/ru/settings");
      await expect(row(page, "theme")).toBeVisible();
    });

    test("«Вид карточек»: a pick shows in the row, the sample lands in the chat", async ({ page }) => {
      await open(page, mode);
      await row(page, "cards").click();
      await onPage(page, "cards", "Вид карточек");
      await expect(radio(page, "Классический").or(page.locator('[data-card-style-option="classic"]'))).toHaveAttribute("aria-checked", "true");

      const actions: string[] = [];
      page.on("request", (request) => {
        if (request.method() === "POST" && request.headers()["next-action"] !== undefined) {
          actions.push(request.postData() ?? "");
        }
      });
      await page.locator('[data-card-style-option="rich"]').click();
      await expect(page.locator('[data-card-style-option="rich"]')).toHaveAttribute("aria-checked", "true");
      // The settings Server Action carries the pick; the app server sends it as `PATCH /settings {card_style}`.
      await expect.poll(() => actions.some((body) => body.includes('"card_style":"rich"'))).toBe(true);
      await page.locator('[data-action="card-sample"]').click();
      await expect(page.locator('[data-card-sample="sent"]')).toHaveText("Пример — в чате с ботомЧтобы посмотреть, сверните приложение — смахните его вниз");

      await press(page, "backButtonClicked");
      await expect(value(page, "cards")).toHaveText("Новый");
      // The result outlives the page until the tab goes (LB-APP-053).
      await row(page, "cards").click();
      await expect(page.locator('[data-card-sample="sent"]')).toBeVisible();
    });

    test("the scenarios card_rich and card_sample_unsent: «Новый» in the row, the failure line", async ({ page }) => {
      await stubScenario(page, "card_rich");
      await open(page, mode);
      await expect(value(page, "cards")).toHaveText("Новый");

      await stubScenario(page, "card_sample_unsent");
      await row(page, "cards").click();
      await onPage(page, "cards", "Вид карточек");
      await page.locator('[data-action="card-sample"]').click();
      await expect(page.locator('[data-card-sample="failed"]')).toHaveText("Пример не отправился — вид всё равно сохранён");
    });
  });
}

test.describe("settings without the Telegram SDK", () => {
  test("each of the eight pages shows the fallback cross, which closes it to the list", async ({ page }) => {
    test.setTimeout(120_000);
    const pages = ["theme", "graphics", "language", "currency", "quiet-hours", "digest", "cards", "hidden"];
    for (const name of pages) {
      await launchApp(page, { sdk: false, path: `/settings/${name}` });
      await expect(html(page)).toHaveAttribute("data-session", "ready", { timeout: API_MS });
      await expect(subPage(page, name)).toBeVisible();
      const cross = visible(page, `[data-route="settings/${name}"] [data-fallback-close]`);
      await expect(cross).toHaveAttribute("aria-label", "Закрыть");
      await cross.click();
      await expect(subPage(page, name)).toHaveCount(0);
      await expect.poll(() => address(page)).toBe("/ru/settings");
    }
  });
});
