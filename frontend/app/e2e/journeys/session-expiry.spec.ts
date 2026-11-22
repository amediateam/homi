import { expect, launchApp, type LaunchedApp, projectSessionMode, setScenario, STUB_SCENARIO_COOKIE, stubMedia, test } from "@homi/testing/playwright";
import type { Page, Request } from "@playwright/test";

/**
 * Journey 6 of WP-33 (`e2e/journeys/`): the session ends in the middle of use, against the API on stubs. After the
 * launch the reserved scenario `unauthenticated` refuses the next request of the feed (page two through `/bff`,
 * `bffFetch`): the app signs in again once, silently, and the same request repeats — the list goes on with its next
 * twenty cards, the session never leaves `ready`, no error and no document load. Then, over an open listing that shows
 * its title row (title, heart, «⋯») and BackButton, `unauthenticated` refuses the heart's Server Action (`useAction`)
 * and the sign-in it starts is refused as too old (`auth_expired`, WP-11): the session-expired screen of WP-23 takes
 * the route's place at the same address, BackButton is hidden, «Закрыть» calls the fake's `close` and nothing more is
 * requested. That screen has no entry in `screens.json`, so it is checked by `[data-screen="session-expired"]` and
 * named by no annotation; the journey names the feed (SCR-007) and the listing (SCR-018), which it asserts.
 *
 * The stub scenario applies to every stub method, the sign-in (`POST /auth/telegram`) and `GET /me` included, so the
 * spec switches it at the moment the re-sign-in leaves the browser: a route on `/bff/session` changes the cookie
 * (cleared after the first rejection, or `auth_expired`) and passes the request on unchanged — to header mode's context
 * route when it is on, whose exchange reads the cookies after this handler — so every answer is the app server's own.
 * The route is a pass-through scenario switch that refuses and answers nothing, as the `no_chat` retry of
 * `radar-subscribe.spec.ts` switches the scenario inside a route before `fallback()`. The suite runs the journey in
 * cookie and header mode (projects `miniapp-cookie`, `miniapp-header`). Every photo is answered by `stubMedia`.
 */

interface Fake {
  webApp: { BackButton: { isVisible: boolean } };
}

/**
 * The visible copy only: with `cacheComponents` the router keeps earlier routes hidden in `<Activity>`
 * (`preserving-ui-state.md`), so the same element can be in the document twice.
 */
const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const route = (page: Page, name: string) => visible(page, `[data-route="${name}"]`);
const html = (page: Page) => page.locator("html");
const cards = (page: Page) => visible(page, "article[data-listing]");
const card = (page: Page, number: number) => visible(page, `article[data-listing="${number}"]`);
/** The listing layer of `number` (each layer carries its own number, also a hidden one). */
const layer = (page: Page, number: number) => visible(page, `[data-route="listing"][data-listing-number="${number}"]`);
const expiredScreen = (page: Page) => visible(page, '[data-screen="session-expired"]');
const backVisible = (page: Page) =>
  page.evaluate(() => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.webApp.BackButton.isVisible);

/** The listing numbers of the visible cards, in their order. */
const numbersOf = (page: Page) => cards(page).evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("data-listing"))));

/** The sign-in of WP-21: `POST /bff/session` (its `GET` is the check that follows). */
const isSignIn = (request: Request) => new URL(request.url()).pathname === "/bff/session" && request.method() === "POST";
/** A later page of the feed: `/bff/listings` with the cursor of the page before. */
const isLaterPage = (request: Request) => {
  const url = new URL(request.url());
  return url.pathname === "/bff/listings" && url.searchParams.has("cursor");
};
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
 * Cookie mode's router refresh after the launch's sign-in (`SessionProvider`, `renewed`): a render of `/ru`; the launch
 * on `/` lands on `/ru` by the server's redirect, which is a document request.
 */
const isRefresh = (request: Request) => isRender(request) && new URL(request.url()).pathname === "/ru";
/** Anything the page asks of the app server — reads, actions, renders, sign-ins — except the build's static files. */
const isAppRequest = (origin: string) => (request: Request) => {
  const url = new URL(request.url());
  return url.origin === origin && !url.pathname.startsWith("/_next/static/");
};

/**
 * Follows the page's requests to the app server from now on. `settled()` waits until none is open and none started or
 * ended for `quietMs`: the reads of the launch or of a screen are over, and none can start after the scenario is set
 * and use up the armed sign-in. It waits rather than fails, so a late static file (the mini map's worker) only delays.
 * The journal's `keepalive` posts (`/bff/events`) are left out: they never sign in again (`lib/analytics/journal.ts`).
 */
function trackAppRequests(page: Page, origin: string): { settled: (quietMs?: number) => Promise<void> } {
  const isApp = isAppRequest(origin);
  const open = new Set<Request>();
  let last = Date.now();
  page.on("request", (request) => {
    if (isApp(request) && new URL(request.url()).pathname !== "/bff/events") {
      open.add(request);
      last = Date.now();
    }
  });
  const ended = (request: Request) => {
    if (open.delete(request)) {
      last = Date.now();
    }
  };
  page.on("requestfinished", ended);
  page.on("requestfailed", ended);
  return {
    settled: (quietMs = 500) =>
      expect
        .poll(() => (open.size === 0 && Date.now() - last >= quietMs ? "settled" : `${open.size} open`), { intervals: [100] })
        .toBe("settled"),
  };
}

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

/** Two animation frames: `useMiniChrome` and the list have read the scroll position of the last scroll by then. */
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

/** Scrolls the window and waits until the shell has read the position. */
async function scrollTo(page: Page, y: number): Promise<void> {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await nextFrames(page);
}

/** Scrolls to the end of the list, so its sentinel is in reach and the next page is asked for. */
const scrollToEnd = (page: Page) => scrollTo(page, Number.MAX_SAFE_INTEGER);

/** A mark on the window: gone after a document load, kept by every soft navigation. */
const markWindow = (page: Page) => page.evaluate(() => Object.assign(window, { __homiNoReload: true }));
const stillMarked = (page: Page) => page.evaluate(() => "__homiNoReload" in window);

/**
 * Every value `html[data-session]` holds from now on: the old value of each change, and the value at the end. A
 * silent re-sign-in leaves only `ready`.
 */
const watchSession = (page: Page) =>
  page.evaluate(() => {
    const seen: string[] = [];
    new MutationObserver((records) => {
      for (const record of records) {
        seen.push(record.oldValue ?? "");
      }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-session"], attributeOldValue: true });
    Object.assign(window, { __homiSessionSeen: seen });
  });
const sessionSeen = (page: Page) =>
  page.evaluate(() => [...(window as unknown as { __homiSessionSeen: string[] }).__homiSessionSeen, document.documentElement.dataset.session ?? ""]);

/** The error UI a silent re-sign-in never shows: the expired screen, an error state, the feed's retry row, a toast. */
const ERROR_UI = '[data-screen="session-expired"], [data-slot="error-state"], [data-retry], [data-toast]';
const ERROR_UI_ATTRIBUTES = ["data-screen", "data-slot", "data-retry", "data-toast"];

/**
 * Every element of `ERROR_UI` the document gains from now on, shown or hidden, also one that is gone again by the
 * end: React inserts whole subtrees, so each added element is matched and searched, and a changed attribute counts.
 */
const watchErrorUi = (page: Page) =>
  page.evaluate(
    ({ selector, attributes }) => {
      const seen: string[] = [];
      const describe = (element: Element) =>
        [element.tagName.toLowerCase(), ...attributes.filter((name) => element.hasAttribute(name)).map((name) => `${name}="${element.getAttribute(name)}"`)].join(" ");
      new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === "attributes" && record.target instanceof Element && record.target.matches(selector)) {
            seen.push(describe(record.target));
          }
          for (const node of record.addedNodes) {
            if (node instanceof Element) {
              for (const match of [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]) {
                seen.push(describe(match));
              }
            }
          }
        }
      }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: attributes });
      Object.assign(window, { __homiErrorUi: seen });
    },
    { selector: ERROR_UI, attributes: ERROR_UI_ATTRIBUTES },
  );
const errorUiSeen = (page: Page) => page.evaluate(() => [...(window as unknown as { __homiErrorUi: string[] }).__homiErrorUi]);

/** The value of the session cookie in the context (cookie mode: the token). */
const sessionCookie = async (page: Page) => (await page.context().cookies()).find((cookie) => cookie.name === "homi_session")?.value ?? null;
const scenarioCookie = async (page: Page) => (await page.context().cookies()).find((cookie) => cookie.name === STUB_SCENARIO_COOKIE)?.value ?? null;

/** Error notifications the page asked the fake Telegram for so far (TMA-025). */
async function errorHaptics(app: LaunchedApp): Promise<number> {
  return (await app.calls()).filter((call) => call.member === "HapticFeedback.notificationOccurred" && call.args[0] === "error").length;
}

async function closes(app: LaunchedApp): Promise<number> {
  return (await app.calls()).filter((call) => call.member === "close").length;
}

/**
 * Arms the next sign-in: when its `POST /bff/session` reaches the route, the stub scenario becomes `scenario` (`null`
 * clears it) and the request goes on unchanged. The cookie is attached when the paused request is released (the
 * `addCookies` note of `route.continue`); header mode's exchange reads the context's cookies itself. Unarmed sign-ins
 * and the checks (`GET`) pass untouched.
 */
async function switchOnSignIn(page: Page): Promise<(scenario: string | null) => void> {
  let next: { scenario: string | null } | null = null;
  await page.route("**/bff/session", async (handled) => {
    const plan = next;
    if (handled.request().method() === "POST" && plan !== null) {
      next = null;
      await setScenario(page, plan.scenario);
    }
    await handled.fallback();
  });
  return (scenario) => {
    next = { scenario };
  };
}

test.describe(
  "session expiry @journey",
  {
    annotation: [
      { type: "screen", description: "SCR-007" },
      { type: "screen", description: "SCR-018" },
    ],
  },
  () => {
    test("a request refused mid-session signs in again once, silently, and repeats; a later sign-in refused as too old shows the expired screen, whose «Закрыть» closes", async ({ page }) => {
      await stubMedia(page);
      const origin = new URL(test.info().project.use.baseURL ?? "http://localhost:3001").origin;
      const requests = trackAppRequests(page, origin);
      const refreshes = recordRequests(page, isRefresh);
      const app = await launchApp(page);
      await expect(html(page)).toHaveAttribute("data-session", "ready");
      await expect(cards(page)).toHaveCount(20);
      // The launch's own reads are over before the scenario applies to anything: in cookie mode the router refresh
      // after the first sign-in has answered whole (its server reads included), and in both modes nothing is open.
      if (projectSessionMode(test.info()) === "cookie") {
        await expect.poll(() => refreshes.length).toBe(1);
        await (await refreshes[0].response())?.finished();
      }
      await requests.settled();
      const nextSignIn = await switchOnSignIn(page);

      // 1. `unauthenticated` refuses the next request: page two of the feed. The re-sign-in clears it on its way out.
      const pageOne = await numbersOf(page);
      const cookieBefore = await sessionCookie(page);
      await markWindow(page);
      await watchSession(page);
      await watchErrorUi(page);
      const sequence = recordRequests(page, (request) => isSignIn(request) || isLaterPage(request));
      nextSignIn(null);
      await setScenario(page, "unauthenticated");
      await scrollToEnd(page);

      // The screen continues: the next twenty cards under the first twenty, nothing else on screen.
      await expect(cards(page)).toHaveCount(40);
      expect((await numbersOf(page)).slice(0, 20)).toEqual(pageOne);
      await nothingAsked(page, isSignIn);
      // One silent sign-in between the refused read and the same read again.
      expect(sequence.map((request) => (isSignIn(request) ? "sign-in" : "page two"))).toEqual(["page two", "sign-in", "page two"]);
      const [refused, signIn, repeated] = sequence;
      expect(repeated.url()).toBe(refused.url());
      expect((await refused.response())?.status()).toBe(401);
      expect((await signIn.response())?.status()).toBe(200);
      expect((await repeated.response())?.status()).toBe(200);
      // The stub's reserved scenario refused the read, not a lost token: the refused read carried it, the repeat not.
      expect((await refused.allHeaders()).cookie ?? "").toContain(`${STUB_SCENARIO_COOKIE}=unauthenticated`);
      expect((await repeated.allHeaders()).cookie ?? "").not.toContain(`${STUB_SCENARIO_COOKIE}=`);
      expect(await scenarioCookie(page)).toBeNull();
      // A new session, not the refused one: header mode's repeat carries the new token, cookie mode got a new cookie.
      if (projectSessionMode(test.info()) === "header") {
        const refusedBearer = (await refused.allHeaders()).authorization ?? "";
        const repeatedBearer = (await repeated.allHeaders()).authorization ?? "";
        expect(refusedBearer).toMatch(/^Bearer \S+$/);
        expect(repeatedBearer).toMatch(/^Bearer \S+$/);
        expect(repeatedBearer).not.toBe(refusedBearer);
      } else {
        expect(cookieBefore).not.toBeNull();
        const cookieAfter = await sessionCookie(page);
        expect(cookieAfter).not.toBeNull();
        expect(cookieAfter).not.toBe(cookieBefore);
      }
      // Silent: the session never left `ready`; no expired screen, error state, retry or toast came, not even for a
      // moment, and none is there now; no error haptic, no document load.
      expect([...new Set(await sessionSeen(page))]).toEqual(["ready"]);
      expect(await errorUiSeen(page)).toEqual([]);
      await expect(expiredScreen(page)).toHaveCount(0);
      await expect(visible(page, '[data-feed="feed"] [data-slot="error-state"]')).toHaveCount(0);
      await expect(visible(page, "[data-retry]")).toHaveCount(0);
      await expect(visible(page, "[data-toast]")).toHaveCount(0);
      expect(await errorHaptics(app)).toBe(0);
      expect(await stillMarked(page)).toBe(true);

      // 2. Over a listing, where BackButton shows: `unauthenticated` refuses the heart's Server Action, and the sign-in
      // it starts leaves with `auth_expired`.
      await scrollTo(page, 0);
      const number = pageOne[0];
      await card(page, number).locator("a").click();
      await expect(page).toHaveURL(new RegExp(`/ru/listing/${number}$`));
      const listing = layer(page, number).locator('[data-listing-state="loaded"]').filter({ visible: true }).first();
      await expect(listing).toBeVisible();
      // The listing screen of the tapped card: its title row with the title, the heart and «⋯».
      const titleRow = listing.locator("[data-title-row]");
      await expect(titleRow.locator("[data-listing-title]")).toHaveText(/\S/);
      await expect(titleRow.locator('[data-fav="plain"]')).toBeVisible();
      await expect(titleRow.locator('[data-action="menu"]')).toBeVisible();
      await expect.poll(() => backVisible(page)).toBe(true);
      // The listing's own reads are over before the scenario is set again.
      await requests.settled();

      const signIns = recordRequests(page, isSignIn);
      const actions = recordRequests(page, isServerAction);
      const refusedSignIn = page.waitForResponse((response) => isSignIn(response.request()));
      nextSignIn("auth_expired");
      await setScenario(page, "unauthenticated");
      await layer(page, number).locator("[data-title-row] [data-fav]").filter({ visible: true }).first().click();

      const answer = await refusedSignIn;
      // From the refused sign-in's answer on, the app server is asked nothing: no repeat of the action, no check.
      const later = recordRequests(page, isAppRequest(origin));
      expect(answer.status()).toBe(401);
      expect(((await answer.json()) as { code?: unknown }).code).toBe("auth_expired");

      // The session-expired screen in place of the route, at the same address: its sentence, the one button
      // «Закрыть» with the focus, no listing and no feed below, BackButton hidden.
      const screen = expiredScreen(page);
      await expect(screen).toBeVisible();
      await expect(html(page)).toHaveAttribute("data-session", "expired");
      await expect(screen.getByRole("heading", { level: 1 })).toHaveText("Сессия устарела — закройте и откройте приложение снова");
      await expect(screen.getByRole("button")).toHaveText(["Закрыть"]);
      await expect(screen.getByRole("button", { name: "Закрыть" })).toBeFocused();
      await expect(route(page, "listing")).toHaveCount(0);
      await expect(route(page, "feed")).toHaveCount(0);
      // Unfiltered on purpose: `SessionExpired` renders in place of the root layout's children, so the routes are not
      // merely hidden in `<Activity>` but out of the document, the feed's copy below the listing included.
      await expect(page.locator('[data-route="listing"], [data-route="feed"]')).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`/ru/listing/${number}$`));
      await expect.poll(() => backVisible(page)).toBe(false);
      // The refused action is not repeated after the refused sign-in, and that sign-in was the only one.
      expect(actions).toHaveLength(1);
      expect(signIns).toHaveLength(1);

      // «Закрыть» closes the Mini App; nothing more is asked of the app server.
      await screen.getByRole("button", { name: "Закрыть" }).click();
      await expect.poll(() => closes(app)).toBe(1);
      await nothingAsked(page, isAppRequest(origin), 1_500);
      expect(later.map((request) => `${request.method()} ${new URL(request.url()).pathname}`)).toEqual([]);
      expect(await stillMarked(page)).toBe(true);
      await setScenario(page, null);
    });
  },
);
