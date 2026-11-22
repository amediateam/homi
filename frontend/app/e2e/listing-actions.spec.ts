import { expect, launchApp, type LaunchedApp, setScenario, stubMedia, test as base } from "@homi/testing/playwright";
import type { Page, Request } from "@playwright/test";

/**
 * The actions sheet of the listing (WP-26, SCR-023, BR-APP-036, BR-APP-037) against the API on stubs, in cookie and
 * header mode: hide from a listing opened over the feed (the toast's «Вернуть» brings the card back; the feed lacks it
 * meanwhile and the history did not grow); block (every listing of the author leaves the feed, the toast names the
 * author with the server's masked label); a `fraud` report that hides the listing (its toast offers «Показывать у
 * меня»); «Уже сдано», whose «Вернуть» withdraws the report and brings the card back, or hides it again when that
 * fails; the realtor report, whose toast follows `agent_marked` (the scenario `agent_marked`); a failed report (the
 * scenario `source_unavailable`, set right before the tap) keeps the sheet with «Не получилось сохранить» in its own
 * toast host; «Неверные данные» → the detail step → «Цена» → «Спасибо! Посмотрим», with the chevron back to the reasons and
 * Telegram's Back from the reasons to the menu; directly loaded, the menu shows the phone block hint and Telegram's
 * Back closes it to the listing, and the report step's × closes it to the listing, from where Back goes to the feed
 * (review X1). Each action is one Server Action. `history.length` still counts the forward entries a back step
 * leaves, so "unchanged" is checked against the length while the sheet was open. Each test launches once; the full
 * run shares one stub user's API limit (120 a minute, KI-32). Every photo is answered by `stubMedia`.
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

/** The first card of the default feed (sort `new`); its author is the phone `+998 ** *** ** 67`. */
const LISTING = 100001;
/** The other listings of the blocked author (`hidden/blocked_author.json`). */
const AUTHOR_LISTINGS = [100001, 101001, 101005];

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const html = (page: Page) => page.locator("html");
const route = (page: Page, name: string) => visible(page, `[data-route="${name}"]`);
const cards = (page: Page) => visible(page, "article[data-listing]");
const card = (page: Page, number: number) => visible(page, `article[data-listing="${number}"]`);
/** The listing layer of `number` (each layer carries its own number, also a hidden one). */
const layer = (page: Page, number: number) => visible(page, `[data-route="listing"][data-listing-number="${number}"]`);
/** The sheet's content, portalled into its dialog; `data-step` is `menu`, `report` or `detail`. */
const sheet = (page: Page) => visible(page, '[role="dialog"] [data-route="listing/actions"]');
const row = (page: Page, action: string) => sheet(page).locator(`button[data-action-row="${action}"]`);
const chevron = (page: Page) => visible(page, "button[data-sheet-back]");
const appToast = (page: Page) => visible(page, '[data-toast-host="app"] [data-toast]');
const sheetToast = (page: Page) => visible(page, '[data-toast-host="sheet"] [data-toast]');
const press = (page: Page, eventType: "backButtonClicked") =>
  page.evaluate((type) => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.emit(type), eventType);
const backVisible = (page: Page) =>
  page.evaluate(() => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.webApp.BackButton.isVisible);
const historyLength = (page: Page) => page.evaluate(() => window.history.length);
/** The address as the app spells it: path and query, the locale segment included. */
const address = (page: Page) => {
  const url = new URL(page.url());
  return url.pathname + url.search;
};
/** The listing numbers of the visible cards, in their order. */
const numbersOf = (page: Page) => cards(page).evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("data-listing"))));

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

/** Fails if the page asks for anything that `match`es within `ms`: a bounded window for "nothing more follows". */
const nothingAsked = (page: Page, match: (request: Request) => boolean, ms = 1_000) =>
  expect(page.waitForRequest(match, { timeout: ms })).rejects.toThrow(/Timeout/);

/** Success and error notifications the page asked the fake Telegram for so far (TMA-025). */
async function notifications(app: LaunchedApp, type: "success" | "error"): Promise<number> {
  return (await app.calls()).filter((call) => call.member === "HapticFeedback.notificationOccurred" && call.args[0] === type).length;
}

/** Launches the app as the bot does, in a session mode, and waits for the session. */
async function open(page: Page, mode: Mode, path = "/"): Promise<LaunchedApp> {
  const app = await launchApp(page, { mode, path });
  await expect(html(page)).toHaveAttribute("data-session", "ready");
  return app;
}

/** The listing's details are on screen. */
const loaded = (page: Page, number: number) =>
  expect(layer(page, number).first().locator("[data-listing-state]")).toHaveAttribute("data-listing-state", "loaded");

/** «⋯» of the listing opens the menu step of the sheet. */
async function openMenu(page: Page, number: number): Promise<void> {
  await layer(page, number).first().locator('button[data-action="menu"]').click();
  await expect(page).toHaveURL(new RegExp(`/ru/listing/${number}/actions$`));
  await expect(page.getByRole("dialog", { name: "Объявление" })).toBeVisible();
  await expect(sheet(page)).toHaveAttribute("data-step", "menu");
}

/** Back on the feed: its address, the feed visible, no listing layer or sheet left. */
async function onFeed(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/ru$/);
  await expect(route(page, "feed")).toBeVisible();
  await expect(visible(page, '[data-route="listing"]')).toHaveCount(0);
  await expect(visible(page, '[data-route^="listing/"]')).toHaveCount(0);
}

/** A sheet closed to its listing: no child of the listing left on screen, the listing itself still there. */
async function onListing(page: Page, number: number): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`/ru/listing/${number}$`));
  await expect(visible(page, '[data-route^="listing/"]')).toHaveCount(0);
  await expect(visible(page, '[data-route="listing"]').first()).toBeVisible();
  await loaded(page, number);
}

for (const mode of ["cookie", "header"] as const) {
  test.describe(`listing actions (${mode} mode)`, { annotation: [{ type: "screen", description: "SCR-023" }, { type: "screen", description: "SCR-042" }] }, () => {
    test("hide: the toast offers «Вернуть»; the feed lacks the card and the history did not grow; «Вернуть» brings it back", async ({ page }) => {
      const app = await open(page, mode);
      await expect(card(page, LISTING)).toBeVisible();
      const before = await numbersOf(page);
      await card(page, LISTING).locator("a").click();
      await loaded(page, LISTING);
      await openMenu(page, LISTING);
      await expect(chevron(page)).toHaveCount(0);
      const entries = await historyLength(page);
      const actions = recordRequests(page, isServerAction);

      await row(page, "hide").click();
      await expect(appToast(page)).toContainText("Объявление скрыто");
      await onFeed(page);
      await expect(card(page, LISTING)).toHaveCount(0);
      expect(await numbersOf(page)).toEqual(before.filter((number) => number !== LISTING));
      expect(await historyLength(page)).toBe(entries);
      await expect.poll(() => backVisible(page)).toBe(false);
      expect(actions).toHaveLength(1);
      expect(actions[0].postData() ?? "").toContain(`{"number":${LISTING}}`);
      expect(await notifications(app, "success")).toBe(1);

      await appToast(page).getByRole("button", { name: "Вернуть" }).click();
      await expect(card(page, LISTING)).toBeVisible();
      expect(await numbersOf(page)).toEqual(before);
      await expect.poll(() => actions.length).toBe(2);
      expect(actions[1].postData() ?? "").toContain(`{"number":${LISTING}}`);
    });

    test("hide on a listing loaded directly: the sheet and the listing close to the feed in one move (WP-36)", async ({ page }) => {
      await open(page, mode, `/listing/${LISTING}`);
      await loaded(page, LISTING);
      await openMenu(page, LISTING);

      await row(page, "hide").click();
      await expect(appToast(page)).toContainText("Объявление скрыто");
      await onFeed(page);
      await expect(card(page, LISTING)).toHaveCount(0);
    });

    test("block: every listing of the author leaves the feed; the toast names the author by the server's label", async ({ page }) => {
      await open(page, mode);
      await expect(card(page, LISTING)).toBeVisible();
      const before = await numbersOf(page);
      // The author's listings are on page one, so their leaving is seen.
      expect(before).toEqual(expect.arrayContaining(AUTHOR_LISTINGS));
      await card(page, LISTING).locator("a").click();
      await loaded(page, LISTING);
      await openMenu(page, LISTING);
      await expect(row(page, "block")).toContainText("Не показывать объявления с номера +998 ** *** ** 67");
      const entries = await historyLength(page);
      const actions = recordRequests(page, isServerAction);

      await row(page, "block").click();
      await expect(appToast(page)).toContainText(/Автор\s\+998 \*\* \*\*\* \*\* 67\sзаблокирован/);
      await expect(appToast(page).getByRole("button", { name: "Вернуть" })).toBeVisible();
      await onFeed(page);
      expect(await numbersOf(page)).toEqual(before.filter((number) => !AUTHOR_LISTINGS.includes(number)));
      for (const number of AUTHOR_LISTINGS) {
        await expect(card(page, number)).toHaveCount(0);
      }
      expect(await historyLength(page)).toBe(entries);
      expect(actions).toHaveLength(1);
      expect(actions[0].postData() ?? "").toContain(`{"number":${LISTING}}`);
    });

    test("a «Мошенничество или спам» report hides the listing: the sheet and the listing close, the toast offers «Показывать у меня»", async ({ page }) => {
      await open(page, mode, `/ru/listing/${LISTING}`);
      await loaded(page, LISTING);
      await openMenu(page, LISTING);
      await row(page, "report").click();
      await expect(page.getByRole("dialog", { name: "Что не так?" })).toBeVisible();
      const actions = recordRequests(page, isServerAction);

      await row(page, "fraud").click();
      await expect(appToast(page)).toContainText("Спасибо, посмотрим. Это объявление у вас скрыли");
      await expect(appToast(page).getByRole("button", { name: "Показывать у меня" })).toBeVisible();
      // Loaded directly, the history holds nothing to step back over: the feed replaces the address.
      await onFeed(page);
      await expect(cards(page).first()).toBeVisible();
      await expect(card(page, LISTING)).toHaveCount(0);
      expect(actions).toHaveLength(1);
      const body = actions[0].postData() ?? "";
      expect(body).toContain(`"number":${LISTING}`);
      expect(body).toContain('"reason":"fraud"');
    });

    test("«Уже сдано»: the card leaves the feed; «Вернуть» withdraws the report with one Server Action and brings it back", async ({ page }) => {
      await open(page, mode);
      await expect(card(page, LISTING)).toBeVisible();
      const before = await numbersOf(page);
      await card(page, LISTING).locator("a").click();
      await loaded(page, LISTING);
      await openMenu(page, LISTING);
      await row(page, "report").click();
      await expect(page.getByRole("dialog", { name: "Что не так?" })).toBeVisible();
      const actions = recordRequests(page, isServerAction);

      await row(page, "rented").click();
      await expect(appToast(page)).toContainText("Отметили: уже сдано");
      await onFeed(page);
      await expect(card(page, LISTING)).toHaveCount(0);
      expect(actions).toHaveLength(1);
      expect(actions[0].postData() ?? "").toContain('"reason":"rented"');

      await appToast(page).getByRole("button", { name: "Вернуть" }).click();
      await expect(card(page, LISTING)).toBeVisible();
      expect(await numbersOf(page)).toEqual(before);
      await expect.poll(() => actions.length).toBe(2);
      // `unreportListing` (DELETE /listings/{number}/reports), not the report again: the body is the number alone.
      expect(actions[1].postData() ?? "").toContain(`{"number":${LISTING}}`);
      expect(actions[1].headers()["next-action"]).not.toBe(actions[0].headers()["next-action"]);
      await nothingAsked(page, isServerAction);
      await expect(appToast(page)).toHaveCount(0);
    });

    test("«Вернуть» of «Уже сдано» that fails hides the card again with «Не получилось сохранить» and the error haptic", async ({ page }) => {
      const app = await open(page, mode);
      await expect(card(page, LISTING)).toBeVisible();
      await card(page, LISTING).locator("a").click();
      await loaded(page, LISTING);
      await openMenu(page, LISTING);
      await row(page, "report").click();
      await row(page, "rented").click();
      await expect(appToast(page)).toContainText("Отметили: уже сдано");
      await onFeed(page);

      // The withdrawal fails on the API (`503 source_unavailable`); set right before the tap.
      await setScenario(page, "source_unavailable");
      const answered = page.waitForResponse((response) => isServerAction(response.request()));
      await appToast(page).getByRole("button", { name: "Вернуть" }).click();
      await answered;
      await expect(appToast(page)).toHaveText("Не получилось сохранить");
      await setScenario(page, null);
      await expect(card(page, LISTING)).toHaveCount(0);
      expect(await notifications(app, "error")).toBe(1);
    });

    test("«Это риелтор, а не хозяин»: «Спасибо, учёл вашу отметку», and «Отметили номер как риелторский» when the answer marks the author", async ({ page }) => {
      await open(page, mode, `/ru/listing/${LISTING}`);
      await loaded(page, LISTING);
      const actions = recordRequests(page, isServerAction);

      for (const [scenario, text] of [
        [null, "Спасибо, учёл вашу отметку"],
        ["agent_marked", "Отметили номер как риелторский"],
      ] as const) {
        await openMenu(page, LISTING);
        await row(page, "report").click();
        await expect(row(page, "agent")).toContainText("Отметим номер как риелторский");
        if (scenario !== null) {
          await setScenario(page, scenario);
        }
        await row(page, "agent").click();
        await expect(appToast(page)).toHaveText(text);
        await setScenario(page, null);
        await onListing(page, LISTING);
      }
      expect(actions.map((request) => request.postData() ?? "").filter((body) => body.includes('"reason":"agent"'))).toHaveLength(2);
    });

    test("a failed report keeps the sheet on its step with «Не получилось сохранить» and the error haptic", async ({ page }) => {
      const app = await open(page, mode, `/ru/listing/${LISTING}`);
      await loaded(page, LISTING);
      await openMenu(page, LISTING);
      await row(page, "report").click();
      await expect(page.getByRole("dialog", { name: "Что не так?" })).toBeVisible();
      const actions = recordRequests(page, isServerAction);

      // The report fails on the API (`503 source_unavailable`); set right before the tap, as it fails every stub read.
      await setScenario(page, "source_unavailable");
      await row(page, "fraud").click();
      await expect(sheetToast(page)).toHaveText("Не получилось сохранить");
      await setScenario(page, null);
      expect(await notifications(app, "error")).toBe(1);
      expect(await notifications(app, "success")).toBe(0);
      await expect(page.getByRole("dialog", { name: "Что не так?" })).toBeVisible();
      await expect(sheet(page)).toHaveAttribute("data-step", "report");
      expect(address(page)).toBe(`/ru/listing/${LISTING}/actions?step=report`);
      await expect(row(page, "fraud")).toBeEnabled();
      await expect(appToast(page)).toHaveCount(0);
      expect(actions).toHaveLength(1);
    });

    test("«Неверные данные» opens the detail step; its chevron returns to the reasons, Back to the menu; «Цена» thanks", async ({ page }) => {
      await open(page, mode, `/ru/listing/${LISTING}`);
      await loaded(page, LISTING);
      await openMenu(page, LISTING);
      await expect(chevron(page)).toHaveCount(0);
      const actions = recordRequests(page, isServerAction);

      await row(page, "report").click();
      await expect(page.getByRole("dialog", { name: "Что не так?" })).toBeVisible();
      await expect(sheet(page)).toHaveAttribute("data-step", "report");
      await expect(chevron(page)).toBeVisible();
      await row(page, "wrong_data").click();
      await expect(page.getByRole("dialog", { name: "Что именно неверно?" })).toBeVisible();
      await expect(sheet(page)).toHaveAttribute("data-step", "detail");
      expect(address(page)).toBe(`/ru/listing/${LISTING}/actions?step=detail`);
      await expect(sheet(page).locator("button[data-action-row]")).toHaveCount(5);
      // Opening the step asks nothing.
      expect(actions).toEqual([]);

      await chevron(page).click();
      await expect(page.getByRole("dialog", { name: "Что не так?" })).toBeVisible();
      await expect.poll(() => address(page)).toBe(`/ru/listing/${LISTING}/actions?step=report`);
      await press(page, "backButtonClicked");
      await expect(page.getByRole("dialog", { name: "Объявление" })).toBeVisible();
      await expect.poll(() => address(page)).toBe(`/ru/listing/${LISTING}/actions`);
      await expect(chevron(page)).toHaveCount(0);

      await row(page, "report").click();
      await row(page, "wrong_data").click();
      await expect(page.getByRole("dialog", { name: "Что именно неверно?" })).toBeVisible();
      await row(page, "price").click();
      await expect(appToast(page)).toHaveText("Спасибо! Посмотрим");
      await onListing(page, LISTING);
      expect(actions).toHaveLength(1);
      const body = actions[0].postData() ?? "";
      expect(body).toContain('"reason":"wrong_data"');
      expect(body).toContain('"detail":"price"');
      await nothingAsked(page, isServerAction, 500);
    });

    test("a direct load of the menu shows the phone block hint; Telegram's Back closes it to the listing, Back then to the feed", async ({ page }) => {
      await open(page, mode, `/ru/listing/${LISTING}/actions`);
      await expect(page.getByRole("dialog", { name: "Объявление" })).toBeVisible();
      // The listing's resource reaches the portalled sheet: the author's hint, not the generic one.
      await expect(row(page, "block")).toContainText("Не показывать объявления с номера +998 ** *** ** 67");
      await expect(row(page, "support")).toHaveCount(0);

      await press(page, "backButtonClicked");
      await onListing(page, LISTING);
      await expect.poll(() => backVisible(page)).toBe(true);

      await press(page, "backButtonClicked");
      await onFeed(page);
    });

    test("a direct load of the report step: its × closes the sheet to the listing, Back then to the feed", async ({ page }) => {
      await open(page, mode, `/ru/listing/${LISTING}/actions?step=report`);
      await expect(page.getByRole("dialog", { name: "Что не так?" })).toBeVisible();
      await expect(sheet(page)).toHaveAttribute("data-step", "report");

      await visible(page, '[data-slot="bottom-sheet-close"]').click();
      await onListing(page, LISTING);

      await press(page, "backButtonClicked");
      await onFeed(page);
    });
  });
}
