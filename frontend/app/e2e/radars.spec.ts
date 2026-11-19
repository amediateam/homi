import { expect as baseExpect, launchApp, stubMedia, test as base, type LaunchedApp } from "@homi/testing/playwright";
import type { Page, Request } from "@playwright/test";

/**
 * The radar tab and the radar sheet of WP-30 (SCR-026, SCR-028, BR-APP-047, BR-APP-048, BR-APP-063) against the API
 * on stubs with radars switched on, in cookie and header mode: the three fixture radars of `radars/list.json` (WP-13)
 * on their tiles from one list read that carries the previews; a tile opens the sheet and Telegram's Back closes it;
 * unhide; the switch pauses and resumes; the mode rows; delete with its confirm; «Смотреть найденное» opens the feed of
 * the radar's filters and Back brings the sheet back without its rise while the search tab keeps the user's own
 * filters; a find opens the listing and Back brings the sheet back; the direct loads of the sheet and of the editor;
 * an unknown radar; pull-to-refresh. The stub list is stateless — a write changes nothing on the server — so each
 * check of a write reads what the app shows right after it, never a later read of the list. The nudges are silenced
 * before every launch (`homi-nudge`), so no card of the search tab takes a tap. Every photo is answered by
 * `stubMedia`; each test launches once, as the full run shares one stub user's API limit (KI-32).
 */

/**
 * The local servers are shared with the other spec runs of the session, and the stub API answers one request at a
 * time, so a screen may wait several seconds for its answer: each check waits up to 20 s, each test 90 s.
 */
const expect = baseExpect.configure({ timeout: 20_000 });

const test = base.extend<{ photos: readonly string[] }>({
  /** The stub photos answered so far: every test answers them itself, as CI has no `cdn.homi.loc`. */
  photos: [async ({ page }, use) => use(await stubMedia(page)), { auto: true }],
});

test.describe.configure({ timeout: 90_000 });

interface Fake {
  webApp: { BackButton: { isVisible: boolean } };
  answers: { confirm: boolean };
  emit(eventType: string): void;
}

type Mode = "cookie" | "header";

/** How long a launch may take to sign in and show its first screen. */
const LAUNCH_MS = 30_000;

/** The fixture radars (`radars/list.json`): on and instant; paused with three hidden; on, sale and digest. */
const ACTIVE = "01JD0000000000000000000001";
const PAUSED = "01JD0000000000000000000002";
const DIGEST = "01JD0000000000000000000003";
/** A ULID the stub list does not hold (a radar deleted in the bot). */
const UNKNOWN = "01JD0000000000000000000099";
/** The newest find of the active radar (`radars/list.previews.json`). */
const FIND = 100012;
/** The address of the active radar's filters, as «Смотреть найденное» writes it (`toSearchParams`, then `from`). */
const ACTIVE_FEED = "city=tashkent&districts=yunusobod&districts=mirobod&rooms_min=2&rooms_max=2&price_max=700&from=radar";

/**
 * The visible copy only: with `cacheComponents` the router keeps earlier routes hidden in `<Activity>`
 * (`preserving-ui-state.md`), so the same element can be in the document twice.
 */
const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const html = (page: Page) => page.locator("html");
const tab = (page: Page, key: "search" | "radars") => visible(page, `[data-tab="${key}"]`);
const tile = (page: Page, id: string) => visible(page, `[data-radar-tile="${id}"]`);
const tileSwitch = (page: Page, id: string) => tile(page, id).getByRole("switch");
/** The radar sheet over the tab (intercepted into `@sheet`). */
const sheet = (page: Page, id: string) => visible(page, `[data-route="radar"][data-layer="sheet"][data-radar-id="${id}"]`);
/** The dialog of the open sheet: its title, header and footer are outside the `data-route` content. */
const dialog = (page: Page) => visible(page, '[role="dialog"]');
const appToast = (page: Page) => visible(page, '[data-toast-host="app"] [data-toast]');
const press = (page: Page, eventType: "backButtonClicked") =>
  page.evaluate((type) => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.emit(type), eventType);
const backVisible = (page: Page) =>
  page.evaluate(() => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.webApp.BackButton.isVisible);
const answerConfirm = (page: Page, confirm: boolean) =>
  page.evaluate((value) => {
    (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.answers.confirm = value;
  }, confirm);
/** The address as the app spells it: path and query, the locale segment included. */
const address = (page: Page) => {
  const url = new URL(page.url());
  return url.pathname + url.search;
};

/** A Server Action call: a POST to the page's address carrying the `Next-Action` header. */
const isServerAction = (request: Request) => request.method() === "POST" && request.headers()["next-action"] !== undefined;
/** A read of the radar list through the app server's pass-through. */
const isRadarRead = (request: Request) => new URL(request.url()).pathname === "/bff/radars";
/** A listing read through `/bff` (a per-radar fallback to the listing methods would be one). */
const isListingRead = (request: Request) => new URL(request.url()).pathname.startsWith("/bff/listings");
const queryOf = (request: Request) => new URL(request.url()).search;

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

/** Fails if the page asks for anything that `match`es within `ms`: a bounded window for "nothing more follows". */
const nothingAsked = (page: Page, match: (request: Request) => boolean, ms = 1_000) =>
  expect(page.waitForRequest(match, { timeout: ms })).rejects.toThrow(/Timeout/);

/** Impacts and notifications the page asked the fake Telegram for so far (TMA-025). */
async function impacts(app: LaunchedApp, style: "light" | "medium"): Promise<number> {
  return (await app.calls()).filter((call) => call.member === "HapticFeedback.impactOccurred" && call.args[0] === style).length;
}
async function notifications(app: LaunchedApp, type: "success" | "error"): Promise<number> {
  return (await app.calls()).filter((call) => call.member === "HapticFeedback.notificationOccurred" && call.args[0] === type).length;
}
/** The messages of the confirms the page asked for so far. */
async function confirms(app: LaunchedApp): Promise<string[]> {
  return (await app.calls()).filter((call) => call.member === "showConfirm").map((call) => String(call.args[0]));
}

/** A gate a route handler waits on: `release()` lets the held requests go on. */
function gate(): { held: Promise<void>; release: () => void } {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { held, release };
}

/** Holds every Server Action of the page until the returned function is called; each is then sent on unchanged. */
async function holdActions(page: Page): Promise<() => void> {
  const slow = gate();
  await page.route("**/*", async (handled) => {
    if (isServerAction(handled.request())) {
      await slow.held;
    }
    await handled.fallback();
  });
  return slow.release;
}

/** Marks an element so a later check can tell that the same node is still mounted. */
async function mark(page: Page, selector: string, value: string): Promise<void> {
  await visible(page, selector).first().evaluate((element, probe) => element.setAttribute("data-probe", probe), value);
}

/** A one-finger touch drag through the CDP, as a finger on a phone (pull-to-refresh). */
async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 10): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (let step = 1; step <= steps; step += 1) {
    const point = { x: from.x + ((to.x - from.x) * step) / steps, y: from.y + ((to.y - from.y) * step) / steps };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/**
 * Silences the nudges before the launch (`homi-nudge`, WP-30): the follow nudge and the return banner wait out
 * `quietUntil` and the feed's radar card `feedOff`, so none of them shows over the screens these tests tap.
 */
async function silenceNudges(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const far = Date.now() + 30 * 24 * 3_600_000;
    try {
      localStorage.setItem("homi-nudge", JSON.stringify({ asked: [], closed: 0, quietUntil: far, lastShown: 0, back: {}, feedOff: far }));
    } catch {
      // No storage on this document (about:blank): nothing to silence there.
    }
  });
}

/** Launches the app as the bot does, in a session mode, and waits for the session. */
async function open(page: Page, mode: Mode, path = "/radars"): Promise<LaunchedApp> {
  await silenceNudges(page);
  const app = await launchApp(page, { mode, path });
  // The servers are shared with other spec runs: a sign-in may queue behind them, and the boot retry covers a refusal.
  await expect(html(page)).toHaveAttribute("data-session", "ready", { timeout: LAUNCH_MS });
  return app;
}

/** The tab with its three tiles on screen and no sheet over it. */
async function onTab(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/ru\/radars$/);
  await expect(visible(page, "[data-radar-tile]")).toHaveCount(3);
  await expect(visible(page, '[data-route="radar"]')).toHaveCount(0);
}

/** A tap on the tile opens the radar's sheet over the tab. */
async function openSheet(page: Page, id: string): Promise<void> {
  await tile(page, id).locator("[data-radar-open]").click();
  await expect(page).toHaveURL(new RegExp(`/ru/radars/${id}$`));
  await expect(sheet(page, id)).toBeVisible();
}

/**
 * Launches on the tab in a short window, so the three tiles scroll, and scrolls it to its end: answers the position.
 */
async function scrollTheTab(page: Page, mode: Mode): Promise<number> {
  await page.setViewportSize({ width: 390, height: 420 });
  await open(page, mode);
  await onTab(page);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  return page.evaluate(() => window.scrollY);
}

for (const mode of ["cookie", "header"] as const) {
  test.describe(`radar tab (${mode} mode)`, () => {
    test("the tab shows the three stub radars from one list read with the previews; no read per radar", async ({ page }) => {
      await open(page, mode, "/");
      await expect(visible(page, "article[data-listing]").first()).toBeVisible();
      // The search tab's own plain list read (the footer state, the note, the nudge rules) is done before the press.
      await page.waitForLoadState("networkidle");
      const radarReads = recordRequests(page, isRadarRead);
      const listingReads = recordRequests(page, isListingRead);

      await tab(page, "radars").click();
      await onTab(page);
      await expect(visible(page, '[data-topbar="radars"] h1')).toHaveText("Радар");
      await expect(visible(page, '[data-topbar="radars"]').getByRole("link", { name: "Новый радар" })).toBeVisible();
      expect(await visible(page, "[data-radar-tile]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-radar-tile")))).toEqual([
        ACTIVE,
        PAUSED,
        DIGEST,
      ]);

      // Title (`filtersTitle`), area (`filtersAreaSummary`), status (`radarStatus`): the preview's flow, then the mode.
      await expect(tile(page, ACTIVE).locator("b")).toHaveText("2-комн. · до $700");
      await expect(tile(page, ACTIVE)).toContainText("Юнусабад, Мирабад");
      await expect(tile(page, ACTIVE).locator("[data-radar-status]")).toHaveText("≈3 в день · сразу");
      await expect(tile(page, PAUSED).locator("[data-radar-status]")).toHaveText("На паузе");
      await expect(tile(page, DIGEST).locator("b")).toHaveText("Продажа · Квартира, Дом · до $120 000");
      await expect(tile(page, DIGEST).locator("[data-radar-status]")).toHaveText("подборкой");

      // The collage: the covers of up to four finds, the radar icon without a preview; a paused tile is grey.
      await expect(tile(page, ACTIVE).locator("[data-radar-collage]")).toHaveAttribute("data-radar-collage", "4");
      await expect(tile(page, PAUSED).locator("[data-radar-collage]")).toHaveAttribute("data-radar-collage", "2");
      await expect(tile(page, DIGEST).locator("[data-radar-collage]")).toHaveAttribute("data-radar-collage", "0");
      await expect(tile(page, PAUSED)).toHaveAttribute("data-active", "false");
      expect(await tile(page, PAUSED).locator("[data-radar-collage]").evaluate((node) => getComputedStyle(node).filter)).toContain("grayscale(1)");
      expect(await tile(page, ACTIVE).locator("[data-radar-collage]").evaluate((node) => getComputedStyle(node).filter)).toBe("none");
      await expect(tileSwitch(page, ACTIVE)).toHaveAttribute("aria-checked", "true");
      await expect(tileSwitch(page, PAUSED)).toHaveAttribute("aria-checked", "false");
      await expect(page.locator("[data-demo-marker]")).toBeVisible();

      // One read for the whole tab, with the previews (BR-APP-063): through `/bff` in header mode; in cookie mode the
      // tab's server render reads it and the browser asks at most once more. No listing read follows per radar.
      await page.waitForLoadState("networkidle");
      const queries = radarReads.map(queryOf);
      expect(queries).toEqual(queries.map(() => "?include=previews"));
      if (mode === "header") {
        expect(queries).toHaveLength(1);
      } else {
        expect(queries.length).toBeLessThanOrEqual(1);
      }
      expect(listingReads).toEqual([]);
    });

    test("Tab reaches the tile and its switch apart; Enter opens the sheet; Telegram's Back closes it to the same tab", async ({ page }) => {
      const app = await open(page, mode);
      await onTab(page);
      await mark(page, '[data-route="radars"]', "tab");
      await expect.poll(() => backVisible(page)).toBe(false);

      const opener = tile(page, ACTIVE).locator("[data-radar-open]");
      await opener.focus();
      await page.keyboard.press("Tab");
      await expect(tileSwitch(page, ACTIVE)).toBeFocused();
      await expect(tileSwitch(page, ACTIVE)).toHaveAccessibleName("Присылать в чат");
      await page.keyboard.press("Shift+Tab");
      await expect(opener).toBeFocused();
      const light = await impacts(app, "light");
      await page.keyboard.press("Enter");

      await expect(page).toHaveURL(new RegExp(`/ru/radars/${ACTIVE}$`));
      await expect(sheet(page, ACTIVE)).toBeVisible();
      await expect(page.getByRole("dialog", { name: "2-комн. · до $700" })).toBeVisible();
      await expect(dialog(page).locator("[data-radar-head]")).toContainText("Юнусабад, Мирабад");
      await expect(dialog(page).locator("[data-radar-head] [data-radar-status]")).toHaveText("≈3 в день · сразу");
      await expect(dialog(page).locator("[data-radar-feed]")).toHaveText("Смотреть найденное · 34");
      await expect(sheet(page, ACTIVE).locator("[data-radar-strip]")).toHaveAttribute("data-radar-strip", "finds");
      await expect(sheet(page, ACTIVE).locator("[data-radar-find]")).toHaveCount(5);
      await expect(sheet(page, ACTIVE).locator(`[data-radar-find="${FIND}"] [data-radar-new]`)).toHaveText("новое");
      await expect(sheet(page, ACTIVE).locator("[data-radar-all]")).toHaveText("Все 34");
      await expect(sheet(page, ACTIVE).locator("[data-radar-unhide]")).toHaveCount(0);
      await expect(sheet(page, ACTIVE).locator("[data-radar-delete]")).toHaveText("Удалить радар");
      expect(await impacts(app, "light")).toBe(light + 1);
      await expect(page.locator('[data-route="radars"][data-probe="tab"]')).toBeAttached();
      await expect.poll(() => backVisible(page)).toBe(true);

      await press(page, "backButtonClicked");
      await onTab(page);
      await expect(page.locator('[data-route="radars"][data-probe="tab"]')).toBeVisible();
      await expect.poll(() => backVisible(page)).toBe(false);
    });

    test("the paused radar's sheet has no mode rows and offers «Скрыто: 3 · Вернуть»; «Вернуть» says «Скрытое снова показывается»", async ({ page }) => {
      const app = await open(page, mode);
      await onTab(page);
      await openSheet(page, PAUSED);
      await expect(dialog(page).locator("[data-radar-head] [data-radar-status]")).toHaveText("На паузе");
      await expect(sheet(page, PAUSED)).toHaveAttribute("data-active", "false");
      await expect(sheet(page, PAUSED).locator("[data-radar-mode]")).toHaveCount(0);
      // A paused radar's finds carry no «новое».
      await expect(sheet(page, PAUSED).locator("[data-radar-find]")).toHaveCount(2);
      await expect(sheet(page, PAUSED).locator("[data-radar-new]")).toHaveCount(0);
      // Without a count the footer is the plain label.
      await expect(dialog(page).locator("[data-radar-feed]")).toHaveText("Смотреть найденное");
      const unhide = sheet(page, PAUSED).locator("[data-radar-unhide]");
      await expect(unhide).toContainText("Скрыто: 3");
      await expect(unhide).toContainText("Вернуть");
      const actions = recordRequests(page, isServerAction);
      const success = await notifications(app, "success");

      await unhide.click();
      await expect(appToast(page)).toHaveText("Скрытое снова показывается");
      expect(actions).toHaveLength(1);
      expect(actions[0].postData() ?? "").toContain(`{"id":"${PAUSED}","unhide":true}`);
      expect(await notifications(app, "success")).toBe(success + 1);
      // The answer (`hidden: 0`) replaces the radar: the row is gone.
      await expect(sheet(page, PAUSED).locator("[data-radar-unhide]")).toHaveCount(0);
    });

    test("the tile's switch pauses the radar at once and resumes it with «Радар снова включён. 2 объявления…»", async ({ page }) => {
      const app = await open(page, mode);
      await onTab(page);
      const actions = recordRequests(page, isServerAction);
      const release = await holdActions(page);
      const light = await impacts(app, "light");

      // Optimistic: the tile is paused while its Server Action is still held.
      await tileSwitch(page, ACTIVE).click();
      await expect(tileSwitch(page, ACTIVE)).toHaveAttribute("aria-checked", "false");
      await expect(tile(page, ACTIVE)).toHaveAttribute("data-active", "false");
      await expect(tile(page, ACTIVE).locator("[data-radar-status]")).toHaveText("На паузе");
      await expect.poll(() => actions.length).toBe(1);
      expect(actions[0].postData() ?? "").toContain(`{"id":"${ACTIVE}","active":false}`);
      expect(await impacts(app, "light")).toBe(light + 1);
      const paused = page.waitForResponse((response) => isServerAction(response.request()));
      release();
      await paused;
      await expect(tileSwitch(page, ACTIVE)).toHaveAttribute("aria-checked", "false");
      // Without `ask_found` the pause opens no survey.
      await expect(page).toHaveURL(/\/ru\/radars$/);

      await tileSwitch(page, ACTIVE).click();
      await expect(tileSwitch(page, ACTIVE)).toHaveAttribute("aria-checked", "true");
      // The stub's resume answers `starter: 2` (`radars/patched.json`).
      await expect(appToast(page)).toHaveText("Радар снова включён. В чате с ботом — непросмотренные: 2 объявления");
      expect(actions).toHaveLength(2);
      expect(actions[1].postData() ?? "").toContain(`{"id":"${ACTIVE}","active":true}`);
      await expect(tile(page, ACTIVE).locator("[data-radar-status]")).toHaveText("≈3 в день · сразу");
    });

    test("a mode row changes the mode at once; the same mode sends nothing; the digest row names the user's hours", async ({ page }) => {
      const app = await open(page, mode);
      await onTab(page);
      await openSheet(page, ACTIVE);
      const instant = sheet(page, ACTIVE).locator('[data-radar-mode="instant"]');
      const digest = sheet(page, ACTIVE).locator('[data-radar-mode="digest"]');
      await expect(instant).toHaveAttribute("aria-checked", "true");
      await expect(digest).toHaveAttribute("aria-checked", "false");
      await expect(instant).toContainText("Каждое новое — как только появится");
      // `digest_hours` of `settings/default.json` are 9 and 19.
      await expect(digest.locator("[data-radar-mode-hint]")).toHaveText("Списком в 9 и 19");
      const actions = recordRequests(page, isServerAction);

      await instant.click();
      await nothingAsked(page, isServerAction);
      expect(actions).toEqual([]);

      const release = await holdActions(page);
      const light = await impacts(app, "light");
      await digest.click();
      await expect(digest).toHaveAttribute("aria-checked", "true");
      await expect(instant).toHaveAttribute("aria-checked", "false");
      await expect.poll(() => actions.length).toBe(1);
      expect(actions[0].postData() ?? "").toContain(`{"id":"${ACTIVE}","mode":"digest"}`);
      expect(await impacts(app, "light")).toBe(light + 1);
      const changed = page.waitForResponse((response) => isServerAction(response.request()));
      release();
      await changed;
      await expect(digest).toHaveAttribute("aria-checked", "true");
      await expect(dialog(page).locator("[data-radar-head] [data-radar-status]")).toHaveText("≈3 в день · подборкой");

      await press(page, "backButtonClicked");
      await onTab(page);
      await expect(tile(page, ACTIVE).locator("[data-radar-status]")).toHaveText("≈3 в день · подборкой");
    });

    test("«Удалить радар» asks «Удалить радар «…»?»: Cancel sends nothing; OK deletes, closes the sheet and the tile leaves", async ({ page }) => {
      const app = await open(page, mode);
      await onTab(page);
      await openSheet(page, ACTIVE);
      const actions = recordRequests(page, isServerAction);

      await answerConfirm(page, false);
      await sheet(page, ACTIVE).locator("[data-radar-delete]").click();
      await expect.poll(() => confirms(app)).toEqual(["Удалить радар «2-комн. · до $700»?"]);
      await nothingAsked(page, isServerAction);
      expect(actions).toEqual([]);
      await expect(sheet(page, ACTIVE)).toBeVisible();

      await answerConfirm(page, true);
      const success = await notifications(app, "success");
      await sheet(page, ACTIVE).locator("[data-radar-delete]").click();
      await expect.poll(() => confirms(app)).toHaveLength(2);
      await expect(page).toHaveURL(/\/ru\/radars$/);
      await expect(visible(page, '[data-route="radar"]')).toHaveCount(0);
      expect(actions).toHaveLength(1);
      expect(actions[0].postData() ?? "").toContain(`{"id":"${ACTIVE}"}`);
      expect(await notifications(app, "success")).toBe(success + 1);
      // The stub keeps its list, so only the screen right after the delete shows the radar gone.
      await expect(tile(page, ACTIVE)).toHaveCount(0);
      await expect(tile(page, PAUSED)).toBeVisible();
      await expect(tile(page, DIGEST)).toBeVisible();
      // Without `ask_found` the delete opens no survey and shows no toast (`dev016ErrorToastOnFailure` is off).
      await expect(visible(page, '[data-route="radars/found"]')).toHaveCount(0);
      await expect(appToast(page)).toHaveCount(0);
    });

    test("«Смотреть найденное» opens the radar's feed; Back brings the same sheet without the rise; the search tab keeps the user's search", async ({ page }) => {
      await open(page, mode, "/?rooms_min=3&rooms_max=3");
      await expect(visible(page, "article[data-listing]").first()).toBeVisible();
      const own = address(page);
      await tab(page, "radars").click();
      await onTab(page);
      await openSheet(page, ACTIVE);
      await expect(visible(page, '[data-slot="bottom-sheet"]')).not.toHaveAttribute("data-instant");

      await dialog(page).locator("[data-radar-feed]").click();
      await expect.poll(() => address(page)).toBe(`/ru?${ACTIVE_FEED}`);
      await expect(visible(page, '[data-route="feed"]')).toBeVisible();
      await expect(visible(page, "article[data-listing]").first()).toBeVisible();
      await expect(visible(page, '[data-route="radar"]')).toHaveCount(0);
      await expect(visible(page, '[data-topbar="search-list"] [data-chip="rooms"]')).toHaveAttribute("data-state", "on");

      await press(page, "backButtonClicked");
      await expect(page).toHaveURL(new RegExp(`/ru/radars/${ACTIVE}$`));
      await expect(sheet(page, ACTIVE)).toBeVisible();
      await expect(visible(page, '[data-slot="bottom-sheet"]')).toHaveAttribute("data-instant");
      // The radar tab lies under the sheet again, with its own top bar and tab.
      await expect(visible(page, '[data-topbar="radars"]')).toBeVisible();
      await expect(tab(page, "radars")).toHaveAttribute("aria-current", "page");

      await press(page, "backButtonClicked");
      await onTab(page);
      await tab(page, "search").click();
      await expect.poll(() => address(page)).toBe(own);
      expect(own).toBe("/ru?rooms_min=3&rooms_max=3");
      await expect(visible(page, "article[data-listing]").first()).toBeVisible();
    });

    test("a find opens its listing over the tab; Back brings the radar sheet back, the find no longer «новое»", async ({ page }) => {
      await open(page, mode);
      await onTab(page);
      await openSheet(page, ACTIVE);
      const find = sheet(page, ACTIVE).locator(`[data-radar-find="${FIND}"]`);
      await expect(find.locator("[data-radar-new]")).toBeVisible();

      await find.click();
      await expect(page).toHaveURL(new RegExp(`/ru/listing/${FIND}$`));
      await expect(visible(page, `[data-route="listing"][data-listing-number="${FIND}"]`).first()).toBeVisible();
      await expect(visible(page, '[data-route="radar"]')).toHaveCount(0);

      await press(page, "backButtonClicked");
      await expect(page).toHaveURL(new RegExp(`/ru/radars/${ACTIVE}$`));
      await expect(sheet(page, ACTIVE)).toBeVisible();
      await expect(visible(page, '[data-route="listing"]')).toHaveCount(0);
      await expect(visible(page, '[data-slot="bottom-sheet"]')).toHaveAttribute("data-instant");
      await expect(sheet(page, ACTIVE).locator(`[data-radar-find="${FIND}"] [data-radar-new]`)).toHaveCount(0);

      await press(page, "backButtonClicked");
      await onTab(page);
    });

    test("a direct load of /radars/<id> shows the sheet over the tab; Back goes to the tab", async ({ page }) => {
      await open(page, mode, `/radars/${ACTIVE}`);
      await expect(visible(page, `[data-route="radar"][data-radar-id="${ACTIVE}"]:not([data-layer])`)).toBeVisible();
      await expect(page.getByRole("dialog", { name: "2-комн. · до $700" })).toBeVisible();
      await expect(page.locator(`[data-radar-tile="${ACTIVE}"]`)).toBeAttached();
      await expect.poll(() => backVisible(page)).toBe(true);

      await press(page, "backButtonClicked");
      await onTab(page);
      await expect(tile(page, ACTIVE)).toBeVisible();
    });

    test("a direct load of /radars/<id>/edit shows «Условия радара» over the radar sheet and the tab", async ({ page }) => {
      await open(page, mode, `/radars/${ACTIVE}/edit`);
      await expect(visible(page, '[data-route="radar/edit"]:not([data-state])')).toBeVisible();
      await expect(page.getByRole("dialog", { name: "Условия радара" })).toBeVisible();
      await expect(visible(page, '[data-slot="bottom-sheet"] [data-action="save"]')).toHaveText("Сохранить");
      await expect(page.locator(`[data-route="radar"][data-radar-id="${ACTIVE}"]`)).toBeAttached();
      await expect(page.locator(`[data-radar-tile="${ACTIVE}"]`)).toBeAttached();
    });

    test("Back from a directly loaded editor closes it to the radar sheet, then to the tab", async ({ page }) => {
      await open(page, mode, `/radars/${ACTIVE}/edit`);
      await expect(visible(page, '[data-route="radar/edit"]:not([data-state])')).toBeVisible();

      await press(page, "backButtonClicked");
      await expect(page).toHaveURL(new RegExp(`/ru/radars/${ACTIVE}$`));
      await expect(visible(page, '[data-route="radar/edit"]')).toHaveCount(0);
      await expect(visible(page, `[data-route="radar"][data-radar-id="${ACTIVE}"]`)).toHaveCount(1);
      await expect(page.getByRole("dialog", { name: "2-комн. · до $700" })).toBeVisible();

      await press(page, "backButtonClicked");
      await onTab(page);
    });

    test("Back from the radar's feed brings the tab back to where it was scrolled", async ({ page }) => {
      const scrolled = await scrollTheTab(page, mode);
      await openSheet(page, DIGEST);

      await dialog(page).locator("[data-radar-feed]").click();
      await expect(page).toHaveURL(/\/ru\?.*deal=sale.*from=radar/);
      await expect(visible(page, '[data-route="feed"]')).toBeVisible();
      // The feed is scrolled somewhere else meanwhile, so only the return can bring the tab's position back.
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

      await press(page, "backButtonClicked");
      await expect(page).toHaveURL(new RegExp(`/ru/radars/${DIGEST}$`));
      await expect(sheet(page, DIGEST)).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrolled);
    });

    test("«Смотреть найденное» opens the radar's feed at its top, wherever the tab was scrolled", async ({ page }) => {
      await scrollTheTab(page, mode);
      await openSheet(page, DIGEST);

      await dialog(page).locator("[data-radar-feed]").click();
      await expect(page).toHaveURL(/\/ru\?.*deal=sale.*from=radar/);
      await expect(visible(page, '[data-route="feed"]')).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    });

    test("a radar the list does not hold gives way to the tab", async ({ page }) => {
      await open(page, mode, `/radars/${UNKNOWN}`);
      await onTab(page);
    });

    test("pull-to-refresh reads the list again, with the previews", async ({ page }) => {
      await open(page, mode);
      await onTab(page);
      await page.waitForLoadState("networkidle");
      const radarReads = recordRequests(page, isRadarRead);

      await touchDrag(page, { x: 195, y: 300 }, { x: 195, y: 500 });
      await expect.poll(() => radarReads.length).toBe(1);
      expect(queryOf(radarReads[0])).toBe("?include=previews");
      await expect(page.locator("[data-ptr]")).toHaveAttribute("data-ptr", "idle");
      await expect(visible(page, "[data-radar-tile]")).toHaveCount(3);
    });
  });
}

test.describe("radar tab (cookie mode only)", () => {
  /**
   * The feed's rule for a first launch (WP-24): the list is read once through `/bff`, and the refresh after the
   * sign-in renders with the new cookie. A reload carries the cookie: the server's read is in the document and the
   * browser asks for nothing.
   */
  test("a first launch on /radars reads the list once through /bff; after a reload the server's read is used", async ({ page }) => {
    const radarReads = recordRequests(page, isRadarRead);
    await open(page, "cookie");
    await onTab(page);
    await page.waitForLoadState("networkidle");
    expect(radarReads.map(queryOf)).toEqual(["?include=previews"]);

    const afterReload = recordRequests(page, isRadarRead);
    await page.reload();
    await expect(html(page)).toHaveAttribute("data-session", "ready");
    await onTab(page);
    await page.waitForLoadState("networkidle");
    expect(afterReload).toEqual([]);
  });
});
