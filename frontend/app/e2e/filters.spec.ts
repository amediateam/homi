import { expect, launchApp, stubMedia, test as base, type LaunchedApp, shownText } from "@homi/testing/playwright";
import type { Locator, Page, Request } from "@playwright/test";

/**
 * The filter sheets of WP-25 (SCR-014, SCR-015, SCR-016) over the feed of WP-24 against the API on stubs, in cookie
 * and header mode: the full filters sheet (live count and apply, close without apply, the nested city picker and Back,
 * the direct load, the map as the opener, the pets launch), the quick filter sheets (rooms with its live count, close
 * without apply, apply; price reset), the not-found quick kind and the sort sheet. A sheet pushed from a chip lies
 * over the feed, which stays mounted; «Показать …» and a sort pick close it and replace the feed's address in one
 * step, so the history does not grow and BackButton is hidden afterwards. `history.length` still counts the forward
 * entry the back step leaves, so "unchanged" is checked against the length while the sheet was open. Every photo is answered by `stubMedia`; the
 * full run shares one stub user's API limit (120 a minute, KI-32), so each test launches once.
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

/**
 * The visible copy only: with `cacheComponents` the router keeps earlier routes hidden in `<Activity>`
 * (`preserving-ui-state.md`), so the same element can be in the document twice.
 */
const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const html = (page: Page) => page.locator("html");
const route = (page: Page, name: string) => visible(page, `[data-route="${name}"]`);
const cards = (page: Page) => visible(page, "article[data-listing]");
const chip = (page: Page, key: string) => visible(page, `[data-topbar="search-list"] [data-chip="${key}"]`);
/** The intercepted copy of a sheet address, inside its bottom sheet. */
const sheet = (page: Page, name: string) => visible(page, `[data-slot="bottom-sheet"] [data-route="${name}"][data-layer="sheet"]`);
/** A footer button of the open quick sheet: `reset` or `apply` (outside the `data-route` content). */
const action = (page: Page, name: "reset" | "apply") => visible(page, `[data-slot="bottom-sheet"] [data-action="${name}"]`);
const press = (page: Page, eventType: "backButtonClicked") =>
  page.evaluate((type) => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.emit(type), eventType);
const backVisible = (page: Page) =>
  page.evaluate(() => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.webApp.BackButton.isVisible);
const historyLength = (page: Page) => page.evaluate(() => window.history.length);
/** The search keys of the current address. */
const searchOf = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams);

/**
 * Waits for the address an apply lands on. `closeThen` steps back first, so the page below shows its old address
 * for a moment before the replace: a check of the search right after a URL match could read that one.
 */
const landed = (page: Page, pathname: string, search: Record<string, string>) =>
  expect.poll(() => ({ pathname: new URL(page.url()).pathname, search: searchOf(page) })).toEqual({ pathname, search });

const isCount = (url: URL) => url.pathname === "/bff/listings/count";
/** The feed's page one: `/bff/listings` without a cursor. */
const isPageOne = (url: URL) => url.pathname === "/bff/listings" && !url.searchParams.has("cursor");
/** A server render the router asks for: an RSC request that is neither a prefetch nor a Server Action. */
const isRender = (request: Request) => {
  const headers = request.headers();
  return (
    headers.rsc === "1" &&
    headers["next-router-prefetch"] === undefined &&
    headers["next-router-segment-prefetch"] === undefined &&
    headers["next-action"] === undefined
  );
};
/** A query carrying exactly the rooms range `min`–`max`. */
const hasRooms = (url: URL, min: string, max: string) => url.searchParams.get("rooms_min") === min && url.searchParams.get("rooms_max") === max;

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

/** Marks an element so a later check can tell that the same node is still mounted. */
async function mark(page: Page, selector: string, value: string): Promise<void> {
  await visible(page, selector).first().evaluate((element, probe) => element.setAttribute("data-probe", probe), value);
}

/** Launches the app as the bot does, in a session mode, and waits for the session. */
async function open(page: Page, mode: Mode, path = "/"): Promise<LaunchedApp> {
  const app = await launchApp(page, { mode, path });
  await expect(html(page)).toHaveAttribute("data-session", "ready");
  return app;
}

/** The label of the apply button for a count answer: «Показать {n}», or «Ничего нет» for zero. */
const applyLabel = (count: number) => (count > 0 ? `Показать ${count}` : "Ничего нет");

/** The room button `label` of a sheet's rooms picker. */
const roomButton = (scope: Locator, label: string) => scope.getByRole("button", { name: label, exact: true });

/**
 * Watches the count requests from now on: `answer` is the count of the first one carrying the rooms range `min`–`max`;
 * `carrying()` how many such requests were sent.
 */
function watchCounts(page: Page, min: string, max: string): { answer: Promise<number>; carrying: () => number } {
  const counts = recordRequests(page, (request) => isCount(new URL(request.url())) && hasRooms(new URL(request.url()), min, max));
  const answer = page
    .waitForResponse((response) => isCount(new URL(response.url())) && hasRooms(new URL(response.url()), min, max))
    .then(async (response) => ((await response.json()) as { data: { count: number } }).data.count);
  return { answer, carrying: () => counts.length };
}

/**
 * Watches the feed ask for a new search with the rooms range from now on; the check resolves once it did: the router
 * renders `/ru` with the range, and header mode also reads page one through `/bff` with it, while cookie mode adopts
 * the server's page one, which the test cannot see.
 */
function watchFeed(page: Page, mode: Mode, min: string, max: string): () => Promise<void> {
  const firstPages = recordRequests(page, (request) => isPageOne(new URL(request.url())));
  const renders = recordRequests(page, (request) => isRender(request) && new URL(request.url()).pathname === "/ru");
  return async () => {
    await expect.poll(() => renders.filter((request) => hasRooms(new URL(request.url()), min, max)).length).toBe(1);
    await expect
      .poll(() => firstPages.map((request) => hasRooms(new URL(request.url()), min, max)))
      .toEqual(mode === "cookie" ? [] : [true]);
    await expect(cards(page).first()).toBeVisible();
  };
}

for (const mode of ["cookie", "header"] as const) {
  test.describe(`quick filter (${mode} mode)`, () => {
    test("rooms: closed without «Показать» nothing changes; reopened it starts from the address, 2 applies 2–2 and re-creates the feed", async ({ page }) => {
      const app = await open(page, mode);
      await expect(cards(page).first()).toBeVisible();
      await mark(page, '[data-route="feed"]', "feed");
      const start = page.url();

      await chip(page, "rooms").click();
      const rooms = sheet(page, "filters/rooms");
      await expect(rooms).toBeVisible();
      await expect(page.locator('[data-route="feed"][data-probe="feed"]')).toBeAttached();
      await roomButton(rooms, "3").click();
      await expect(roomButton(rooms, "3")).toHaveAttribute("aria-pressed", "true");
      await press(page, "backButtonClicked");
      await expect(visible(page, "[data-layer]")).toHaveCount(0);
      await expect(page).toHaveURL(start);

      await chip(page, "rooms").click();
      await expect(rooms).toBeVisible();
      await expect(roomButton(rooms, "Любые")).toHaveAttribute("aria-pressed", "true");
      await expect(roomButton(rooms, "3")).toHaveAttribute("aria-pressed", "false");
      await expect.poll(() => backVisible(page)).toBe(true);
      const whileOpen = await historyLength(page);

      const counts = watchCounts(page, "2", "2");
      await roomButton(rooms, "2").click();
      await expect.poll(async () => shownText(action(page, "apply"))).toBe(applyLabel(await counts.answer));
      expect(counts.carrying()).toBe(1);

      const feedAsked = watchFeed(page, mode, "2", "2");
      const medium = await impacts(app, "medium");
      await action(page, "apply").click();

      await landed(page, "/ru", { city: "tashkent", rooms_min: "2", rooms_max: "2" });
      await expect(visible(page, "[data-layer]")).toHaveCount(0);
      expect(await historyLength(page)).toBe(whileOpen);
      await expect.poll(() => backVisible(page)).toBe(false);
      expect(await impacts(app, "medium")).toBe(medium + 1);
      await expect(chip(page, "rooms")).toHaveAttribute("data-state", "on");
      await feedAsked();
    });

    test("price: «Сбросить» clears both bounds and «Не дороже рынка» only", async ({ page }) => {
      await open(page, mode, "/?price_min=100&price_max=500&below_median=1&rooms_min=2&rooms_max=2");
      await expect(cards(page).first()).toBeVisible();

      await chip(page, "price").click();
      const price = sheet(page, "filters/price");
      await expect(price).toBeVisible();
      await expect(visible(page, '[data-slot="bottom-sheet-title"]')).toHaveText("Цена в месяц, $");
      const from = price.getByRole("textbox", { name: "от", exact: true });
      const to = price.getByRole("textbox", { name: "до", exact: true });
      const belowMedian = price.locator('[data-chip="below-median"]');
      await expect(from).toHaveValue("100");
      await expect(to).toHaveValue("500");
      await expect(belowMedian).toHaveAttribute("aria-pressed", "true");

      await action(page, "reset").click();
      await expect(from).toHaveValue("");
      await expect(to).toHaveValue("");
      await expect(belowMedian).toHaveAttribute("aria-pressed", "false");

      await action(page, "apply").click();
      await landed(page, "/ru", { city: "tashkent", rooms_min: "2", rooms_max: "2" });
      await expect(visible(page, "[data-layer]")).toHaveCount(0);
    });

    test("an unknown kind (/filters/foo) shows the not-found screen", async ({ page }) => {
      await open(page, mode, "/filters/foo");

      await expect(visible(page, '[data-route="not-found"]')).toBeVisible();
      await expect(visible(page, '[data-slot="bottom-sheet"]')).toHaveCount(0);
    });
  });

  test.describe(`sort (${mode} mode)`, () => {
    test("«Сначала дешевле» writes sort=cheap; «Сначала новые» removes it; each pick closes with a light impact", async ({ page }) => {
      const app = await open(page, mode);
      await expect(cards(page).first()).toBeVisible();
      const firstPages = recordRequests(page, (request) => isPageOne(new URL(request.url())));

      await chip(page, "sort").click();
      const rows = sheet(page, "sort").getByRole("radiogroup", { name: "Сортировка" });
      await expect(rows.getByRole("radio", { name: "Сначала новые" })).toHaveAttribute("aria-checked", "true");
      const whileOpen = await historyLength(page);
      let light = await impacts(app, "light");
      await rows.getByRole("radio", { name: "Сначала дешевле" }).click();

      await landed(page, "/ru", { city: "tashkent", sort: "cheap" });
      await expect(visible(page, "[data-layer]")).toHaveCount(0);
      expect(await historyLength(page)).toBe(whileOpen);
      await expect.poll(() => backVisible(page)).toBe(false);
      expect(await impacts(app, "light")).toBe(light + 1);
      await expect(chip(page, "sort")).toContainText("Сначала дешевле");
      await expect(cards(page).first()).toBeVisible();
      await expect
        .poll(() => firstPages.map((request) => new URL(request.url()).searchParams.get("sort")))
        .toEqual(mode === "cookie" ? [] : ["cheap"]);

      await chip(page, "sort").click();
      await expect(rows.getByRole("radio", { name: "Сначала дешевле" })).toHaveAttribute("aria-checked", "true");
      light = await impacts(app, "light");
      await rows.getByRole("radio", { name: "Сначала новые" }).click();

      await landed(page, "/ru", { city: "tashkent" });
      await expect(visible(page, "[data-layer]")).toHaveCount(0);
      expect(await impacts(app, "light")).toBe(light + 1);
      await expect(chip(page, "sort")).toContainText("Сначала новые");
    });
  });

  /** The full filters sheet (SCR-014), spec lines 446–452: `FiltersForm` in search mode over the feed or the map. */
  test.describe(`filters sheet (${mode} mode)`, () => {
    test("chip → the sheet over the feed → rooms 2 → one count with the range → «Показать N» applies and re-creates the feed", async ({ page }) => {
      const app = await open(page, mode);
      await expect(cards(page).first()).toBeVisible();
      await mark(page, '[data-route="feed"]', "feed");

      await chip(page, "filters").click();
      const filters = sheet(page, "filters");
      await expect(filters).toBeVisible();
      await expect(visible(page, '[data-slot="bottom-sheet-title"]')).toHaveText("Фильтры");
      await expect(page.locator('[data-route="feed"][data-probe="feed"]')).toBeAttached();
      await expect.poll(() => backVisible(page)).toBe(true);
      const whileOpen = await historyLength(page);

      const counts = watchCounts(page, "2", "2");
      await roomButton(filters.locator('[data-section="rooms"]'), "2").click();
      await expect.poll(async () => shownText(action(page, "apply"))).toBe(applyLabel(await counts.answer));
      expect(counts.carrying()).toBe(1);

      const feedAsked = watchFeed(page, mode, "2", "2");
      const medium = await impacts(app, "medium");
      await action(page, "apply").click();

      await landed(page, "/ru", { city: "tashkent", rooms_min: "2", rooms_max: "2" });
      await expect(visible(page, "[data-layer]")).toHaveCount(0);
      expect(await historyLength(page)).toBe(whileOpen);
      await expect.poll(() => backVisible(page)).toBe(false);
      expect(await impacts(app, "medium")).toBe(medium + 1);
      await feedAsked();
    });

    test("closed by × or by Telegram Back without «Показать», the address is unchanged; the next open starts from it", async ({ page }) => {
      await open(page, mode, "/?rooms_min=3&rooms_max=3");
      await expect(cards(page).first()).toBeVisible();
      const start = page.url();

      for (const close of ["×", "Back"] as const) {
        await chip(page, "filters").click();
        const rooms = sheet(page, "filters").locator('[data-section="rooms"]');
        await expect(roomButton(rooms, "3")).toHaveAttribute("aria-pressed", "true");
        await roomButton(rooms, "Любые").click();
        await expect(roomButton(rooms, "3")).toHaveAttribute("aria-pressed", "false");

        if (close === "×") {
          await visible(page, '[data-slot="bottom-sheet-close"]').click();
        } else {
          await press(page, "backButtonClicked");
        }
        await expect(visible(page, "[data-layer]"), close).toHaveCount(0);
        await expect(page, close).toHaveURL(start);
      }
    });

    test("Telegram Back closes the nested city picker first, then the sheet; the draft survives the picker", async ({ page }) => {
      await open(page, mode);
      await expect(cards(page).first()).toBeVisible();
      const start = page.url();

      await chip(page, "filters").click();
      const filters = sheet(page, "filters");
      const rooms = filters.locator('[data-section="rooms"]');
      await roomButton(rooms, "2").click();
      await filters.locator('[data-section="city"] [data-field="city"]').click();
      const picker = visible(page, '[data-slot="city-picker-nested"]');
      await expect(picker).toBeVisible();
      await expect(page.getByRole("dialog", { name: "Город" })).toBeVisible();
      await expect(page).toHaveURL(/[?&]pick=city(&|$)/);

      await press(page, "backButtonClicked");
      await expect(picker).toHaveCount(0);
      await expect(page).not.toHaveURL(/[?&]pick=/);
      await expect(filters).toBeVisible();
      await expect(roomButton(rooms, "2")).toHaveAttribute("aria-pressed", "true");

      await press(page, "backButtonClicked");
      await expect(visible(page, "[data-layer]")).toHaveCount(0);
      await expect(page).toHaveURL(start);
    });

    test("a reload on /filters shows the direct-load form; «Показать …» lands on / with the search", async ({ page }) => {
      await open(page, mode);
      await expect(cards(page).first()).toBeVisible();
      await chip(page, "filters").click();
      await expect(sheet(page, "filters")).toBeVisible();

      await page.reload();
      await expect(html(page)).toHaveAttribute("data-session", "ready");
      await expect(page).toHaveURL(/\/ru\/filters\?city=tashkent$/);
      const direct = visible(page, '[data-slot="bottom-sheet"] [data-route="filters"]:not([data-layer])');
      await expect(direct).toBeVisible();
      await expect(page.locator('[data-route="feed"]')).toHaveCount(0);

      const counts = watchCounts(page, "2", "2");
      await roomButton(direct.locator('[data-section="rooms"]'), "2").click();
      await expect.poll(async () => shownText(action(page, "apply"))).toBe(applyLabel(await counts.answer));
      await action(page, "apply").click();

      await landed(page, "/ru", { city: "tashkent", rooms_min: "2", rooms_max: "2" });
      await expect(route(page, "feed")).toBeVisible();
      await expect(visible(page, '[data-route="filters"]')).toHaveCount(0);
      await expect.poll(() => backVisible(page)).toBe(false);
    });

    test("opened from the map (from=map), «Показать …» lands on /map with the search", async ({ page }) => {
      await open(page, mode, "/map");
      await expect(route(page, "map")).toBeVisible();
      await mark(page, '[data-route="map"]', "map");

      await visible(page, '[data-topbar="map"] [data-slot="map-bar"]').getByRole("button", { name: "Фильтры", exact: true }).click();
      await expect(page).toHaveURL(/\/ru\/filters\?.*from=map/);
      const filters = sheet(page, "filters");
      await expect(filters).toBeVisible();
      await expect(page.locator('[data-route="map"][data-probe="map"]')).toBeAttached();

      await roomButton(filters.locator('[data-section="rooms"]'), "2").click();
      await action(page, "apply").click();

      await landed(page, "/ru/map", { city: "tashkent", rooms_min: "2", rooms_max: "2" });
      await expect(visible(page, "[data-layer]")).toHaveCount(0);
      await expect(route(page, "map")).toBeVisible();
    });

    test("«Площадь, м²» shows for every deal (DEC-62); «Животные» only for long-term rent, «Кто будет жить» for both rents (DEC-58)", async ({ page }) => {
      await open(page, mode);
      await expect(cards(page).first()).toBeVisible();
      await chip(page, "filters").click();
      const filters = sheet(page, "filters");
      await expect(filters).toBeVisible();
      const section = (name: string) => filters.locator(`[data-section="${name}"]`);

      await expect(section("area").getByRole("heading")).toHaveText("Площадь, м²");
      await expect(section("pets")).toHaveCount(1);
      await expect(section("tenant")).toHaveCount(1);

      await section("rentTerm").getByRole("radio", { name: "Посуточно" }).click();
      await expect(section("pets")).toHaveCount(0);
      await expect(section("tenant")).toHaveCount(1);
      await expect(section("area")).toHaveCount(1);

      await section("deal").getByRole("radio", { name: "Продажа" }).click();
      await expect(section("area")).toHaveCount(1);
      await expect(section("market")).toHaveCount(1);
      await expect(section("pets")).toHaveCount(0);
      await expect(section("tenant")).toHaveCount(0);
    });

    test("a launch with news=pets opens the sheet scrolled to «Животные»", async ({ page }) => {
      await open(page, mode, "/?news=pets");
      await expect(page).toHaveURL(/\/ru\/filters\?focus=pets$/);
      const filters = sheet(page, "filters");
      await expect(filters).toBeVisible();

      // `FOCUS_DELAY_MS` after the open the section scrolls to the middle of the sheet's body (`03` §3.4).
      const pets = filters.locator('[data-focus="pets"]');
      await expect(pets.getByRole("heading")).toContainText("Животные");
      await expect.poll(() => visible(page, '[data-slot="bottom-sheet-body"]').evaluate((body) => body.scrollTop)).toBeGreaterThan(0);
      await expect(pets).toBeInViewport({ ratio: 1 });
    });
  });
}
