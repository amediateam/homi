import { expect, launchApp, type LaunchedApp, setScenario, test } from "@homi/testing/playwright";
import type { Page, Request } from "@playwright/test";

/**
 * The gates of WP-23 (`03` §1.4, SCR-002 … SCR-005, BR-APP-054, BR-APP-055) against the API on stubs: outside
 * Telegram, the refusals and their re-checks, the first-launch language and city, a listing link before the city,
 * and the expired session. Refusals and the expired answer are the app server's `/bff/session` answers fulfilled by
 * the spec; the first launch is the stub user of the `first_launch` scenario (WP-11, `locale_chosen` and
 * `city_chosen` false), set with the cookie WP-22 forwards as `X-Stub-Scenario`. Every test runs in cookie mode; the
 * picks through the Server Action and the expired screen also run in header mode, where the token lives in memory —
 * the rest do not depend on the session mode, and the full run shares one stub user's API limit (120 a minute).
 */

interface Fake {
  webApp: { BackButton: { isVisible: boolean } };
  emit(eventType: string): void;
}

/**
 * The visible copy only: with `cacheComponents` the router keeps earlier routes hidden in `<Activity>`
 * (`preserving-ui-state.md`), so the same element can be in the document twice.
 */
const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const route = (page: Page, name: string) => visible(page, `[data-route="${name}"]`);
const noAccess = (page: Page) => visible(page, '[data-screen="no-access"]');
/** The city chip of the feed's top bar (WP-24): the city of the feed's search. */
const cityChip = (page: Page) => visible(page, '[data-topbar="search-list"] [data-chip="city"]');
const session = (page: Page) => page.locator("html");
const back = (page: Page) => page.evaluate(() => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.emit("backButtonClicked"));
const backVisible = (page: Page) =>
  page.evaluate(() => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.webApp.BackButton.isVisible);

const isBff = (request: Request) => new URL(request.url()).pathname.startsWith("/bff/");
const isSignIn = (request: Request) => new URL(request.url()).pathname === "/bff/session" && request.method() === "POST";
/** A Server Action call: a POST to the page's address carrying the `Next-Action` header. */
const isServerAction = (request: Request) => request.method() === "POST" && request.headers()["next-action"] !== undefined;

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

/**
 * Answers the sign-in (`POST /bff/session`) with a refusal of the app server, `times` times (all when omitted), and
 * passes the later ones through — to the header mode of `launchApp` when it is on, which registered its route first.
 */
async function refuseSignIn(page: Page, reason: string, times = Infinity): Promise<() => number> {
  let refused = 0;
  await page.route("**/bff/session", async (route) => {
    if (route.request().method() === "POST" && refused < times) {
      refused += 1;
      await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ code: "access_denied", reason }) });
      return;
    }
    await route.fallback();
  });
  return () => refused;
}

/** The user leaves the app and comes back (`tg.onVisible`, WP-21: the document's `visibilitychange`). */
async function returnToApp(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const state of ["hidden", "visible"] as const) {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
      document.dispatchEvent(new Event("visibilitychange"));
    }
    Reflect.deleteProperty(document, "visibilityState");
  });
}

/** A mark on the window: gone after a document load, kept by every soft navigation. */
const markWindow = (page: Page) => page.evaluate(() => Object.assign(window, { __homiNoReload: true }));
const stillMarked = (page: Page) => page.evaluate(() => "__homiNoReload" in window);

async function closes(app: LaunchedApp): Promise<number> {
  return (await app.calls()).filter((call) => call.member === "close").length;
}

test.describe("gates", () => {
  test("without Telegram: /outside with its one sentence, no button and no request to /bff", async ({ page }) => {
    const bff = recordRequests(page, isBff);
    await page.goto("/");

    await expect(page).toHaveURL(/\/ru\/outside$/);
    await expect(session(page)).toHaveAttribute("data-session", "outside");
    await expect(visible(page, '[data-screen="outside"]')).toHaveText("Откройте приложение через бота в Telegram.");
    await expect(route(page, "outside").getByRole("button")).toHaveCount(0);
    await expect(route(page, "outside").getByRole("link")).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    expect(bff.map((request) => request.url())).toEqual([]);
  });

  test("join refused twice: the access screen in the Telegram language with the checking line, then the shell without a reload", async ({ page }) => {
    const refused = await refuseSignIn(page, "join", 2);
    const app = await launchApp(page, { locale: "en" });

    // Row 4: the full Telegram mapping (D-S-5) — `en` here, although the address before sign-in stayed /ru.
    await expect(page).toHaveURL(/\/en\/no-access\?reason=join$/);
    await expect(noAccess(page)).toHaveAttribute("data-reason", "join");
    await expect(noAccess(page).getByRole("heading", { level: 1 })).toHaveText("Start with the bot");
    await expect(noAccess(page)).toContainText("Tap “Start” in the bot — then the app will open.");
    await expect(visible(page, "[data-checking]")).toHaveText("Just tapped “Start”? Give it a couple of seconds — checking access…");
    // No start parameter: the only button is «Вернуться в бот», enabled while checking; no support account on stubs.
    await expect(noAccess(page).getByRole("button")).toHaveCount(1);
    await expect(visible(page, '[data-action="back"]')).toBeEnabled();
    expect(await backVisible(page)).toBe(false);
    await markWindow(page);

    // The first re-check (2.5 s) is refused again: still checking.
    await expect.poll(refused, { timeout: 10_000 }).toBe(2);
    await expect(visible(page, "[data-checking]")).toBeVisible();

    // The second re-check is let through: the gate leaves for the feed in the user's locale (ru), no reload.
    await expect(route(page, "feed")).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/ru$/);
    await expect(session(page)).toHaveAttribute("data-session", "ready");
    await expect(noAccess(page)).toHaveCount(0);
    expect(await stillMarked(page)).toBe(true);
    expect(await closes(app)).toBe(0);
  });

  test("blocked: no checking line and no request for 10 s, one attempt after returning to the app; «Вернуться в бот» closes", async ({ page }) => {
    test.setTimeout(45_000);
    await refuseSignIn(page, "blocked");
    // A listing link; the main button is «Вернуться в бот», which closes. The rule that `blocked` never gets «Перейти в
    // бота» is proven by the unit tests: a build without a bot name (CI) shows «Вернуться в бот» for every reason.
    const app = await launchApp(page, { startParam: "l_123" });

    await expect(page).toHaveURL(/\/ru\/no-access\?reason=blocked$/);
    await expect(noAccess(page)).toHaveAttribute("data-reason", "blocked");
    await expect(noAccess(page).getByRole("heading", { level: 1 })).toHaveText("Нет доступа");
    await expect(noAccess(page)).toContainText("Доступ к приложению закрыт.");
    await expect(visible(page, '[data-action="toBot"]')).toHaveCount(0);

    const bff = recordRequests(page, isBff);
    // The exception to "no fixed waits": the absence of a request over the 10 s window of the spec.
    await page.waitForTimeout(10_000);
    expect(bff.map((request) => request.url())).toEqual([]);
    await expect(visible(page, "[data-checking]")).toHaveCount(0);

    await returnToApp(page);
    await expect.poll(() => bff.filter(isSignIn).length).toBe(1);
    await expect(noAccess(page)).toHaveAttribute("data-reason", "blocked");
    await expect(visible(page, "[data-checking]")).toHaveCount(0);
    expect(bff.filter(isSignIn)).toHaveLength(1);

    await visible(page, '[data-action="back"]').click();
    await expect.poll(() => closes(app)).toBe(1);
  });

  test("paused: «Бот на паузе» and «Вернуться в бот» only, also for a listing link; «Вернуться в бот» closes (DEC-60)", async ({ page }) => {
    await setScenario(page, "access_paused");
    const app = await launchApp(page, { startParam: "l_123-seo" });

    await expect(page).toHaveURL(/\/ru\/no-access\?reason=paused$/);
    await expect(noAccess(page)).toHaveAttribute("data-reason", "paused");
    await expect(noAccess(page).getByRole("heading", { level: 1 })).toHaveText("Бот на паузе");
    await expect(noAccess(page)).toContainText("Скоро вернёмся. Ваши Радары и избранное на месте.");
    await expect(visible(page, "[data-checking]")).toBeVisible();
    // No source is passed to the bot: no «Перейти в бота», whatever the build's bot name.
    await expect(visible(page, '[data-action="toBot"]')).toHaveCount(0);
    await expect(visible(page, '[data-action="back"]')).toHaveText("Вернуться в бот");

    await visible(page, '[data-action="back"]').click();
    await expect.poll(() => closes(app)).toBe(1);
    expect((await app.calls()).filter((call) => call.member === "openTelegramLink")).toEqual([]);
  });

  test("paused re-checks by itself and leaves for the feed once the access is back", async ({ page }) => {
    await setScenario(page, "access_paused");
    await launchApp(page);
    await expect(noAccess(page)).toHaveAttribute("data-reason", "paused");
    await expect(visible(page, "[data-checking]")).toBeVisible();

    await setScenario(page, null);

    await expect(route(page, "feed")).toBeVisible({ timeout: 10_000 });
    await expect(session(page)).toHaveAttribute("data-session", "ready");
    await expect(noAccess(page)).toHaveCount(0);
  });

  test("a listing link with the SEO source in en offers the bot with s_seo_en (BR-API-194)", async ({ page }) => {
    await setScenario(page, "access_private");
    const app = await launchApp(page, { locale: "en", startParam: "l_123-seo" });

    await expect(page).toHaveURL(/\/en\/no-access\?reason=private$/);
    await expect(noAccess(page).getByRole("heading", { level: 1 })).toHaveText("This bot is private");
    const toBot = visible(page, '[data-action="toBot"]');
    if ((await toBot.count()) === 0) {
      // A build without a bot name (CI) has no bot link at all; the unit tests prove the payload.
      test.info().annotations.push({ type: "note", description: "no NEXT_PUBLIC_TELEGRAM_BOT_USERNAME in this build" });
      await expect(visible(page, '[data-action="back"]')).toBeVisible();
      return;
    }
    await toBot.click();
    await expect
      .poll(async () => (await app.calls()).filter((call) => call.member === "openTelegramLink").map((call) => String(call.args[0])))
      .toEqual([expect.stringMatching(/\?start=s_seo_en--l123$/)]);
  });

  test("a listing link on a first launch: language, then the listing, and the city page after Back; a located pick", async ({ page }) => {
    await setScenario(page, "first_launch");
    // Near Andijan (the stub reference's town, 40.7821 / 72.3442), for the location row of the city page.
    await launchApp(page, { startParam: "l_42", answers: { location: { latitude: 40.79, longitude: 72.35 } } });

    // The language comes first; the launch redirect waits for it (`setLaunchGate`).
    await expect(route(page, "welcome/language")).toBeVisible();
    await expect(page).toHaveURL(/\/ru\/welcome\/language$/);
    await visible(page, '[data-locale="ru"]').click();

    // Then the listing of the link, before the city (BR-APP-055).
    await expect(page).toHaveURL(/\/ru\/listing\/42$/);
    await expect(visible(page, '[data-route="listing"][data-layer="overlay"]')).toBeVisible();
    await expect(route(page, "welcome/city")).toHaveCount(0);

    // Closing the listing lands on the feed, and row 6 sends to the city page, which has no Back.
    await back(page);
    await expect(page).toHaveURL(/\/ru\/welcome\/city$/);
    await expect(route(page, "welcome/city").getByRole("heading", { level: 1 })).toHaveText("Где ищете жильё?");
    await expect(visible(page, '[data-city="andijan"]')).toContainText("210 аренда · 430 продажа");
    expect(await backVisible(page)).toBe(false);

    await visible(page, '[data-row="locate"]').click();
    await expect(page).toHaveURL(/\/ru\?city=andijan$/);
    await expect(cityChip(page)).toHaveText("Андижан");
  });
});

/** The picks call the settings Server Action (`useAction`), which in header mode carries the token in memory. */
for (const mode of ["cookie", "header"] as const) {
  test.describe(`gates (${mode} mode)`, () => {
    test("first launch: the language page greets in the Telegram language, «English» switches the address without a reload, the city picks the feed", async ({ page }) => {
      await setScenario(page, "first_launch");
      const actions = recordRequests(page, isServerAction);
      await launchApp(page, { mode, locale: "en" });

      await expect(route(page, "welcome/language")).toBeVisible();
      await expect(page).toHaveURL(/\/ru\/welcome\/language$/);
      const picker = route(page, "welcome/language");
      await expect(picker.getByRole("heading", { level: 1 })).toHaveText("Choose a language");
      await expect(picker.locator('[data-slot="subtitle"]')).toHaveText("Выберите язык · Tilni tanlang");
      const buttons = picker.locator("[data-locale]");
      await expect(buttons).toHaveText(["English", "Русский", "Oʻzbekcha"]);
      await expect(buttons.first()).toHaveAttribute("data-variant", "primary");
      await expect(buttons.nth(1)).toHaveAttribute("data-variant", "secondary");
      expect(await backVisible(page)).toBe(false);
      await markWindow(page);

      await visible(page, '[data-locale="en"]').click();

      // One Server Action, then row 6 in the chosen locale: the English city page, the same document.
      await expect(page).toHaveURL(/\/en\/welcome\/city$/);
      await expect(session(page)).toHaveAttribute("lang", "en");
      await expect(route(page, "welcome/city").getByRole("heading", { level: 1 })).toHaveText("Where are you looking?");
      expect(actions).toHaveLength(1);
      // Header mode has no session cookie: the action's arguments carry the token kept in memory (`useAction`).
      expect((await page.context().cookies()).some((cookie) => cookie.name === "homi_session")).toBe(mode === "cookie");
      expect(actions[0].postData() ?? "").toContain('{"locale":"en"}');
      expect((actions[0].postData() ?? "").includes('"token"')).toBe(mode === "header");
      expect(await stillMarked(page)).toBe(true);
      await expect(visible(page, '[data-city="andijan"]')).toContainText("210 to rent · 430 to buy");
      expect(await backVisible(page)).toBe(false);

      await visible(page, '[data-city="andijan"]').click();

      await expect(page).toHaveURL(/\/en\?city=andijan$/);
      await expect(route(page, "feed")).toBeVisible();
      await expect(cityChip(page)).toHaveText("Andijan");
      await expect.poll(() => actions.length).toBe(2);
      expect(await stillMarked(page)).toBe(true);
    });
  });
}

/** The session-expired screen in place of the route: its sentence, the one button «Закрыть», no Back, no new sign-in. */
async function expectExpiredAndClose(page: Page, app: LaunchedApp, routeName: string): Promise<void> {
  const screen = visible(page, '[data-screen="session-expired"]');
  await expect(screen).toBeVisible();
  await expect(session(page)).toHaveAttribute("data-session", "expired");
  await expect(screen.getByRole("heading", { level: 1 })).toHaveText("Сессия устарела — закройте и откройте приложение снова");
  await expect(screen.getByRole("button")).toHaveText(["Закрыть"]);
  await expect(route(page, routeName)).toHaveCount(0);
  expect(await backVisible(page)).toBe(false);

  const signIns = recordRequests(page, isSignIn);
  await screen.getByRole("button", { name: "Закрыть" }).click();
  await expect.poll(() => closes(app)).toBe(1);
  expect(signIns).toEqual([]);
}

/** `401 auth_expired`: the API's answer to launch data that is too old (WP-21, LB-APP-047). */
async function refuseAsTooOld(page: Page): Promise<void> {
  await page.route("**/bff/session", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ code: "auth_expired" }) });
      return;
    }
    await route.fallback();
  });
}

test.describe("session expired", () => {
  test("cookie mode: the sign-in at launch refused as too old shows the expired screen in place of the route; «Закрыть» closes", async ({ page }) => {
    await refuseAsTooOld(page);
    const app = await launchApp(page, { path: "/ru/saved" });

    await expectExpiredAndClose(page, app, "saved");
    await expect(page).toHaveURL(/\/ru\/saved$/);
  });

  /**
   * Header mode keeps the token in memory, so its sign-in is repeated when a read is refused (WP-22). The refusal is
   * registered after the launch: `launchApp`'s header-mode route answers `/bff/session` itself and would sit in front
   * of a route registered before it, and a sign-in refused at launch never reaches a session mode anyway. The read is
   * the map's points (`GET /listings/map` through `/bff`, WP-27), asked for again when the deal switch of the map's
   * top bar changes the search.
   */
  test("header mode: a read refused mid-session and the new sign-in refused as too old show the expired screen; «Закрыть» closes", async ({ page }) => {
    const app = await launchApp(page, { mode: "header", path: "/ru/map" });
    await expect(session(page)).toHaveAttribute("data-session", "ready");
    await expect(visible(page, '[data-marker="stack"]').first()).toBeVisible();

    await page.route("**/bff/listings/map**", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ code: "unauthenticated" }) }),
    );
    await refuseAsTooOld(page);
    await visible(page, '[data-topbar="map"]').getByRole("radio", { name: "Продажа" }).click();

    await expectExpiredAndClose(page, app, "map");
  });
});
