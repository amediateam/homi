import { expect, launchApp, stubMedia, test as base, type LaunchedApp } from "@homi/testing/playwright";
import type { Page, Request } from "@playwright/test";

/**
 * The author's contact on the listing screen of WP-26 (DEC-52, BR-APP-032 … BR-APP-035) against the API on stubs, in
 * cookie and header mode. The listing `100001` has the stub phone `+998000000067`: on a direct load the served HTML,
 * the server renders, the `/bff/listings/100001` answer and the page hold none of its digit forms (D-10), the
 * original text shows `+998 ** *** ** 67`, and nothing asks for the contact. «Показать номер» asks once (a Server
 * Action) and shows the number in the author row and in the text; «Позвонить» afterwards asks nothing more: iOS opens
 * the call page (`openLink` of the fake Telegram), Android tries `tel:` first and, the app staying, opens the call
 * page after 1.2 s; «Позвонить» as the first tap asks once, then calls. The withdrawn `100015` shows neither button;
 * on `100021` only the listing's own number is ever shown; on `100018` «Написать» tapped twice opens the chat once.
 * The analytics events are not visible here before WP-32 (`useContact.test.ts` asserts them). Each test launches
 * once; the full run shares one stub user's API limit (120 a minute, KI-32). Every photo is answered by `stubMedia`.
 */

const test = base.extend<{ photos: readonly string[] }>({
  /** The stub photos answered so far: every test answers them itself, as CI has no `cdn.homi.loc`. */
  photos: [async ({ page }, use) => use(await stubMedia(page)), { auto: true }],
});

type Mode = "cookie" | "header";

const LISTING = 100001;
/** The forms of the stub number `+998000000067` that must never reach the browser before a tap (D-10). */
const DIGIT_FORMS = ["+998000000067", "000000067", "000 00 67", "000-00-67", "+998 00 000-00-67"];
const MASKED = "+998 ** *** ** 67";
const DISPLAY = "+998 00 000-00-67";
/** The stub's call page of a listing: `{APP_URL}/call/stub-token-{number}`. */
const callPage = (number: number) => new RegExp(`^https://[^/]+/call/stub-token-${number}$`);

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const html = (page: Page) => page.locator("html");
/** The listing layer of `number` (each layer carries its own number, also a hidden one). */
const layer = (page: Page, number: number) => visible(page, `[data-route="listing"][data-listing-number="${number}"]`);
const author = (page: Page, number: number) => layer(page, number).locator('[data-section="author"]');
const original = (page: Page, number: number) => layer(page, number).locator("[data-original]");

/** A Server Action call: a POST to the page's address carrying the `Next-Action` header. */
const isServerAction = (request: Request) => request.method() === "POST" && request.headers()["next-action"] !== undefined;
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

interface Answer {
  kind: "document" | "render" | "bff";
  text: string;
}

/**
 * Collects from now on the app server's answers that can carry the listing's data: documents, server renders and
 * the listing's `/bff` read. `bodies()` waits for every body read so far.
 */
function recordAnswers(page: Page, number: number): () => Promise<Answer[]> {
  const host = new URL(test.info().project.use.baseURL ?? "http://localhost").host;
  const answers: Promise<Answer | null>[] = [];
  page.on("response", (response) => {
    const request = response.request();
    const url = new URL(response.url());
    if (url.host !== host) {
      return;
    }
    const kind = request.resourceType() === "document" ? "document" : isRender(request) ? "render" : url.pathname === `/bff/listings/${number}` ? "bff" : null;
    if (kind !== null) {
      // A redirect has no body to read.
      answers.push(response.text().then((text) => ({ kind, text }), () => null));
    }
  });
  return async () => (await Promise.all(answers)).filter((answer): answer is Answer => answer !== null);
}

/** The digit forms of the stub number that `text` contains. */
const formsIn = (text: string, forms = DIGIT_FORMS) => forms.filter((form) => text.includes(form));

async function impacts(app: LaunchedApp, style: "light" | "medium"): Promise<number> {
  return (await app.calls()).filter((call) => call.member === "HapticFeedback.impactOccurred" && call.args[0] === style).length;
}

const errors = async (app: LaunchedApp) =>
  (await app.calls()).filter((call) => call.member === "HapticFeedback.notificationOccurred" && call.args[0] === "error").length;

/** The addresses the page asked the fake Telegram to open through `member` (`openLink`, `openTelegramLink`). */
async function opened(app: LaunchedApp, member: "openLink" | "openTelegramLink"): Promise<string[]> {
  return (await app.calls()).filter((call) => call.member === member).map((call) => String(call.args[0]));
}

/** Launches the app as the bot does, in a session mode, and waits for the session and the listing's details. */
async function openListing(page: Page, mode: Mode, number: number, platform: "ios" | "android" = "ios"): Promise<LaunchedApp> {
  const app = await launchApp(page, { mode, path: `/ru/listing/${number}`, platform });
  await expect(html(page)).toHaveAttribute("data-session", "ready");
  await expect(layer(page, number).locator("[data-listing-state]")).toHaveAttribute("data-listing-state", "loaded");
  return app;
}

/** Opens «Текст оригинала»: it is closed on every opening of the listing. */
async function openOriginalText(page: Page, number: number): Promise<void> {
  await layer(page, number).locator("button[data-original-toggle]").click();
  await expect(original(page, number).locator("pre[data-original-text]")).toBeVisible();
}

/** Records every `tel:` address the page dials (`tg.call` clicks a detached anchor) and lets the click go on. */
async function recordDials(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const dialled: string[] = [];
    Object.assign(window, { __homiDialled: dialled });
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (this.href.startsWith("tel:")) {
        dialled.push(this.href);
      }
      click.call(this);
    };
  });
  return () => page.evaluate(() => [...(window as unknown as { __homiDialled: string[] }).__homiDialled]);
}

for (const mode of ["cookie", "header"] as const) {
  test.describe(`listing contact (${mode} mode)`, () => {
    test("a direct load holds no digits of the number in its answers or the page; the text shows it masked; nothing asks for the contact", async ({ page }) => {
      const actions = recordRequests(page, isServerAction);
      const answers = recordAnswers(page, LISTING);
      await openListing(page, mode, LISTING);
      if (mode === "cookie") {
        // The first launch's document had no cookie yet; the reload's document carries the server's read.
        const document = await page.reload();
        const markup = (await document?.text()) ?? "";
        await expect(html(page)).toHaveAttribute("data-session", "ready");
        await expect(layer(page, LISTING).locator("[data-listing-state]")).toHaveAttribute("data-listing-state", "loaded");
        expect(markup).toContain(MASKED);
        expect(formsIn(markup)).toEqual([]);
      }
      const seen = await answers();
      // The check reads the listing's data: the server's HTML in cookie mode, the `/bff` answer in header mode.
      const withData = seen.filter((answer) => answer.text.includes(MASKED)).map((answer) => answer.kind);
      expect(withData).toContain(mode === "cookie" ? "document" : "bff");
      for (const answer of seen) {
        expect(formsIn(answer.text), answer.kind).toEqual([]);
      }

      await openOriginalText(page, LISTING);
      await expect(original(page, LISTING).locator("pre[data-original-text]")).toContainText(MASKED);
      await expect(original(page, LISTING).locator('button[data-masked-phone="67"]')).toHaveText(MASKED);
      await expect(author(page, LISTING).locator('button[data-phone="reveal"]')).toHaveText("Показать номер");
      const page_ = await page.evaluate(() => ({ markup: document.documentElement.outerHTML, text: document.body.innerText }));
      expect(formsIn(page_.markup)).toEqual([]);
      expect(formsIn(page_.text)).toEqual([]);
      expect(actions).toEqual([]);
    });

    test("«Показать номер» asks once and shows the number in the author row and the text; «Позвонить» then opens the call page", async ({ page }) => {
      const app = await openListing(page, mode, LISTING);
      const actions = recordRequests(page, isServerAction);
      await openOriginalText(page, LISTING);
      const medium = await impacts(app, "medium");

      await author(page, LISTING).locator('button[data-phone="reveal"]').click();
      await expect(author(page, LISTING).locator('button[data-phone="number"]')).toHaveText(DISPLAY);
      await expect(original(page, LISTING).locator("button[data-own-phone]")).toHaveText(DISPLAY);
      await expect(original(page, LISTING).locator("button[data-masked-phone]")).toHaveCount(0);
      expect(actions).toHaveLength(1);
      const body = actions[0].postData() ?? "";
      expect(body).toContain(`{"number":${LISTING}}`);
      // Header mode has no cookie: the token kept in memory travels in the action's arguments.
      expect(body.includes('"token"')).toBe(mode === "header");
      expect(await impacts(app, "medium")).toBe(medium + 1);
      expect(await opened(app, "openLink")).toEqual([]);

      await layer(page, LISTING).locator('button[data-cta-action="call"]').click();
      await expect.poll(() => opened(app, "openLink")).toEqual([expect.stringMatching(callPage(LISTING))]);
      await nothingAsked(page, isServerAction);
      expect(actions).toHaveLength(1);
      expect(await impacts(app, "medium")).toBe(medium + 2);
      expect(await errors(app)).toBe(0);
    });

    test("on Android «Позвонить» after the reveal tries tel: first and, the app staying, opens the call page after 1.2 s", async ({ page }) => {
      const dialled = await recordDials(page);
      const app = await openListing(page, mode, LISTING, "android");
      const actions = recordRequests(page, isServerAction);
      await author(page, LISTING).locator('button[data-phone="reveal"]').click();
      await expect(author(page, LISTING).locator('button[data-phone="number"]')).toHaveText(DISPLAY);
      expect(actions).toHaveLength(1);

      const tapped = Date.now();
      await layer(page, LISTING).locator('button[data-cta-action="call"]').click();
      await expect.poll(() => dialled()).toEqual(["tel:+998000000067"]);
      expect(await opened(app, "openLink")).toEqual([]);
      await expect.poll(() => opened(app, "openLink"), { timeout: 5_000 }).toEqual([expect.stringMatching(callPage(LISTING))]);
      expect(Date.now() - tapped).toBeGreaterThanOrEqual(1_200);
      expect(actions).toHaveLength(1);
      expect(await errors(app)).toBe(0);
    });

    test("«Позвонить» as the first tap asks once, then opens the call page; the author row then shows the number", async ({ page }) => {
      const app = await openListing(page, mode, LISTING);
      const actions = recordRequests(page, isServerAction);

      await layer(page, LISTING).locator('button[data-cta-action="call"]').click();
      await expect.poll(() => opened(app, "openLink")).toEqual([expect.stringMatching(callPage(LISTING))]);
      expect(actions).toHaveLength(1);
      expect(actions[0].postData() ?? "").toContain(`{"number":${LISTING}}`);
      await expect(author(page, LISTING).locator('button[data-phone="number"]')).toHaveText(DISPLAY);
      await nothingAsked(page, isServerAction);
      expect(actions).toHaveLength(1);
    });

    test("the withdrawn listing 100015 shows neither «Позвонить» nor «Показать номер»", async ({ page }) => {
      await openListing(page, mode, 100015);
      await expect(layer(page, 100015).locator("[data-status-banner]")).toHaveText("Снято с публикации");
      await expect(layer(page, 100015).locator('[data-cta-action="none"]')).toBeAttached();
      await expect(layer(page, 100015).locator("button[data-cta-action]")).toHaveCount(0);
      await expect(layer(page, 100015).locator("button[data-phone]")).toHaveCount(0);
    });

    test("on 100021 a masked number reveals only the listing's own one; the other stays masked", async ({ page }) => {
      const app = await openListing(page, mode, 100021);
      const actions = recordRequests(page, isServerAction);
      await openOriginalText(page, 100021);
      const text = original(page, 100021);
      await expect(text.locator("button[data-masked-phone]")).toHaveText(["+998 ** *** ** 21", "+998 ** *** ** 99"]);

      // Any masked number does what «Показать номер» does, the other one too.
      await text.locator('button[data-masked-phone="99"]').click();
      await expect(text.locator("button[data-own-phone]")).toHaveText("+998 00 000-00-21");
      await expect(text.locator("[data-masked-phone-text]")).toHaveText("+998 ** *** ** 99");
      await expect(text.locator("button[data-masked-phone]")).toHaveCount(0);
      await expect(author(page, 100021).locator('button[data-phone="number"]')).toHaveText("+998 00 000-00-21");
      expect(actions).toHaveLength(1);
      const shown = await page.evaluate(() => document.body.innerText);
      expect(formsIn(shown, ["000 00 99", "000-00-99", "000000099"])).toEqual([]);
      expect(await opened(app, "openLink")).toEqual([]);
    });

    test("on 100018 «Написать» tapped twice opens the author's chat once and asks for no contact", async ({ page }) => {
      const app = await openListing(page, mode, 100018);
      const actions = recordRequests(page, isServerAction);
      await expect(layer(page, 100018).locator("button[data-phone]")).toHaveCount(0);
      const write = layer(page, 100018).locator('button[data-cta-action="write"]');
      await expect(write).toHaveText("Написать");
      const medium = await impacts(app, "medium");

      await write.click();
      await write.click();
      await expect.poll(() => opened(app, "openTelegramLink")).toEqual(["https://t.me/stub_author_7"]);
      await nothingAsked(page, isServerAction, 500);
      expect(await opened(app, "openTelegramLink")).toEqual(["https://t.me/stub_author_7"]);
      expect(await impacts(app, "medium")).toBe(medium + 1);
      expect(actions).toEqual([]);
      expect(await errors(app)).toBe(0);
    });
  });
}
