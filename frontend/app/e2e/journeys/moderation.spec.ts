import { expect, launchApp, type LaunchedApp, stubMedia, test } from "@homi/testing/playwright";
import type { Page, Request } from "@playwright/test";

import { LISTING } from "../support/pages";

/**
 * Journey 4 of WP-33 (`moderation`): one launch walks the listing's moderation and the way back from «Скрытое», on the
 * API's stubs, in each project's session mode. From the feed the first card (`LISTING`, author `+998 ** *** ** 67`)
 * is opened four times and its «⋯» five times. The realtor report comes first: its toast has no button and the
 * listing stays open, so the hide that follows starts from the same opening (one opening and one Back fewer against
 * the stub user's API limit, KI-32). Then hide (toast «Объявление скрыто» with «Вернуть»), block the author (his
 * three listings of page one leave; «Вернуть»), a «Мошенничество или спам» report (its undo reads «Показывать у
 * меня», never «Вернуть», and only un-hides) and «Уже сдано» (with «Вернуть»: `dev051RentedUndo` is on by default,
 * DEC-58, as in `index-CIa0Ldj2.js`, so the undo withdraws the report, DEC-68). Every undo brings the cards back in
 * their order; a successful undo plays no haptic, a failed one the error haptic, so no error haptic may follow. The
 * cards come back before the undo's answer and the stub stores no write, so which write an undo makes shows only in
 * the `Next-Action` id of its Server Action, one per action function. The ids are kept across the steps: the hide
 * undo's (`unhideListing`) is also the fraud undo's and that of «Вернуть» on «Скрытое»; the block undo
 * (`unblockAuthor`) and the rented undo differ from it and from each other, and the rented undo's id is none of the
 * sheet's five other actions (report, hide, unhide, block, unblock), which leaves `unreportListing`. Then the
 * settings tab, «Скрытое» on the stub's own list (`hidden/default.json`, not what this test hid): one listing
 * returned, «Показать всё снова» asked first (Cancel keeps every row and sends nothing), then OK leaves «Ничего не
 * скрыто», and Telegram's Back closes the page to the settings tab. Every change there is optimistic, so the success
 * haptic, which follows only an `ok` answer, proves the write. An action toast lives 6 s (`TOAST_ACTION_MS`), so each
 * undo is tapped right after its toast is checked.
 */

test.describe.configure({ timeout: 120_000 });

interface Fake {
  answers: { confirm: boolean };
  emit(eventType: string): void;
}

const API_MS = 20_000;
/** `LISTING` and the other listings of its stub author on page one of the feed (`hidden/blocked_author.json`). */
const AUTHOR_LISTINGS = [100001, 101001, 101005];

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const html = (page: Page) => page.locator("html");
const route = (page: Page, name: string) => visible(page, `[data-route="${name}"]`);
const tab = (page: Page, key: "search" | "saved" | "radars" | "settings") => visible(page, `[data-tab="${key}"]`);

/**
 * A tab press on expanded chrome: after a scroll of the feed the chrome is mini and only the current tab takes a tap,
 * which expands it (`feed-continuity.spec.ts`).
 */
async function pressTab(page: Page, key: "search" | "saved" | "radars" | "settings"): Promise<void> {
  if (await html(page).evaluate((node) => node.classList.contains("chrome-mini"))) {
    await visible(page, '[data-tab][aria-current="page"]').click();
    await expect(html(page)).not.toHaveClass(/chrome-mini/);
  }
  await tab(page, key).click();
}
const cards = (page: Page) => visible(page, "article[data-listing]");
const card = (page: Page, number: number) => visible(page, `article[data-listing="${number}"]`);
/** The listing layer of `number` (each layer carries its own number, also a hidden one). */
const layer = (page: Page, number: number) => visible(page, `[data-route="listing"][data-listing-number="${number}"]`);
/** The actions sheet's content, portalled into its dialog; `data-step` is `menu`, `report` or `detail`. */
const sheet = (page: Page) => visible(page, '[role="dialog"] [data-route="listing/actions"]');
const row = (page: Page, action: string) => sheet(page).locator(`button[data-action-row="${action}"]`);
const appToast = (page: Page) => visible(page, '[data-toast-host="app"] [data-toast]');
const hiddenAuthors = (page: Page) => visible(page, "[data-hidden-author]");
const hiddenListings = (page: Page) => visible(page, "[data-hidden-listing]");
const pressBack = (page: Page) => page.evaluate(() => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.emit("backButtonClicked"));
const backVisible = (page: Page) =>
  page.evaluate(() => (window as unknown as { Telegram: { WebApp: { BackButton: { isVisible: boolean } } } }).Telegram.WebApp.BackButton.isVisible);
/** What the simulated user answers to the next `showConfirm` (`fake.answers`, the live object). */
const answerConfirm = (page: Page, confirm: boolean) =>
  page.evaluate((value) => {
    (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.answers.confirm = value;
  }, confirm);
/** The listing numbers of the visible cards, in their order. */
const numbersOf = (page: Page) => cards(page).evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("data-listing"))));

/** A Server Action call: a POST to the page's address carrying the `Next-Action` header. */
const isServerAction = (request: Request) => request.method() === "POST" && request.headers()["next-action"] !== undefined;
/** The id of a Server Action call: one per action function, so a hide and its undo differ. */
const actionId = (request: Request) => request.headers()["next-action"];

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

/** The texts of the `showConfirm` questions the page asked the fake Telegram so far (TMA-026). */
async function questions(app: LaunchedApp): Promise<string[]> {
  return (await app.calls()).filter((call) => call.member === "showConfirm").map((call) => String(call.args[0]));
}

/** Success and error notifications the page asked the fake Telegram for so far (TMA-025). */
async function notifications(app: LaunchedApp, type: "success" | "error"): Promise<number> {
  return (await app.calls()).filter((call) => call.member === "HapticFeedback.notificationOccurred" && call.args[0] === type).length;
}

/**
 * The listing's details are on screen: its loaded state and its own title row (SCR-018). A layer may hold a kept copy
 * of its screen beside the shown one, so each lookup takes the visible copy.
 */
async function loaded(page: Page, number: number): Promise<void> {
  const shown = layer(page, number).first().locator('[data-listing-state="loaded"]').filter({ visible: true }).first();
  await expect(shown).toBeVisible();
  await expect(shown.locator("[data-title-row] [data-listing-title]")).toHaveText(/\S/);
}

/** A card of the feed opens its listing over the feed. */
async function openListing(page: Page, number: number): Promise<void> {
  await card(page, number).locator("a").click();
  await expect(page).toHaveURL(new RegExp(`/ru/listing/${number}$`));
  await loaded(page, number);
}

/** «⋯» of the listing opens the menu step of the sheet. */
async function openMenu(page: Page, number: number): Promise<void> {
  // A layer may hold a kept copy of its screen beside the shown one: the visible button.
  await layer(page, number).first().locator('button[data-action="menu"]').filter({ visible: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/ru/listing/${number}/actions$`));
  await expect(page.getByRole("dialog", { name: "Объявление" })).toBeVisible();
  await expect(sheet(page)).toHaveAttribute("data-step", "menu");
}

/** «Пожаловаться» of the menu: the reasons step. */
async function openReasons(page: Page): Promise<void> {
  await row(page, "report").click();
  await expect(page.getByRole("dialog", { name: "Что не так?" })).toBeVisible();
  await expect(sheet(page)).toHaveAttribute("data-step", "report");
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
  await loaded(page, number);
}

/**
 * The toast's undo button `label` runs its Server Action and its answer arrives. The tap itself closes the toast, and
 * a failed undo hides the cards again with the error haptic only after the answer, so the step checks the error
 * haptic after its own checks, and the next step's opening of `LISTING` fails on a card hidden again.
 */
async function undo(page: Page, label: string): Promise<void> {
  const answered = page.waitForResponse((response) => isServerAction(response.request()));
  await appToast(page).getByRole("button", { name: label }).click();
  await answered;
  await expect(appToast(page)).toHaveCount(0);
}

test.describe(
  "moderation: hide, block and report a listing, then return everything from «Скрытое» @journey",
  {
    annotation: [
      { type: "screen", description: "SCR-006" },
      { type: "screen", description: "SCR-007" },
      { type: "screen", description: "SCR-018" },
      { type: "screen", description: "SCR-023" },
      { type: "screen", description: "SCR-032" },
      { type: "screen", description: "SCR-039" },
      { type: "screen", description: "SCR-042" },
      { type: "screen", description: "SCR-043" },
    ],
  },
  () => {
    test("listing → «⋯» → realtor, hide, block, fraud, «Уже сдано» → settings → «Скрытое» → return one → «Показать всё снова» → Back", async ({ page }) => {
      await stubMedia(page);
      const app = await launchApp(page);
      await expect(html(page)).toHaveAttribute("data-session", "ready", { timeout: API_MS });
      await expect(card(page, LISTING)).toBeVisible({ timeout: API_MS });
      const feed = await numbersOf(page);
      // The author's listings are on page one, so their leaving and returning are seen.
      expect(feed).toEqual(expect.arrayContaining(AUTHOR_LISTINGS));
      const actions = recordRequests(page, isServerAction);
      const bodies = (from: number) => actions.slice(from).map((request) => request.postData() ?? "");
      /** A failed undo plays the error haptic; none may follow. */
      const errors = await notifications(app, "error");
      /** The `Next-Action` id of each action of the sheet, kept from the step that first sends it. */
      let reportId: string | undefined;
      let hideId: string | undefined;
      let unhideId: string | undefined;
      let blockId: string | undefined;
      let unblockId: string | undefined;

      await test.step("«Это риелтор, а не хозяин»: a toast without a button; the listing stays open", async () => {
        await openListing(page, LISTING);
        await openMenu(page, LISTING);
        await openReasons(page);
        const from = actions.length;

        await row(page, "agent").click();
        await expect(appToast(page)).toHaveText("Спасибо, учёл вашу отметку");
        await expect(appToast(page).getByRole("button")).toHaveCount(0);
        await onListing(page, LISTING);
        expect(bodies(from)).toHaveLength(1);
        expect(bodies(from)[0]).toContain('"reason":"agent"');
        // `reportListing`: the fraud and the rented report carry the same id.
        reportId = actionId(actions[from]);
      });

      await test.step("hide, from the same opening: the card leaves the feed with «Объявление скрыто» · «Вернуть»; «Вернуть» brings it back", async () => {
        await openMenu(page, LISTING);
        const from = actions.length;

        await row(page, "hide").click();
        await expect(appToast(page)).toContainText("Объявление скрыто");
        await expect(appToast(page).getByRole("button", { name: "Вернуть" })).toBeVisible();
        await onFeed(page);
        await expect(card(page, LISTING)).toHaveCount(0);
        // The realtor report removed nothing: the feed lacks this card alone.
        expect(await numbersOf(page)).toEqual(feed.filter((number) => number !== LISTING));

        await undo(page, "Вернуть");
        await expect(card(page, LISTING)).toBeVisible();
        expect(await numbersOf(page)).toEqual(feed);
        await expect.poll(() => backVisible(page)).toBe(false);
        const sent = actions.slice(from);
        expect(sent).toHaveLength(2);
        expect(sent[0].postData() ?? "").toContain(`{"number":${LISTING}}`);
        // `unhideListing`, not the hide again: the same body, another action. Its id is the one the fraud undo and
        // «Вернуть» on «Скрытое» must carry.
        expect(sent[1].postData() ?? "").toContain(`{"number":${LISTING}}`);
        hideId = actionId(sent[0]);
        unhideId = actionId(sent[1]);
        expect([reportId, hideId]).not.toContain(unhideId);
        expect(hideId).not.toBe(reportId);
        expect(await notifications(app, "error")).toBe(errors);
      });

      await test.step("block: every listing of the author leaves with «Автор … заблокирован» · «Вернуть»; «Вернуть» brings them back", async () => {
        await openListing(page, LISTING);
        await openMenu(page, LISTING);
        await expect(row(page, "block")).toContainText("Не показывать объявления с номера +998 ** *** ** 67");
        const from = actions.length;

        await row(page, "block").click();
        await expect(appToast(page)).toContainText(/Автор\s\+998 \*\* \*\*\* \*\* 67\sзаблокирован/);
        await expect(appToast(page).getByRole("button", { name: "Вернуть" })).toBeVisible();
        await onFeed(page);
        for (const number of AUTHOR_LISTINGS) {
          await expect(card(page, number)).toHaveCount(0);
        }
        expect(await numbersOf(page)).toEqual(feed.filter((number) => !AUTHOR_LISTINGS.includes(number)));

        await undo(page, "Вернуть");
        for (const number of AUTHOR_LISTINGS) {
          await expect(card(page, number)).toBeVisible();
        }
        expect(await numbersOf(page)).toEqual(feed);
        const sent = actions.slice(from);
        expect(sent).toHaveLength(2);
        expect(sent[0].postData() ?? "").toContain(`{"number":${LISTING}}`);
        // `blockAuthor`, then `unblockAuthor` (DELETE /listings/{number}/blocked-author): both send the body of the hide
        // and its undo, each with an id of its own.
        expect(sent[1].postData() ?? "").toContain(`{"number":${LISTING}}`);
        blockId = actionId(sent[0]);
        unblockId = actionId(sent[1]);
        expect([reportId, hideId, unhideId]).not.toContain(blockId);
        expect([reportId, hideId, unhideId, blockId]).not.toContain(unblockId);
        expect(await notifications(app, "error")).toBe(errors);
      });

      await test.step("«Мошенничество или спам»: the listing leaves; its toast offers «Показывать у меня», not «Вернуть», which brings it back with the hide's undo", async () => {
        await openListing(page, LISTING);
        await openMenu(page, LISTING);
        await openReasons(page);
        const from = actions.length;

        await row(page, "fraud").click();
        await expect(appToast(page)).toContainText("Спасибо, посмотрим. Это объявление у вас скрыли");
        await expect(appToast(page).getByRole("button", { name: "Показывать у меня" })).toBeVisible();
        await expect(appToast(page).getByRole("button", { name: "Вернуть" })).toHaveCount(0);
        await onFeed(page);
        await expect(card(page, LISTING)).toHaveCount(0);

        await undo(page, "Показывать у меня");
        await expect(card(page, LISTING)).toBeVisible();
        expect(await numbersOf(page)).toEqual(feed);
        const sent = actions.slice(from);
        expect(sent).toHaveLength(2);
        expect(sent[0].postData() ?? "").toContain('"reason":"fraud"');
        expect(actionId(sent[0])).toBe(reportId);
        // «Показывать у меня» only un-hides: `unhideListing`, the hide undo's id, not `unreportListing`, which would
        // withdraw nothing but a `rented` report (DEC-68).
        expect(sent[1].postData() ?? "").toContain(`{"number":${LISTING}}`);
        expect(actionId(sent[1])).toBe(unhideId);
        expect(await notifications(app, "error")).toBe(errors);
      });

      await test.step("«Уже сдано»: the listing leaves with «Отметили: уже сдано» · «Вернуть», which withdraws the report and brings it back", async () => {
        await openListing(page, LISTING);
        await openMenu(page, LISTING);
        await openReasons(page);
        const from = actions.length;

        await row(page, "rented").click();
        await expect(appToast(page)).toContainText("Отметили: уже сдано");
        await expect(appToast(page).getByRole("button", { name: "Вернуть" })).toBeVisible();
        await onFeed(page);
        await expect(card(page, LISTING)).toHaveCount(0);

        await undo(page, "Вернуть");
        await expect(card(page, LISTING)).toBeVisible();
        expect(await numbersOf(page)).toEqual(feed);
        const sent = actions.slice(from);
        expect(sent).toHaveLength(2);
        expect(sent[0].postData() ?? "").toContain('"reason":"rented"');
        expect(actionId(sent[0])).toBe(reportId);
        // `unreportListing` (DELETE /listings/{number}/reports, DEC-68): its body is the number alone, as are those of
        // the hide, the block and their undos, but its id is none of theirs nor the report's. Of the sheet's six
        // actions only it is left, so the undo withdraws the report rather than only un-hiding.
        expect(sent[1].postData() ?? "").toContain(`{"number":${LISTING}}`);
        expect([reportId, hideId, unhideId, blockId, unblockId]).not.toContain(actionId(sent[1]));
        expect(await notifications(app, "error")).toBe(errors);
      });

      let listingCount = 0;
      await test.step("the settings tab: «Скрытое» counts the hidden authors and listings and opens the list", async () => {
        await pressTab(page, "settings");
        await expect(page).toHaveURL(/\/ru\/settings$/);
        await expect(tab(page, "settings")).toHaveAttribute("aria-current", "page");
        await expect(visible(page, '[data-topbar="settings"] h1')).toHaveText("Настройки");
        const hiddenRow = visible(page, '[data-settings-row="hidden"]');
        await expect(hiddenRow).toBeVisible({ timeout: API_MS });
        // The last undo («Уже сдано») is followed by no opening of the listing: its failure would show here.
        expect(await notifications(app, "error")).toBe(errors);
        const count = Number(await hiddenRow.locator("[data-settings-value]").textContent());

        await hiddenRow.click();
        await expect(page).toHaveURL(/\/ru\/settings\/hidden$/);
        await expect(page.getByRole("region", { name: "Скрытое" })).toBeVisible();
        await expect(hiddenAuthors(page)).toHaveCount(2);
        listingCount = await hiddenListings(page).count();
        expect(listingCount).toBeGreaterThan(0);
        expect(count).toBe(2 + listingCount);
        await expect.poll(() => backVisible(page)).toBe(true);
      });

      await test.step("«Вернуть» on a hidden listing removes its row with one Server Action, the hide's undo, that succeeds", async () => {
        const first = hiddenListings(page).first();
        const returned = await first.getAttribute("data-hidden-listing");
        expect(returned).not.toBeNull();
        const from = actions.length;
        // The row leaves before the request; only an `ok` answer plays the success haptic (a failure puts the row back).
        const ok = await notifications(app, "success");
        const answered = page.waitForResponse((response) => isServerAction(response.request()));

        await first.locator("[data-hidden-return]").click();
        await expect(hiddenListings(page)).toHaveCount(listingCount - 1);
        await answered;
        await expect.poll(() => notifications(app, "success")).toBe(ok + 1);
        await expect(hiddenListings(page)).toHaveCount(listingCount - 1);
        await expect(visible(page, `[data-hidden-listing="${returned}"]`)).toHaveCount(0);
        expect(bodies(from)).toHaveLength(1);
        expect(bodies(from)[0]).toContain(`{"number":${returned}}`);
        // `unhideListing`, the hide undo's id: `hideListing` sends the same body.
        expect(actionId(actions[from])).toBe(unhideId);
        await expect(hiddenAuthors(page)).toHaveCount(2);
      });

      await test.step("«Показать всё снова» asks first: Cancel keeps every row and sends nothing", async () => {
        const asked = (await questions(app)).length;
        await answerConfirm(page, false);
        // Counted from before the tap: a wrongly accepted confirm sends right after the answer, before any window opens.
        const before = actions.length;

        await visible(page, "[data-hidden-all]").click();
        await expect.poll(async () => (await questions(app)).length).toBe(asked + 1);
        expect((await questions(app)).at(-1)).toBe("Снова показывать все скрытые объявления и заблокированных авторов?");
        await nothingAsked(page, isServerAction);
        expect(actions).toHaveLength(before);
        await expect(hiddenAuthors(page)).toHaveCount(2);
        await expect(hiddenListings(page)).toHaveCount(listingCount - 1);
        await expect(visible(page, "[data-hidden-all]")).toBeVisible();
      });

      await test.step("OK returns everything: «Ничего не скрыто», no «Показать всё снова», the page stays open", async () => {
        const asked = (await questions(app)).length;
        await answerConfirm(page, true);
        const from = actions.length;
        // The rows leave before the request; only an `ok` answer plays the success haptic (a failure puts them back).
        const ok = await notifications(app, "success");
        const answered = page.waitForResponse((response) => isServerAction(response.request()));

        await visible(page, "[data-hidden-all]").click();
        await expect(page.getByText("Ничего не скрыто")).toBeVisible();
        await answered;
        await expect.poll(() => notifications(app, "success")).toBe(ok + 1);
        expect(await questions(app)).toHaveLength(asked + 1);
        expect(bodies(from)).toHaveLength(1);
        await expect(hiddenAuthors(page)).toHaveCount(0);
        await expect(hiddenListings(page)).toHaveCount(0);
        await expect(visible(page, "[data-hidden-all]")).toHaveCount(0);
        await expect(page.getByText("Ничего не скрыто")).toBeVisible();
        await expect(page).toHaveURL(/\/ru\/settings\/hidden$/);
        await expect(page.getByRole("region", { name: "Скрытое" })).toBeVisible();
      });

      await test.step("Telegram's Back closes «Скрытое» to the settings tab", async () => {
        await pressBack(page);
        await expect(page).toHaveURL(/\/ru\/settings$/);
        await expect(route(page, "settings")).toBeVisible();
        await expect(route(page, "settings/hidden")).toHaveCount(0);
        await expect(page.getByRole("region", { name: "Скрытое" })).toHaveCount(0);
        await expect.poll(() => backVisible(page)).toBe(false);
      });
    });
  },
);
