import { expect, launchApp, stubMedia, test as base, type LaunchedApp } from "@homi/testing/playwright";
import type { Page, Request, Route } from "@playwright/test";

/**
 * The search feed of WP-24 (SCR-007 … SCR-010, BR-APP-024, BR-APP-039) against the API on stubs, whose default search
 * (Tashkent, long rent, apartments) finds 45 listings in pages of 20 (`StubListingSource`): page one from the server
 * and the router refresh in cookie mode, through `/bff` with the bearer token in header mode; the pages to the end; a
 * new search from the top; the heart; a card opened and closed; the error states and the expired session; the chips;
 * pull-to-refresh; the demo marker; the first photos and the skeletons. The tests whose reads or writes carry the
 * session (the pages, the heart's Server Action, a failed page, the pull, a new search) run in both modes; the
 * header-only cases (the bearer read, offline, the expired session, the skeletons of a slow page one) and the cookie
 * ones (the server's page one, the refresh) run once, as do those that read nothing per session — the full run shares
 * one stub user's API limit (120 a minute). Every photo is answered by `stubMedia`.
 */

const test = base.extend<{ photos: readonly string[] }>({
  /** The stub photos answered so far: every test answers them itself, as CI has no `cdn.homi.loc`. */
  photos: [async ({ page }, use) => use(await stubMedia(page)), { auto: true }],
});

interface Fake {
  emit(eventType: string): void;
}

type Mode = "cookie" | "header";

/**
 * The visible copy only: with `cacheComponents` the router keeps earlier routes hidden in `<Activity>`
 * (`preserving-ui-state.md`), so the same element can be in the document twice.
 */
const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const route = (page: Page, name: string) => visible(page, `[data-route="${name}"]`);
const html = (page: Page) => page.locator("html");
const cards = (page: Page) => visible(page, "article[data-listing]");
const card = (page: Page, number: number) => visible(page, `article[data-listing="${number}"]`);
const chip = (page: Page, key: string) => visible(page, `[data-topbar="search-list"] [data-chip="${key}"]`);
const list = (page: Page) => visible(page, '[data-feed="feed"]');
const press = (page: Page, eventType: "backButtonClicked") =>
  page.evaluate((type) => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.emit(type), eventType);
const scrollY = (page: Page) => page.evaluate(() => window.scrollY);
/** The search keys of the current address. */
const searchOf = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams);

/** The feed's page one: `/bff/listings` without a cursor (the count, `/bff/listings/count`, is another read). */
const isPageOne = (url: URL) => url.pathname === "/bff/listings" && !url.searchParams.has("cursor");
/** A later page: `/bff/listings` with the cursor of the page before. */
const isLaterPage = (url: URL) => url.pathname === "/bff/listings" && url.searchParams.has("cursor");
/** A Server Action call: a POST to the page's address carrying the `Next-Action` header. */
const isServerAction = (request: Request) => request.method() === "POST" && request.headers()["next-action"] !== undefined;
/** A server render the router asks for: an RSC request (`RSC: 1`) that is neither a prefetch nor a Server Action. */
const isRender = (request: Request) => {
  const headers = request.headers();
  return (
    headers.rsc === "1" &&
    headers["next-router-prefetch"] === undefined &&
    headers["next-router-segment-prefetch"] === undefined &&
    headers["next-action"] === undefined
  );
};
/**
 * A router refresh of the feed: a render of `/ru`; a launch on `/` lands on `/ru` by the server's redirect, which is a
 * document request.
 */
const isRefresh = (request: Request) => isRender(request) && new URL(request.url()).pathname === "/ru";

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

interface ListingsPage {
  cursor: string | null;
  numbers: number[];
  next: string | null | undefined;
  source: string | undefined;
}

/** Collects the answers of `/bff/listings` from now on: the cursor asked with, the listing numbers, the next cursor. */
function recordPages(page: Page): ListingsPage[] {
  const seen: ListingsPage[] = [];
  page.on("response", async (response) => {
    const url = new URL(response.url());
    if (url.pathname !== "/bff/listings" || !response.ok()) {
      return;
    }
    const body = (await response.json()) as { data: { number: number }[]; meta: { next_cursor?: string | null; source?: string } };
    seen.push({
      cursor: url.searchParams.get("cursor"),
      numbers: body.data.map((item) => item.number),
      next: body.meta.next_cursor,
      source: body.meta.source,
    });
  });
  return seen;
}

/** The listing numbers of the visible cards, in their order. */
const numbersOf = (page: Page) => cards(page).evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("data-listing"))));

/** Light and medium impacts the page asked the fake Telegram for so far (TMA-025). */
async function impacts(app: LaunchedApp, style: "light" | "medium"): Promise<number> {
  return (await app.calls()).filter((call) => call.member === "HapticFeedback.impactOccurred" && call.args[0] === style).length;
}

/** Error notifications the page asked the fake Telegram for so far (TMA-025). */
async function errors(app: LaunchedApp): Promise<number> {
  return (await app.calls()).filter((call) => call.member === "HapticFeedback.notificationOccurred" && call.args[0] === "error").length;
}

/** Two animation frames: `useMiniChrome` has read the scroll position of the last scroll event by then. */
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

/** Scrolls the window and waits until the shell has read the position. */
async function scrollTo(page: Page, y: number): Promise<void> {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await nextFrames(page);
}

/** Scrolls to the end of the list, so its sentinel is in reach. */
const scrollToEnd = (page: Page) => scrollTo(page, Number.MAX_SAFE_INTEGER);

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

/** A gate a route handler waits on: `release()` lets the held requests go on. */
function gate(): { held: Promise<void>; release: () => void } {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { held, release };
}

/** Answers a matched request with a JSON error of the app server's pass-through. */
const failWith = (route: Route, status: number, code: string) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ code }) });

/** Launches the app as the bot does, in a session mode, and waits for the session. */
async function open(page: Page, mode: Mode, path = "/"): Promise<LaunchedApp> {
  const app = await launchApp(page, { mode, path });
  await expect(html(page)).toHaveAttribute("data-session", "ready");
  return app;
}

/** The next requests carry the stub scenario `scenario` (WP-22 forwards the cookie as `X-Stub-Scenario`). */
async function stubScenario(page: Page, scenario: string): Promise<void> {
  await page.context().addCookies([{ name: "homi_stub_scenario", value: scenario, url: test.info().project.use.baseURL }]);
}

/** `401 auth_expired`: the API's answer to launch data that is too old (WP-21, LB-APP-047). */
async function refuseAsTooOld(page: Page): Promise<void> {
  await page.route("**/bff/session", async (handled) => {
    if (handled.request().method() === "POST") {
      await failWith(handled, 401, "auth_expired");
      return;
    }
    await handled.fallback();
  });
}

test.describe("feed (cookie mode only)", () => {
  /**
   * The first launch has no cookie yet: the document shows skeletons, the sign-in sets the cookie and refreshes the
   * router once, and the browser reads page one through `/bff` (the refresh's server read is not adopted, WP-24). A
   * reload carries the cookie: the server's page one is in the document and nothing is asked again.
   */
  test("the first launch reads page one once through /bff and refreshes once; after a reload the document has the cards", async ({ page }) => {
    const firstPages = recordRequests(page, (request) => isPageOne(new URL(request.url())));
    const refreshes = recordRequests(page, isRefresh);
    await open(page, "cookie");
    await expect(cards(page).first()).toBeVisible();
    await expect.poll(() => refreshes.length).toBe(1);
    // Both start at `ready`. A page one asked again or a second refresh would follow the refresh's answer: none does.
    await (await refreshes[0].response())?.finished();
    await nothingAsked(page, (request) => isPageOne(new URL(request.url())) || isRefresh(request));
    expect(firstPages).toHaveLength(1);
    expect(refreshes).toHaveLength(1);

    const firstPagesAfter = recordRequests(page, (request) => isPageOne(new URL(request.url())));
    const refreshesAfter = recordRequests(page, isRefresh);
    const document = await page.reload();
    const markup = (await document?.text()) ?? "";
    await expect(html(page)).toHaveAttribute("data-session", "ready");
    await expect(cards(page).first()).toBeVisible();
    await page.waitForLoadState("networkidle");

    // The page size of the feed (`feedQuery`): every card of page one is in the server's HTML.
    expect(new Set(markup.match(/data-listing="\d+"/g)).size).toBe(20);
    await expect(cards(page)).toHaveCount(20);
    expect(firstPagesAfter).toEqual([]);
    expect(refreshesAfter).toEqual([]);
  });

  test("a tap on a card opens the listing over the feed; after Back the card shows the eye and the scroll is kept", async ({ page }) => {
    await open(page, "cookie");
    await expect(cards(page).first()).toBeVisible();
    // The fourth card 150 px below the top, clear of the top bar and the tab bar, so the tap does not scroll.
    const fourth = cards(page).nth(3);
    const number = Number(await fourth.getAttribute("data-listing"));
    const top = await fourth.evaluate((element) => element.getBoundingClientRect().top + window.scrollY);
    await scrollTo(page, Math.round(top - 150));
    const position = await scrollY(page);
    expect(position).toBeGreaterThan(0);
    await expect(card(page, number).locator("[data-viewed]")).toHaveCount(0);

    await card(page, number).locator("a").click();
    await expect(page).toHaveURL(new RegExp(`/ru/listing/${number}$`));
    await expect(visible(page, '[data-route="listing"][data-layer="overlay"]')).toBeVisible();

    await press(page, "backButtonClicked");
    await expect(page).toHaveURL(/\/ru$/);
    await expect(visible(page, '[data-route="listing"]')).toHaveCount(0);
    await expect(card(page, number).locator("[data-viewed]")).toBeVisible();
    await expect(card(page, number).locator("[data-viewed]")).toHaveAccessibleName("Вы открывали это объявление");
    await expect.poll(() => scrollY(page)).toBe(position);
  });

  test("each chip pushes its route with the search of the address; the owner chip reads «Кто размещает»", async ({ page }) => {
    const polygon = "41.31100,69.24000;41.32000,69.26000;41.30000,69.27000";
    const app = await open(page, "cookie", `/?polygon=${polygon}&rooms_min=2&sort=cheap`);
    await expect(route(page, "feed")).toBeVisible();
    // The order of SCR-007: filters, sort, «Своя область» (a drawn area), rooms, price, owner, city.
    await expect(visible(page, '[data-topbar="search-list"] [data-chip]')).toHaveCount(7);
    expect(await visible(page, '[data-topbar="search-list"] [data-chip]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-chip")))).toEqual([
      "filters",
      "sort",
      "area",
      "rooms",
      "price",
      "owner",
      "city",
    ]);
    await expect(chip(page, "owner")).toHaveText("Кто размещает");
    await expect(chip(page, "owner")).toHaveAttribute("data-state", "off");
    await expect(chip(page, "rooms")).toHaveAttribute("data-state", "on");
    const feedSearch = searchOf(page);
    // The chips carry the search with its city, which the address of a launch leaves out.
    const expected = { ...feedSearch, city: "tashkent" };

    const sheets = [
      ["filters", "/filters", "filters"],
      ["sort", "/sort", "sort"],
      ["rooms", "/filters/rooms", "filters/rooms"],
      ["price", "/filters/price", "filters/price"],
      ["owner", "/filters/owner", "filters/owner"],
      ["city", "/city", "city"],
    ] as const;
    for (const [key, path, name] of sheets) {
      const before = await impacts(app, "light");
      await chip(page, key).click();
      await expect(page).toHaveURL(new RegExp(`/ru${path}\\?`));
      expect(searchOf(page), key).toEqual(expected);
      await expect(visible(page, `[data-route="${name}"][data-layer="sheet"]`)).toBeVisible();
      expect(await impacts(app, "light")).toBe(before + 1);

      await press(page, "backButtonClicked");
      await expect(page).toHaveURL(/\/ru\?/);
      await expect(visible(page, "[data-layer]")).toHaveCount(0);
      expect(searchOf(page)).toEqual(feedSearch);
    }

    // «Своя область» is a switch to the map, as the view toggle, not a sheet.
    await chip(page, "area").click();
    await expect(page).toHaveURL(/\/ru\/map\?/);
    await expect(route(page, "map")).toBeVisible();
    expect(searchOf(page)).toEqual(expected);
  });

  test("the demo-data marker shows on the feed while its answers, the listings included, come from stubs", async ({ page }) => {
    const pages = recordPages(page);
    await open(page, "cookie");
    await expect(cards(page).first()).toBeVisible();

    // The marker reads every source of the screen (the reference data and the cities report too), so this ties it to
    // the screen's stub answers, the listings' among them, not to the listings alone.
    await expect.poll(() => pages.length).toBe(1);
    expect(pages[0].source).toBe("stub");
    await expect(page.locator("[data-demo-marker]")).toBeVisible();
    await expect(page.locator("[data-demo-marker]")).toContainText("Демо-данные");
  });

  test("the first two cards load their first photo without scrolling", async ({ page, photos }) => {
    await open(page, "cookie");
    await expect(cards(page).first()).toBeVisible();

    for (const index of [0, 1]) {
      const image = cards(page).nth(index).locator('[data-slide="0"] img');
      await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
      expect(photos).toContain(await image.evaluate((element: HTMLImageElement) => element.currentSrc));
      await expect(image).toHaveAttribute("loading", "eager");
    }
    expect(await scrollY(page)).toBe(0);
  });
});

test.describe("feed (header mode only)", () => {
  test("page one is asked for through /bff/listings with the bearer token and no session cookie", async ({ page }) => {
    const firstPages = recordRequests(page, (request) => isPageOne(new URL(request.url())));
    await open(page, "header");
    await expect(cards(page).first()).toBeVisible();

    expect(firstPages).toHaveLength(1);
    expect(firstPages[0].headers().authorization ?? "").toMatch(/^Bearer \S+$/);
    expect((await firstPages[0].allHeaders()).cookie ?? "").not.toContain("homi_session");
    await expect(cards(page)).toHaveCount(20);
  });

  test("a slow page one shows three card skeletons until it answers", async ({ page }) => {
    const slow = gate();
    let held = 0;
    await page.route(isPageOne, async (handled) => {
      held += 1;
      await slow.held;
      await handled.fallback();
    });
    await open(page, "header");

    await expect.poll(() => held).toBe(1);
    await expect(list(page).locator("[data-card-skeleton]")).toHaveCount(3);
    await expect(list(page)).toHaveAttribute("aria-busy", "true");
    await expect(cards(page)).toHaveCount(0);

    slow.release();
    await expect(cards(page).first()).toBeVisible();
    await expect(list(page).locator("[data-card-skeleton]")).toHaveCount(0);
    await expect(list(page)).toHaveAttribute("aria-busy", "false");
  });

  test("page one offline shows «Нет связи»; a refused one «Нет доступа — повторить»; each retry asks again", async ({ page }) => {
    let failure: "offline" | "forbidden" = "offline";
    await page.route(isPageOne, (handled) => (failure === "offline" ? handled.abort("internetdisconnected") : failWith(handled, 403, "forbidden")));
    await open(page, "header");

    const state = visible(page, '[data-feed="feed"] [data-slot="error-state"]');
    await expect(state).toHaveAttribute("data-kind", "offline");
    await expect(state.locator('[data-slot="error-state-title"]')).toHaveText("Нет связи");
    await expect(state.locator('[data-slot="error-state-text"]')).toHaveText("Проверьте интернет и попробуйте ещё раз.");
    await expect(state.getByRole("button")).toHaveText("Повторить");
    await expect(cards(page)).toHaveCount(0);

    // A refusal shows the inline retry even without cards; with DEV-001 off the session stays ready (LB-APP-045).
    failure = "forbidden";
    await state.getByRole("button", { name: "Повторить" }).click();
    const retry = visible(page, "[data-retry]");
    await expect(retry).toHaveText("Нет доступа — повторить");
    await expect(retry).toHaveAttribute("data-retry", "forbidden");
    await expect(html(page)).toHaveAttribute("data-session", "ready");
    await expect(visible(page, '[data-screen="no-access"]')).toHaveCount(0);

    await page.unroute(isPageOne);
    await retry.click();
    await expect(cards(page)).toHaveCount(20);
    await expect(visible(page, "[data-retry]")).toHaveCount(0);
  });

  /**
   * Header mode keeps the token in memory, so a refused read signs in again (WP-22). The refusals are registered after
   * the launch: `launchApp`'s header-mode route answers `/bff/session` itself and would sit in front of one registered
   * before it.
   */
  test("a page two refused mid-session and the new sign-in refused as too old show the expired screen; «Закрыть» closes", async ({ page }) => {
    const app = await open(page, "header", "/ru");
    await expect(cards(page).first()).toBeVisible();
    await page.route(isLaterPage, (handled) => failWith(handled, 401, "unauthenticated"));
    await refuseAsTooOld(page);
    await scrollToEnd(page);

    const screen = visible(page, '[data-screen="session-expired"]');
    await expect(screen).toBeVisible();
    await expect(html(page)).toHaveAttribute("data-session", "expired");
    await expect(screen.getByRole("heading", { level: 1 })).toHaveText("Сессия устарела — закройте и откройте приложение снова");
    await expect(screen.getByRole("button")).toHaveText(["Закрыть"]);
    await expect(route(page, "feed")).toHaveCount(0);

    const signIns = recordRequests(page, (request) => new URL(request.url()).pathname === "/bff/session" && request.method() === "POST");
    await screen.getByRole("button", { name: "Закрыть" }).click();
    await expect.poll(async () => (await app.calls()).filter((call) => call.member === "close").length).toBe(1);
    expect(signIns).toEqual([]);
  });
});

for (const mode of ["cookie", "header"] as const) {
  test.describe(`feed (${mode} mode)`, () => {
    test("scrolling loads the pages until the stub's last one; every listing shows once", async ({ page }) => {
      const pages = recordPages(page);
      const laterPages = recordRequests(page, (request) => isLaterPage(new URL(request.url())));
      await open(page, mode);
      await expect(cards(page).first()).toBeVisible();

      await expect
        .poll(async () => {
          await scrollToEnd(page);
          // The recorder reads an answer after the app has: until page one is recorded, nothing has ended.
          return pages.length === 0 ? "no answer yet" : (pages.at(-1)?.next ?? null);
        })
        .toBeNull();
      expect(pages.length).toBeGreaterThan(1);

      // The cursor chain: page one without one, each later page with the cursor of the page before, the last one ends.
      expect(pages[0].cursor).toBeNull();
      for (let index = 1; index < pages.length; index += 1) {
        expect(pages[index].cursor).toBe(pages[index - 1].next);
      }
      const answered = new Set(pages.flatMap((answer) => answer.numbers));
      await expect(cards(page)).toHaveCount(answered.size);
      const shown = await numbersOf(page);
      expect(new Set(shown).size).toBe(shown.length);
      expect(new Set(shown)).toEqual(answered);

      // Done: the sentinel is no longer watched, so another scroll to the end asks for nothing.
      const asked = laterPages.length;
      await scrollTo(page, 0);
      await scrollToEnd(page);
      await nothingAsked(page, (request) => isLaterPage(new URL(request.url())));
      expect(laterPages).toHaveLength(asked);
    });

    test("a new search in the address re-creates the list and scrolls it to the top", async ({ page }) => {
      const app = await open(page, mode);
      await expect(cards(page).first()).toBeVisible();
      const before = await numbersOf(page);

      // Down, then up by more than 24 px: the chrome expands and the deal tabs are in reach again (SCR-006).
      await scrollTo(page, 1600);
      await expect(html(page)).toHaveClass(/(^|\s)chrome-mini(\s|$)/);
      await scrollTo(page, 1560);
      await expect(html(page)).not.toHaveClass(/(^|\s)chrome-mini(\s|$)/);
      const firstPages = recordRequests(page, (request) => isPageOne(new URL(request.url())));
      const taps = await impacts(app, "light");
      const render = gate();
      let held = 0;
      await page.route(
        (url) => url.pathname === "/ru" && url.searchParams.get("deal") === "sale",
        async (handled) => {
          if (isRender(handled.request())) {
            held += 1;
            await render.held;
          }
          await handled.fallback();
        },
      );

      await visible(page, '[data-topbar="search-list"] [data-slot="title-tab"]').filter({ hasText: "Продажа" }).click();
      // The deal tab scrolls to the top itself, so the new search's render is held: the router keeps the old list on
      // screen meanwhile, scrolled down again here. Only the feed's own scroll on a new list key brings it back; the
      // shorter first render of the new key alone would only clamp it.
      await expect.poll(() => held).toBe(1);
      await scrollTo(page, 1600);
      expect(await scrollY(page)).toBe(1600);
      expect(page.url()).not.toMatch(/[?&]deal=sale(&|$)/);
      expect(await numbersOf(page)).toEqual(before);
      render.release();
      await expect(page).toHaveURL(/[?&]deal=sale(&|$)/);
      await expect.poll(() => scrollY(page)).toBe(0);
      await expect(cards(page).first()).toBeVisible();
      const after = await numbersOf(page);
      expect(after.filter((number) => before.includes(number))).toEqual([]);
      expect(await impacts(app, "light")).toBe(taps + 1);
      // Cookie mode adopts the server's page one of the new search; header mode asks for it through `/bff`.
      expect(firstPages.map((request) => new URL(request.url()).searchParams.get("deal"))).toEqual(mode === "cookie" ? [] : ["sale"]);
    });

    test("the heart fills with one Server Action and empties with the next; a failed save returns it with «Не получилось сохранить»", async ({ page }) => {
      const app = await open(page, mode);
      await expect(cards(page).first()).toBeVisible();
      const first = cards(page).first();
      const number = Number(await first.getAttribute("data-listing"));
      const heart = first.locator("[data-fav]");
      await expect(heart).toHaveAttribute("aria-pressed", "false");
      await expect(heart).toHaveAccessibleName("В избранное");
      const actions = recordRequests(page, isServerAction);
      const answered = () => page.waitForResponse((response) => isServerAction(response.request()));

      let saved = answered();
      await heart.click();
      await expect(heart).toHaveAttribute("aria-pressed", "true");
      await saved;
      await expect(heart).toHaveAttribute("aria-pressed", "true");
      await expect(heart).toHaveAccessibleName("Убрать из избранного");
      expect(actions).toHaveLength(1);
      expect(actions[0].postData() ?? "").toContain(`{"number":${number},"on":true}`);
      expect(await impacts(app, "medium")).toBe(1);

      saved = answered();
      await heart.click();
      await expect(heart).toHaveAttribute("aria-pressed", "false");
      await saved;
      await expect(heart).toHaveAttribute("aria-pressed", "false");
      expect(actions).toHaveLength(2);
      expect(actions[1].postData() ?? "").toContain(`{"number":${number},"on":false}`);

      // The save fails on the API (`503 source_unavailable` of the stub's PUT); held until the fill is seen.
      await stubScenario(page, "source_unavailable");
      const slow = gate();
      await page.route(
        (url) => url.pathname === "/ru",
        async (handled) => {
          if (isServerAction(handled.request())) {
            await slow.held;
          }
          await handled.fallback();
        },
      );
      saved = answered();
      await heart.click();
      await expect(heart).toHaveAttribute("aria-pressed", "true");
      expect(await errors(app)).toBe(0);
      slow.release();
      await saved;
      await expect(heart).toHaveAttribute("aria-pressed", "false");
      await expect(heart).toHaveAccessibleName("В избранное");
      // LB-APP-027 is fixed in legacy since `index-CIa0Ldj2.js`: the error haptic and the toast (DEC-58).
      await expect(page.locator('[data-toast-host="app"] [data-toast]')).toHaveText("Не получилось сохранить");
      await expect.poll(() => errors(app)).toBe(1);
      expect(actions).toHaveLength(3);
      await page.context().clearCookies({ name: "homi_stub_scenario" });
    });

    test("a failed page two shows «Не загрузилось — повторить» under the cards; a refused one «Нет доступа — повторить»", async ({ page }) => {
      await open(page, mode);
      await expect(cards(page)).toHaveCount(20);
      let status = 500;
      await page.route(isLaterPage, (handled) => failWith(handled, status, status === 500 ? "server_error" : "forbidden"));

      await scrollToEnd(page);
      const retry = visible(page, "[data-retry]");
      await expect(retry).toHaveText("Не загрузилось — повторить");
      await expect(retry).toHaveAttribute("data-retry", "failed");
      await expect(cards(page)).toHaveCount(20);

      // With DEV-001 off a refusal stays in the list: the session stays ready, no access screen (LB-APP-045).
      status = 403;
      await retry.click();
      await expect(retry).toHaveText("Нет доступа — повторить");
      await expect(retry).toHaveAttribute("data-retry", "forbidden");
      await expect(html(page)).toHaveAttribute("data-session", "ready");
      await expect(visible(page, '[data-screen="no-access"]')).toHaveCount(0);
      await expect(cards(page)).toHaveCount(20);

      await page.unroute(isLaterPage);
      await retry.click();
      await expect(cards(page)).toHaveCount(40);
      await expect(visible(page, "[data-retry]")).toHaveCount(0);
    });

    test("pull-to-refresh asks for page one again and starts the list from it", async ({ page }) => {
      await open(page, mode);
      await expect(cards(page)).toHaveCount(20);
      await scrollToEnd(page);
      await expect(cards(page)).toHaveCount(40);
      await scrollTo(page, 0);
      const firstPages = recordRequests(page, (request) => isPageOne(new URL(request.url())));

      await touchDrag(page, { x: 195, y: 300 }, { x: 195, y: 500 });
      await expect.poll(() => firstPages.length).toBe(1);
      await expect(page.locator("[data-ptr]")).toHaveAttribute("data-ptr", "idle");
      await expect(cards(page)).toHaveCount(20);
      expect(firstPages).toHaveLength(1);
    });
  });
}
