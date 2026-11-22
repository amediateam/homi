import { expect, launchApp, stubMedia, test as base, type LaunchedApp } from "@homi/testing/playwright";
import type { Locator, Page, Request } from "@playwright/test";

/**
 * The city sheets of WP-25 (SCR-017) against the API on stubs, whose reference data has three cities (Tashkent with
 * districts, zones and medians, the Tashkent region, Andijan with none) and whose user lives in Tashkent: the header
 * pick from the feed's city chip (`/city`), and the nested picker of the full filters sheet (`pick=city`), closed
 * without «Показать» and applied with it. The second nested case also proves that the form's `bfcacheId` key survives
 * the shallow `pushState` of `pick=city`: the picked city is still in the draft after the layer's Back, and it is the
 * city «Показать» applies and saves. A save is the settings Server Action (`useAction`), which in header mode carries
 * the token kept in memory; the `PATCH /settings` itself is sent by the app server and its body is covered by the unit
 * test of `updateSettings`. Every case runs in both modes: the picks call that action. The full run shares one stub
 * user's API limit (120 a minute, KI-32). Every photo of the feed is answered by `stubMedia`.
 */

const test = base.extend<{ photos: readonly string[] }>({
  /** The stub photos answered so far: every test answers them itself, as CI has no `cdn.homi.loc`. */
  photos: [async ({ page }, use) => use(await stubMedia(page)), { auto: true }],
});

interface Fake {
  webApp: { BackButton: { isVisible: boolean } };
  emit(eventType: string): void;
}

type Mode = "cookie" | "header";

/** A drawn area inside Tashkent: what a city change must clear (BR-APP-009). */
const POLYGON = "41.31100,69.24000;41.32000,69.26000;41.30000,69.27000";

/**
 * The visible copy only: with `cacheComponents` the router keeps earlier routes hidden in `<Activity>`
 * (`preserving-ui-state.md`), so the same element can be in the document twice.
 */
const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const route = (page: Page, name: string) => visible(page, `[data-route="${name}"]`);
const html = (page: Page) => page.locator("html");
const chip = (page: Page, key: string) => visible(page, `[data-topbar="search-list"] [data-chip="${key}"]`);
const press = (page: Page, eventType: "backButtonClicked") =>
  page.evaluate((type) => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.emit(type), eventType);
const backVisible = (page: Page) =>
  page.evaluate(() => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.webApp.BackButton.isVisible);
/** The search keys of the current address. */
const searchOf = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams);
const savedCity = (page: Page) => page.evaluate(() => window.localStorage.getItem("homi-city"));

/** The header city sheet in `@sheet`, over the feed. */
const citySheet = (page: Page) => visible(page, '[data-slot="bottom-sheet"] [data-route="city"][data-layer="sheet"]');
/** The content of the full filters sheet in `@sheet`; its footer lies outside, in the sheet's own frame. */
const filtersContent = (page: Page) => visible(page, '[data-slot="bottom-sheet"] [data-route="filters"][data-layer="sheet"]');
/** The city field of the full sheet (section 2, `CitySection`): «Город» and the draft's city. */
const cityField = (page: Page) => filtersContent(page).locator('[data-section="city"]').getByRole("button");
/** The nested picker over the filters sheet: a portal, so never in the server HTML. */
const nestedPicker = (page: Page) => visible(page, '[data-slot="city-picker-nested"]');
const cityRow = (sheet: Locator, code: string) => sheet.locator(`[data-city="${code}"]`);
/**
 * «Показать …» of the full sheet (`FiltersFooter`, `data-action="apply"`): «Показать» while the count is unknown,
 * «Показать N», or «Ничего нет», which still applies.
 */
const showButton = (page: Page) => visible(page, '[data-slot="bottom-sheet"] [data-action="apply"]');

/** A Server Action call: a POST to the page's address carrying the `Next-Action` header. */
const isServerAction = (request: Request) => request.method() === "POST" && request.headers()["next-action"] !== undefined;
const isCount = (request: Request) => new URL(request.url()).pathname === "/bff/listings/count";

/** Collects the page's requests that `match` from now on. */
function recordRequests(page: Page, match: (request: Request) => boolean): Request[] {
  const seen: Request[] = [];
  page.on("request", (request) => {
    if (match(request)) {
      seen.push(request);
    }
  });
  return seen;
}

/** Light and medium impacts the page asked the fake Telegram for so far (TMA-025). */
async function impacts(app: LaunchedApp, style: "light" | "medium"): Promise<number> {
  return (await app.calls()).filter((call) => call.member === "HapticFeedback.impactOccurred" && call.args[0] === style).length;
}

/** Launches the app as the bot does, in a session mode, and waits for the session and the feed. */
async function open(page: Page, mode: Mode, path = "/"): Promise<LaunchedApp> {
  const app = await launchApp(page, { mode, path });
  await expect(html(page)).toHaveAttribute("data-session", "ready");
  await expect(route(page, "feed")).toBeVisible();
  return app;
}

/** The one settings Server Action saved `city`; header mode has no cookie, so the token travels in its arguments. */
function expectCitySaved(action: Request, city: string, mode: Mode): void {
  const body = action.postData() ?? "";
  expect(body).toContain(`{"city":"${city}"}`);
  expect(body.includes('"token"')).toBe(mode === "header");
}

/** From the feed: the filters chip opens the full sheet, the city field the nested picker over it. */
async function openNestedPicker(page: Page): Promise<void> {
  await chip(page, "filters").click();
  await expect(page).toHaveURL(/\/ru\/filters\?city=tashkent$/);
  await expect(filtersContent(page)).toBeVisible();
  await expect(cityField(page)).toContainText("Ташкент");

  await cityField(page).click();
  await expect(page).toHaveURL(/\/ru\/filters\?city=tashkent&pick=city$/);
  await expect(nestedPicker(page)).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Город" })).toBeVisible();
  await expect(cityRow(nestedPicker(page), "tashkent")).toHaveAttribute("aria-pressed", "true");
  await expect(cityRow(nestedPicker(page), "andijan")).toHaveAttribute("aria-pressed", "false");
}

for (const mode of ["cookie", "header"] as const) {
  test.describe(`city (${mode} mode)`, { annotation: [{ type: "screen", description: "SCR-017" }] }, () => {
    test("header chip: a pick lands on the feed of that city, saves it once, and drops districts and the polygon", async ({ page }) => {
      const app = await open(page, mode, `/?districts=chilonzor&polygon=${POLYGON}&rooms_min=2`);
      await expect(chip(page, "city")).toHaveText("Ташкент");
      const actions = recordRequests(page, isServerAction);

      await chip(page, "city").click();
      await expect(page).toHaveURL(/\/ru\/city\?/);
      expect(searchOf(page)).toEqual({ city: "tashkent", districts: "chilonzor", rooms_min: "2", polygon: POLYGON });
      await expect(citySheet(page)).toBeVisible();
      await expect(page.getByRole("dialog", { name: "Город" })).toBeVisible();
      await expect(route(page, "feed")).toBeAttached();
      await expect(cityRow(citySheet(page), "tashkent")).toHaveAttribute("aria-pressed", "true");
      await expect(cityRow(citySheet(page), "andijan")).toContainText("Андижан");
      const taps = await impacts(app, "light");

      await cityRow(citySheet(page), "andijan").click();

      // One navigation: the sheet closed, then the feed of the new search replaced the entry below it.
      await expect(page).toHaveURL(/\/ru\?city=andijan&rooms_min=2$/);
      expect(searchOf(page)).toEqual({ city: "andijan", rooms_min: "2" });
      await expect(route(page, "feed")).toBeVisible();
      await expect(visible(page, "[data-layer]")).toHaveCount(0);
      await expect(chip(page, "city")).toHaveText("Андижан");
      await expect(chip(page, "area")).toHaveCount(0);
      await expect.poll(() => backVisible(page)).toBe(false);
      // The row's light impact, and none of the sheet's own.
      expect(await impacts(app, "light")).toBe(taps + 1);

      await expect.poll(() => actions.length).toBe(1);
      expectCitySaved(actions[0], "andijan", mode);
      expect(await savedCity(page)).toBe("andijan");
    });

    test("filters sheet: a nested pick changes the draft only; closing without «Показать» leaves the city as it was", { annotation: [{ type: "screen", description: "SCR-014" }] }, async ({ page }) => {
      await open(page, mode);
      const actions = recordRequests(page, isServerAction);
      await openNestedPicker(page);

      await cityRow(nestedPicker(page), "andijan").click();

      // The layer's Back: the picker is gone, the filters sheet stays with the picked city in its draft.
      await expect(page).toHaveURL(/\/ru\/filters\?city=tashkent$/);
      await expect(nestedPicker(page)).toHaveCount(0);
      await expect(filtersContent(page)).toBeVisible();
      await expect(cityField(page)).toContainText("Андижан");

      await press(page, "backButtonClicked");

      await expect(page).toHaveURL(/\/ru$/);
      await expect(visible(page, "[data-layer]")).toHaveCount(0);
      await expect(chip(page, "city")).toHaveText("Ташкент");
      expect(actions).toEqual([]);
      expect(await savedCity(page)).toBe("tashkent");
    });

    test("filters sheet: a nested pick, then «Показать», applies and saves the picked city", { annotation: [{ type: "screen", description: "SCR-014" }] }, async ({ page }) => {
      const app = await open(page, mode);
      const actions = recordRequests(page, isServerAction);
      const counts = recordRequests(page, isCount);
      await openNestedPicker(page);

      await cityRow(nestedPicker(page), "andijan").click();

      await expect(page).toHaveURL(/\/ru\/filters\?city=tashkent$/);
      await expect(nestedPicker(page)).toHaveCount(0);
      // The form was not re-created by the layer's Back (`bfcacheId` kept): the draft still holds Andijan, and the
      // live count follows it.
      await expect(cityField(page)).toContainText("Андижан");
      await expect.poll(() => counts.some((request) => new URL(request.url()).searchParams.get("city") === "andijan")).toBe(true);
      expect(actions).toEqual([]);
      const medium = await impacts(app, "medium");

      await showButton(page).click();

      await expect(page).toHaveURL(/\/ru\?city=andijan$/);
      await expect(route(page, "feed")).toBeVisible();
      await expect(visible(page, "[data-layer]")).toHaveCount(0);
      await expect(chip(page, "city")).toHaveText("Андижан");
      await expect.poll(() => backVisible(page)).toBe(false);
      expect(await impacts(app, "medium")).toBe(medium + 1);

      await expect.poll(() => actions.length).toBe(1);
      expectCitySaved(actions[0], "andijan", mode);
      expect(await savedCity(page)).toBe("andijan");
    });
  });
}
