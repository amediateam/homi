import { expect, launchApp, stubMedia, test as base, type LaunchedApp } from "@homi/testing/playwright";
import type { Page, Request } from "@playwright/test";

/**
 * Opening the listing screen of WP-26 (SCR-018, SCR-019) against the API on stubs, in cookie and header mode: a feed
 * card opens the listing over the feed with the card's preview at once and Back returns to the same scroll position;
 * a direct load shows the skeleton, then the listing, and Back goes to the feed; the reserved numbers of WP-12 —
 * `100016` answers as `100001` (the address is replaced, no second browser read), `999404` is gone («Этого объявления
 * уже нет», whose «Смотреть свежие» closes to the feed, WP-36), `999503` fails on every «Повторить»; the day limit (the
 * scenario `daily_limit`) shows «Лимит на сегодня» and recovers on «Повторить» once the scenario is cleared; a source
 * failure on an ordinary number (the scenario `source_unavailable`, set once the session is ready and cleared before
 * «Повторить») recovers on «Повторить»; in uz the original text translates and
 * toggles back; Telegram's SettingsButton closes the listing; a directly loaded market sheet shows its text, its
 * backdrop closes it to the listing and Back then goes to the feed (review X1).
 *
 * The visible copy only: with `cacheComponents` the router keeps earlier routes hidden in `<Activity>`. A soft
 * navigation to a listing address over a directly loaded one adds an overlay copy over the standalone copy (the
 * redirect, a depth-0 close of a child), so two listing layers can be visible at once: the checks select a layer by
 * its number or take the first one. Each test launches once; the full run shares one stub user's API limit (120 a
 * minute, KI-32). Every photo is answered by `stubMedia`.
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
type NextWindow = Window & { next: { router: { push(href: string): void } } };

/** The ordinary listing of the stub catalogue: 8 photos, a phone, the uz and en translations. */
const LISTING = 100001;
const TITLE = "2-комн. квартира, 54 м²";

const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });
const html = (page: Page) => page.locator("html");
const route = (page: Page, name: string) => visible(page, `[data-route="${name}"]`);
const cards = (page: Page) => visible(page, "article[data-listing]");
const card = (page: Page, number: number) => visible(page, `article[data-listing="${number}"]`);
/** The listing layer of `number` (each layer carries its own number, also a hidden one). */
const layer = (page: Page, number: number) => visible(page, `[data-route="listing"][data-listing-number="${number}"]`);
const stateOf = (page: Page, number: number) => layer(page, number).locator("[data-listing-state]");
const press = (page: Page, eventType: "backButtonClicked" | "settingsButtonClicked") =>
  page.evaluate((type) => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.emit(type), eventType);
const backVisible = (page: Page) =>
  page.evaluate(() => (window as unknown as { __homiFakeTelegram: Fake }).__homiFakeTelegram.webApp.BackButton.isVisible);
const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

/** The listing's read through `/bff` (header mode, and cookie mode while the document had no cookie yet). */
const isListingRead = (number: number) => (url: URL) => url.pathname === `/bff/listings/${number}`;
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

/** A gate a route handler waits on: `release()` lets the held requests go on. */
function gate(): { held: Promise<void>; release: () => void } {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { held, release };
}

/** Two animation frames: the shell has read the scroll position of the last scroll event by then. */
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

/** Scrolls the window and waits until the shell has read the position. */
async function scrollTo(page: Page, y: number): Promise<void> {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await nextFrames(page);
}

/**
 * Records, from the first parsed node on, every state each visible listing layer shows (`data-listing-state`), in
 * order and per number: a mutation observer runs before the browser paints, so a state shown for one frame counts.
 */
async function recordStates(page: Page): Promise<() => Promise<Record<string, string[]>>> {
  await page.addInitScript(() => {
    const seen: Record<string, string[]> = {};
    Object.assign(window, { __listingStates: seen });
    const read = () => {
      for (const node of document.querySelectorAll("[data-listing-state]")) {
        if (!node.checkVisibility()) {
          continue;
        }
        const number = node.closest("[data-listing-number]")?.getAttribute("data-listing-number") ?? "none";
        const states = (seen[number] ??= []);
        const state = node.getAttribute("data-listing-state") ?? "";
        if (states.at(-1) !== state) {
          states.push(state);
        }
      }
    };
    new MutationObserver(read).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-listing-state"] });
  });
  return () => page.evaluate(() => (window as unknown as { __listingStates: Record<string, string[]> }).__listingStates);
}

/** A client-side navigation through the app router, as a `Link` would make it. */
async function softNavigate(page: Page, href: string): Promise<void> {
  await page.evaluate((target) => (window as unknown as NextWindow).next.router.push(target), href);
}

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

const clearScenario = (page: Page) => page.context().clearCookies({ name: "homi_stub_scenario" });

/** Back on the feed: its address, the feed visible, no listing layer left. */
async function onFeed(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/ru$/);
  await expect(route(page, "feed")).toBeVisible();
  await expect(visible(page, '[data-route="listing"]')).toHaveCount(0);
}

for (const mode of ["cookie", "header"] as const) {
  test.describe(`listing open (${mode} mode)`, () => {
    test("a feed card opens the listing over the feed with its preview at once, then the details; Back keeps the scroll", async ({ page }) => {
      const states = await recordStates(page);
      await open(page, mode);
      await expect(cards(page).first()).toBeVisible();
      // The fourth card 150 px below the top, clear of the top bar and the tab bar, so the tap does not scroll.
      const fourth = cards(page).nth(3);
      const number = Number(await fourth.getAttribute("data-listing"));
      const top = await fourth.evaluate((element) => element.getBoundingClientRect().top + window.scrollY);
      await scrollTo(page, Math.round(top - 150));
      const position = await scrollY(page);
      expect(position).toBeGreaterThan(0);

      // Header mode reads the details through `/bff`, held here so the preview can be looked at. Cookie mode reads
      // them in the server part of the render, which the router waits for before it shows the layer.
      const slow = gate();
      let held = 0;
      if (mode === "header") {
        await page.route(isListingRead(number), async (handled) => {
          held += 1;
          await slow.held;
          await handled.fallback();
        });
      }

      await card(page, number).locator("a").click();
      await expect(page).toHaveURL(new RegExp(`/ru/listing/${number}$`));
      await expect(visible(page, `[data-route="listing"][data-layer="overlay"][data-listing-number="${number}"]`)).toBeVisible();
      if (mode === "header") {
        await expect.poll(() => held).toBe(1);
        // The card's preview while the details are on their way: its title and price, section skeletons, a pending CTA.
        await expect(stateOf(page, number)).toHaveAttribute("data-listing-state", "preview");
        await expect(layer(page, number).locator("[data-listing-title]")).toHaveText(/\S/);
        await expect(layer(page, number).locator('[data-hero] [data-hero-counter]')).toHaveText(/^1 \/ \d+$/);
        await expect(layer(page, number).locator('[data-section-skeleton="3"]')).toBeVisible();
        await expect(layer(page, number).locator('[data-cta-action="pending"]')).toBeVisible();
        await expect(layer(page, number).locator("[data-cta-price]")).toHaveText(/\S/);
        await expect(layer(page, number).locator("[data-section]")).toHaveCount(0);
      }
      slow.release();
      await expect(stateOf(page, number)).toHaveAttribute("data-listing-state", "loaded");
      await expect(layer(page, number).locator('[data-section="author"]')).toBeVisible();
      await expect(layer(page, number).locator('[data-cta-action="call"]')).toBeVisible();
      // Never a skeleton: the preview first, the details replace it. In cookie mode the router shows the layer once the
      // render streams; whether the preview row lands before the server part's depends on how fast the API answers
      // (one chunk on a fast one), so there only the skeleton is ruled out.
      const seen = (await states())[String(number)];
      if (mode === "header") {
        expect(seen).toEqual(["preview", "loaded"]);
      } else {
        expect(seen).not.toContain("skeleton");
        expect(seen.at(-1)).toBe("loaded");
      }

      await press(page, "backButtonClicked");
      await onFeed(page);
      await expect.poll(() => scrollY(page)).toBe(position);
    });

    test("a direct load shows the skeleton, then the listing; Back goes to the feed", async ({ page }) => {
      const states = await recordStates(page);
      const reads = recordRequests(page, (request) => isListingRead(LISTING)(new URL(request.url())));
      await open(page, mode, `/ru/listing/${LISTING}`);
      await expect(stateOf(page, LISTING)).toHaveAttribute("data-listing-state", "loaded");
      await expect(layer(page, LISTING)).not.toHaveAttribute("data-layer");
      await expect(layer(page, LISTING).locator("[data-listing-title]")).toHaveText(TITLE);
      await expect(layer(page, LISTING).locator('[data-hero] [data-hero-counter]')).toHaveText("1 / 8");
      // No card was there to preview: the skeleton, then the details. The first launch's document has no cookie yet,
      // so both modes read once through `/bff`.
      expect((await states())[String(LISTING)]).toEqual(["skeleton", "loaded"]);
      expect(reads).toHaveLength(1);
      // ru has no translate button.
      await expect(layer(page, LISTING).locator("button[data-translate]")).toHaveCount(0);
      await expect.poll(() => backVisible(page)).toBe(true);

      await press(page, "backButtonClicked");
      await onFeed(page);
      await expect.poll(() => backVisible(page)).toBe(false);
    });

    test("the cards of a ground floor and a basement open listings whose floor tile is the word, without a caption (BR-APP-110)", async ({ page }) => {
      await open(page, mode, "/?city=tashkent_region");
      for (const [number, word] of [
        [100022, "Цокольный этаж"],
        [100023, "Подвал"],
      ] as const) {
        await card(page, number).locator("a").click();
        await expect(stateOf(page, number)).toHaveAttribute("data-listing-state", "loaded");
        const floor = layer(page, number).locator('[data-key-facts] [data-fact="floor"]');
        await expect(floor.locator("b")).toHaveText(word);
        await expect(floor.locator("span")).toHaveText("");
        // The word wraps inside its tile instead of being cut off.
        expect(await floor.locator("b").evaluate((value) => value.scrollWidth <= value.clientWidth)).toBe(true);

        await press(page, "backButtonClicked");
        await expect(page).toHaveURL(/\/ru\?city=tashkent_region$/);
        await expect(visible(page, '[data-route="listing"]')).toHaveCount(0);
      }
    });

    test("the merged number 100016 shows 100001 with one read and replaces the address; Back goes to the feed", async ({ page }) => {
      const aliasReads = recordRequests(page, (request) => isListingRead(100016)(new URL(request.url())));
      const targetReads = recordRequests(page, (request) => isListingRead(LISTING)(new URL(request.url())));
      await open(page, mode, "/ru/listing/100016");

      await expect(page).toHaveURL(new RegExp(`/ru/listing/${LISTING}$`));
      await expect(stateOf(page, LISTING)).toHaveAttribute("data-listing-state", "loaded");
      await expect(layer(page, LISTING).locator("[data-listing-title]")).toHaveText(TITLE);
      // The answer seeded the surviving number: no second browser read, nothing of the alias left loading.
      await nothingAsked(page, (request) => isListingRead(LISTING)(new URL(request.url())));
      expect(aliasReads).toHaveLength(1);
      expect(targetReads).toEqual([]);
      await expect(visible(page, '[data-listing-state="skeleton"], [data-listing-state="preview"]')).toHaveCount(0);

      await press(page, "backButtonClicked");
      await onFeed(page);
    });

    test("999404 shows «Этого объявления уже нет», «Смотреть свежие» closes to the feed; 999503 fails again on «Повторить»", async ({ page }) => {
      await open(page, mode);
      await expect(cards(page).first()).toBeVisible();

      await softNavigate(page, "/ru/listing/999404");
      await expect(stateOf(page, 999404)).toHaveAttribute("data-listing-state", "not_found");
      const gone = layer(page, 999404).getByRole("alert");
      await expect(gone).toContainText("Этого объявления уже нет — квартиру, похоже, сдали или продали");
      for (const part of ["[data-hero]", "[data-listing-title]", "[data-cta]", '[data-slot="error-state"]']) {
        await expect(layer(page, 999404).locator(part), part).toHaveCount(0);
      }
      const feedReads = recordRequests(page, (request) => new URL(request.url()).pathname === "/bff/listings");
      await gone.getByRole("button", { name: "Смотреть свежие" }).click();
      await onFeed(page);
      // The feed below is uncovered as it was: not read again.
      await nothingAsked(page, (request) => new URL(request.url()).pathname === "/bff/listings");
      expect(feedReads).toEqual([]);

      // Opened again: the earlier opening's screen can stay hidden in the layer beside the new one, so the visible one.
      await softNavigate(page, "/ru/listing/999404");
      await expect(layer(page, 999404).locator('[data-listing-state="not_found"]').filter({ visible: true })).toBeVisible();
      await press(page, "backButtonClicked");
      await onFeed(page);

      const reads = recordRequests(page, (request) => isListingRead(999503)(new URL(request.url())));
      await softNavigate(page, "/ru/listing/999503");
      const failure = layer(page, 999503).locator('[data-slot="error-state"]');
      await expect(failure).toHaveAttribute("data-kind", "server");
      await expect(failure.locator('[data-slot="error-state-title"]')).toHaveText("Не загрузилось");
      await expect(layer(page, 999503).locator("[data-hero], [data-cta]")).toHaveCount(0);
      // Cookie mode had the failure from the server part; header mode read it through `/bff`.
      await expect.poll(() => reads.length).toBe(mode === "cookie" ? 0 : 1);
      const before = reads.length;

      await failure.getByRole("button", { name: "Повторить" }).click();
      await expect.poll(() => reads.length).toBe(before + 1);
      await expect(stateOf(page, 999503)).toHaveAttribute("data-listing-state", "server");
      await expect(failure.locator('[data-slot="error-state-title"]')).toHaveText("Не загрузилось");
    });

    test("the day limit shows «Лимит на сегодня»; «Повторить» without the scenario loads the listing (DEC-59)", async ({ page }) => {
      await open(page, mode);
      await expect(cards(page).first()).toBeVisible();
      const number = Number(await cards(page).first().getAttribute("data-listing"));

      await stubScenario(page, "daily_limit");
      await card(page, number).locator("a").click();
      await expect(stateOf(page, number)).toHaveAttribute("data-listing-state", "day_limit");
      const limit = layer(page, number).locator('[data-slot="error-state"]');
      await expect(limit.locator('[data-slot="error-state-title"]')).toHaveText("Лимит на сегодня");
      await expect(limit.locator('[data-slot="error-state-text"]')).toHaveText(
        "За сутки открыто очень много объявлений. Попробуйте позже — Радар продолжит присылать новые в чат.",
      );
      await expect(layer(page, number).locator("[data-hero], [data-cta]")).toHaveCount(0);

      await clearScenario(page);
      await limit.getByRole("button", { name: "Повторить" }).click();
      await expect(stateOf(page, number)).toHaveAttribute("data-listing-state", "loaded");
      await expect(html(page)).toHaveAttribute("data-session", "ready");
    });

    test("a source failure on an ordinary listing shows «Не загрузилось»; «Повторить» reads again and shows it", async ({ page }) => {
      await open(page, mode);
      await expect(cards(page).first()).toBeVisible();
      const second = cards(page).nth(1);
      const number = Number(await second.getAttribute("data-listing"));

      // Set once the session is ready: the scenario fails every stub read, `/me` included.
      await stubScenario(page, "source_unavailable");
      await card(page, number).locator("a").click();
      const failure = layer(page, number).locator('[data-slot="error-state"]');
      await expect(failure).toHaveAttribute("data-kind", "server");
      await expect(failure.locator('[data-slot="error-state-title"]')).toHaveText("Не загрузилось");
      await expect(layer(page, number).locator("[data-hero], [data-cta]")).toHaveCount(0);

      await clearScenario(page);
      const reads = recordRequests(page, (request) => isListingRead(number)(new URL(request.url())));
      await failure.getByRole("button", { name: "Повторить" }).click();
      await expect(stateOf(page, number)).toHaveAttribute("data-listing-state", "loaded");
      await expect(layer(page, number).locator('[data-section="author"]')).toBeVisible();
      expect(reads).toHaveLength(1);
      await expect(html(page)).toHaveAttribute("data-session", "ready");
    });

    test("in uz the original text translates with one request and toggles back without another", async ({ page }) => {
      // The address's locale survives the sign-in only when `me.locale` agrees: the stub user of the `uz` scenario.
      await stubScenario(page, "uz");
      await launchApp(page, { mode, locale: "uz", path: `/uz/listing/${LISTING}` });
      await expect(html(page)).toHaveAttribute("data-session", "ready");
      await expect(page).toHaveURL(new RegExp(`/uz/listing/${LISTING}$`));
      await expect(stateOf(page, LISTING)).toHaveAttribute("data-listing-state", "loaded");
      const actions = recordRequests(page, isServerAction);

      const original = layer(page, LISTING).locator("[data-original]");
      await layer(page, LISTING).locator("button[data-original-toggle]").click();
      const text = original.locator("pre[data-original-text]");
      await expect(text).toContainText("Сдаётся 2-комн. квартира");
      const translate = original.locator("button[data-translate]");
      await expect(translate).toHaveText("Tarjima qilish");
      await expect(original.locator("[data-machine-translation]")).toHaveCount(0);

      await translate.click();
      await expect(text).toContainText("Metro yaqinida yorugʻ kvartira");
      // The translated text is masked by the server as the original is.
      await expect(text).toContainText("+998 ** *** ** 67");
      await expect(original.locator("[data-machine-translation]")).toHaveText("AI tarjimasi");
      await expect(translate).toHaveText("Aslini koʻrsatish");
      expect(actions).toHaveLength(1);
      expect(actions[0].postData() ?? "").toContain(`${LISTING}`);

      await translate.click();
      await expect(text).toContainText("Сдаётся 2-комн. квартира");
      await expect(original.locator("[data-machine-translation]")).toHaveCount(0);
      await expect(translate).toHaveText("Tarjima qilish");
      await translate.click();
      await expect(text).toContainText("Metro yaqinida yorugʻ kvartira");
      await nothingAsked(page, isServerAction);
      expect(actions).toHaveLength(1);
      await clearScenario(page);
    });

    test("Telegram's SettingsButton closes the listing and shows the settings", async ({ page }) => {
      await open(page, mode);
      await expect(cards(page).first()).toBeVisible();
      const number = Number(await cards(page).first().getAttribute("data-listing"));
      await card(page, number).locator("a").click();
      await expect(stateOf(page, number)).toHaveAttribute("data-listing-state", "loaded");

      await press(page, "settingsButtonClicked");
      await expect(page).toHaveURL(/\/ru\/settings$/);
      await expect(route(page, "settings")).toBeVisible();
      await expect(visible(page, '[data-route="listing"]')).toHaveCount(0);
      await expect(visible(page, "[data-layer]")).toHaveCount(0);
      await expect(html(page)).not.toHaveClass(/(^|\s)listing-open(\s|$)/);
    });

    test("a direct load of the market sheet shows its text; the backdrop closes it to the listing, Back then to the feed", async ({ page }) => {
      await open(page, mode, `/ru/listing/${LISTING}/market`);
      const sheet = visible(page, '[data-slot="bottom-sheet"] [data-route="listing/market"]');
      await expect(sheet).toBeVisible();
      await expect(page.getByRole("dialog", { name: "Откуда эта цифра" })).toBeVisible();
      // The listing's resource reaches the portalled sheet: its paragraphs, not the skeleton.
      await expect(sheet.locator('[data-market-paragraph="sample"]')).toBeVisible();
      await expect(sheet.locator('[data-market-paragraph="median"]')).toBeVisible();
      await expect(sheet.locator("[data-market-footer]")).toBeVisible();
      await expect(visible(page, '[data-slot="bottom-sheet-close"]')).toHaveCount(0);
      await expect(visible(page, "button[data-market-more]")).toHaveCount(0);
      await expect(visible(page, '[data-route="listing"]').first()).toBeVisible();

      await visible(page, '[data-slot="bottom-sheet-overlay"]').click({ position: { x: 10, y: 8 } });
      await expect(page).toHaveURL(new RegExp(`/ru/listing/${LISTING}$`));
      await expect(visible(page, '[data-route^="listing/"]')).toHaveCount(0);
      await expect(visible(page, '[data-route="listing"]').first()).toBeVisible();
      await expect(visible(page, '[data-route="listing"] [data-listing-state="loaded"]').first()).toBeVisible();

      await press(page, "backButtonClicked");
      await onFeed(page);
    });
  });
}

test.describe("listing open: the leave (WP-36)", () => {
  test("the listing enters with its animation; a scrolled listing leaves with its own, the CTA bar at the bottom, then the feed shows", async ({
    page,
  }) => {
    await open(page, "cookie");
    await expect(cards(page).first()).toBeVisible();
    const number = Number(await cards(page).first().getAttribute("data-listing"));

    // The entrance runs: read the overlay's animations in the frame it appears.
    const entering = page.evaluate(
      () =>
        new Promise<string[]>((resolve) => {
          const check = () => {
            const overlay = document.querySelector('[data-slot="route-overlay"][data-presentation="layer"]');
            if (overlay === null) {
              requestAnimationFrame(check);
              return;
            }
            resolve(overlay.getAnimations().map((animation) => (animation as CSSAnimation).animationName));
          };
          check();
        }),
    );
    await card(page, number).locator("a").click();
    expect(await entering).toEqual(["listing-in"]);
    await expect(stateOf(page, number)).toHaveAttribute("data-listing-state", "loaded");
    await layer(page, number).evaluate((root) => {
      const scroller = root.closest<HTMLElement>('[data-slot="route-overlay"]')!;
      scroller.scrollTop = 600;
    });

    // Back, then the leave held half-way: it runs (its name, the layer moved right), and the fixed bar does not move
    // with the layer's scroll.
    const [names, left, bottom, height] = await page.evaluate(
      () =>
        new Promise<[string[], number, number, number]>((resolve) => {
          (window as unknown as { __homiFakeTelegram: { emit(type: string): void } }).__homiFakeTelegram.emit("backButtonClicked");
          const check = () => {
            const overlay = document.querySelector<HTMLElement>('[data-slot="route-overlay"][data-leaving]');
            if (overlay === null) {
              requestAnimationFrame(check);
              return;
            }
            const animations = overlay.getAnimations();
            for (const animation of animations) {
              animation.pause();
              animation.currentTime = 100;
            }
            resolve([
              animations.map((animation) => (animation as CSSAnimation).animationName),
              overlay.getBoundingClientRect().left,
              overlay.querySelector("[data-cta]")!.getBoundingClientRect().bottom,
              window.innerHeight,
            ]);
          };
          check();
        }),
    );
    expect(names).toEqual(["listing-out"]);
    expect(left).toBeGreaterThan(0);
    expect(Math.abs(bottom - height)).toBeLessThan(2);

    await onFeed(page);
  });
});
