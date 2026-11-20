import { getMessages } from "@homi/i18n";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { SWIPE_BACK_SETTLE_MS } from "@homi/ui";
import { act, cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Activity, type ReactNode, Suspense, use, useContext } from "react";
import { createPortal } from "react-dom";
import { defaultFilters } from "@homi/search";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ListingDetails, ListingInitial } from "@/features/listing/listingData";
import type { ApiFailure } from "@/lib/api/errors";

const state = vi.hoisted(() => ({
  pathname: "/listing/100001",
  depth: 1,
  back: vi.fn(),
  push: vi.fn(),
  /** The route change of the layer's close (`leaveListingRoute`): one step back at depth > 0, else the replace. */
  navBack: vi.fn(),
  navReplace: vi.fn(),
  /** The listing the launch link opened (`launchListing`, WP-38). */
  launch: null as number | null,
}));
vi.mock("@/lib/deeplinks/launch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/deeplinks/launch")>()),
  launchListing: () => state.launch,
}));
vi.mock("@/lib/api/browser", () => ({ bffFetch: () => new Promise(() => {}) }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: "ready" }) }));
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: vi.fn(), reauthenticate: vi.fn() }));
vi.mock("@/lib/actions/favorites", () => ({ setFavorite: vi.fn(() => new Promise(() => {})) }));
/** The screen's contact, translation and share actions (WP-26 W3): Server Action modules, never called here. */
vi.mock("@/lib/actions/listing", () => ({ getContact: vi.fn(), translate: vi.fn(), prepareShare: vi.fn() }));
vi.mock("@/lib/navigation/useBack", () => ({ useBack: () => ({ canGoBack: true, back: state.back }) }));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => state.pathname, useRouter: () => ({ push: state.push, replace: vi.fn() }) }));
vi.mock("next/navigation", () => ({ usePathname: () => `/ru${state.pathname}` }));
/** The app's depth: 1 (the feed pushed the listing) unless a case loads the listing directly. */
vi.mock("@/lib/navigation/history", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/navigation/history")>()),
  useDepth: () => state.depth,
  depth: () => state.depth,
}));
vi.mock("@/lib/navigation/nav", () => ({ nav: { back: state.navBack, replace: state.navReplace, push: vi.fn() } }));

import { resetPendingFavorites } from "@/features/feed/FavButton";
import { LISTING_LEAVE_MS } from "@/features/listing/closeListing";
import { saleSwitchRecord, takeSaleSwitch } from "@/features/listing/saleSwitch";
import { pushEntry, resetDepth } from "@/lib/navigation/history";
import { LISTING_CLOSE_SETTLE_MS, ListingLayer, type ListingLayerProps } from "@/features/listing/ListingLayer";
import { ListingScreen } from "@/features/listing/ListingScreen";
import { ListingLayerContext, useListingNumber } from "@/features/listing/useListing";
import { heroIndexOf, rememberHeroIndex, resetViewStates } from "@/features/listing/viewState";
import { resetPreviews, setPreview } from "@/lib/data/previewCache";
import { resetSessionMaps } from "@/lib/data/sessionMaps";
import { resetSources } from "@/lib/data/sources";
import { resetResources } from "@/lib/data/useResource";
import { backHandler } from "@/lib/navigation/backHandler";

import { detailsOf } from "../helpers/details";
import { swipeRight } from "../helpers/gestures";
import { previewOf } from "../helpers/listing";

const initialOk = (details: ListingDetails = detailsOf()): ListingInitial => ({
  ok: true,
  data: { listing: details, source: "stub" },
  meta: { source: "stub" },
});
const SERVER_FAILURE: ApiFailure = { ok: false, error: "server", status: 500, method: "GET", path: "listings/:number" };

/** A server part that never resolves: the layer shows its fallback screen. */
const pending = new Promise<never>(() => {});
function Streaming(): ReactNode {
  return use(pending);
}

/** A child route that reads the layer, in place and through a portal; `label` tells the copies apart. */
function Child({ label = "" }: { label?: string }) {
  const number = useListingNumber();
  return (
    <>
      <span data-child={label}>{String(number)}</span>
      {createPortal(<span data-portal={label}>{String(number)}</span>, document.body)}
    </>
  );
}

/** «Повторить» stands in: a child that asks the layer to scroll to the top. */
function ScrollButton() {
  const { scrollToTop } = useContext(ListingLayerContext);
  return <button type="button" data-scroll-top="" onClick={scrollToTop} />;
}

/** A child route that shows the state the screen reported to the layer, as the location child reads it. */
function ViewProbe() {
  const { view } = useContext(ListingLayerContext);
  return <span data-view-probe="">{String(view)}</span>;
}

function tree(props: Partial<ListingLayerProps> & { number?: string; mode?: "visible" | "hidden" } = {}) {
  const { number = "100001", mode = "visible", ...rest } = props;
  return (
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      <button type="button" data-opener="">
        card
      </button>
      <Activity mode={mode}>
        <Suspense fallback={null}>
          <ListingLayer
            params={paramsOf(number)}
            presentation="layer"
            screen={<ListingScreen number={Number(number)} initial={initialOk()} />}
            {...rest}
          >
            {rest.children ?? null}
          </ListingLayer>
        </Suspense>
      </Activity>
    </NextIntlClientProvider>
  );
}

/**
 * The layout's `params`: one promise per number, as the layout passes the same one on every render, already marked
 * settled the way React marks a promise it has read, so `use` reads it without suspending (React throttles the
 * reveal of a boundary that showed its fallback).
 */
const params = new Map<string, Promise<{ number: string }>>();
function paramsOf(number: string): Promise<{ number: string }> {
  let promise = params.get(number);
  if (promise === undefined) {
    promise = Object.assign(Promise.resolve({ number }), { status: "fulfilled", value: { number } });
    params.set(number, promise);
  }
  return promise;
}

async function mount(props: Parameters<typeof tree>[0] = {}) {
  const view = render(tree(props));
  await act(async () => {});
  return { ...view, rerender: async (next: Parameters<typeof tree>[0]) => {
    view.rerender(tree(next));
    await act(async () => {});
  } };
}

const layer = () => document.querySelector<HTMLElement>('[data-route="listing"]')!;
const overlay = () => document.querySelector<HTMLElement>('[data-slot="route-overlay"]')!;
const probe = () => document.querySelector("[data-view-probe]")?.textContent ?? null;

let fake: FakeTelegram | null = null;

beforeEach(() => {
  state.pathname = "/listing/100001";
  state.depth = 1;
  state.back.mockReset();
  state.push.mockReset();
  state.navBack.mockReset();
  state.navReplace.mockReset();
  fake = fakeTelegram({ version: "8.0" });
  vi.stubGlobal("innerWidth", 300);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetResources();
  resetPreviews();
  resetSessionMaps();
  resetSources();
  resetViewStates();
  resetPendingFavorites();
  fake?.uninstall();
  fake = null;
  document.body.className = "";
});

describe("ListingLayer (WP-26, D-20)", () => {
  it("one layer root with its own number from params, marked as the overlay copy", async () => {
    await mount();

    expect(overlay().getAttribute("data-presentation")).toBe("layer");
    expect(layer().getAttribute("data-layer")).toBe("overlay");
    expect(layer().getAttribute("data-listing-number")).toBe("100001");
    expect(layer().getAttribute("tabindex")).toBe("-1");
    expect(layer().querySelector('[data-listing-state="loaded"]')).not.toBeNull();
  });

  it("the standalone copy carries no data-layer", async () => {
    await mount({ presentation: "standalone" });

    expect(overlay().getAttribute("data-presentation")).toBe("standalone");
    expect(layer().hasAttribute("data-layer")).toBe(false);
    expect(layer().getAttribute("data-route")).toBe("listing");
  });

  it("while the server part streams, the fallback screen: the preview of the card", async () => {
    setPreview(100001, previewOf());
    await mount({ screen: <Streaming /> });

    expect(layer().querySelector('[data-listing-state="preview"]')).not.toBeNull();
  });

  it("an invalid number: the fallback skeleton only, no number", async () => {
    await mount({ number: "abc", screen: <Streaming /> });

    expect(layer().querySelector('[data-listing-state="skeleton"]')).not.toBeNull();
    expect(layer().hasAttribute("data-listing-number")).toBe(false);
  });

  it("the context reaches a child route, in place and through a portal", async () => {
    await mount({ children: <Child /> });

    expect(document.querySelector("[data-child]")?.textContent).toBe("100001");
    expect(document.querySelector("[data-portal]")?.textContent).toBe("100001");
  });

  it("a child route reads the state the screen shows: the fallback's preview, then the details", async () => {
    setPreview(100001, previewOf());
    const view = await mount({ screen: <Streaming />, children: <ViewProbe /> });
    expect(probe()).toBe("preview");

    await view.rerender({ children: <ViewProbe /> });

    expect(probe()).toBe("loaded");
  });

  it.each([
    ["not_found", 404],
    ["offline", 0],
    ["server", 500],
  ] as const)("a child route reads the screen's %s when the server's read failed (cookie mode, never in the resource)", async (error, status) => {
    await mount({
      screen: <ListingScreen number={100001} initial={{ ok: false, error, status, method: "GET", path: "listings/:number" }} />,
      children: <ViewProbe />,
    });

    expect(layer().querySelector(`[data-listing-state="${error}"]`)).not.toBeNull();
    expect(probe()).toBe(error);
  });

  it("scrollToTop scrolls the overlay, the layer's scroll container", async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: scrollTo });
    try {
      await mount({ children: <ScrollButton /> });
      act(() => document.querySelector<HTMLButtonElement>("[data-scroll-top]")!.click());

      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(scrollTo.mock.contexts[0]).toBe(overlay());
      expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    } finally {
      delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo;
    }
  });

  it("holds listing-open on <body> while visible", async () => {
    const view = await mount();
    expect(document.body.classList.contains("listing-open")).toBe(true);

    await view.rerender({ mode: "hidden" });
    expect(document.body.classList.contains("listing-open")).toBe(false);

    await view.rerender({ mode: "visible" });
    expect(document.body.classList.contains("listing-open")).toBe(true);

    view.unmount();
    expect(document.body.classList.contains("listing-open")).toBe(false);
  });

  it("each opening starts fresh: a hidden and shown again layer is a new overlay and forgets the hero photo", async () => {
    const view = await mount();
    const first = overlay();
    rememberHeroIndex(100001, 3);

    await view.rerender({ mode: "hidden" });
    expect(heroIndexOf(100001)).toBe(0);
    await view.rerender({ mode: "visible" });

    expect(overlay()).not.toBe(first);
    expect(layer().querySelector('[data-hero-counter]')?.textContent).toBe("1 / 8");
  });

  it("takes the focus on open and gives it back on close", async () => {
    const view = await mount({ mode: "hidden" });
    const opener = document.querySelector<HTMLButtonElement>("[data-opener]")!;
    opener.focus();

    await view.rerender({ mode: "visible" });
    expect(document.activeElement).toBe(layer());

    await view.rerender({ mode: "hidden" });
    expect(document.activeElement).toBe(opener);
  });

  describe("a standalone copy under an overlay copy (a direct load, then an intercepted soft navigation)", () => {
    const standaloneChild = () => document.querySelector('[data-child="standalone"]');
    const standalonePortal = () => document.querySelector('[data-portal="standalone"]');

    it("once an overlay copy has shown, the standalone copy drops its child routes for good, portals included", async () => {
      state.depth = 0;
      state.pathname = "/listing/100001/actions";
      const standalone = await mount({ presentation: "standalone", children: <Child label="standalone" /> });
      expect(standaloneChild()).not.toBeNull();
      expect(standalonePortal()).not.toBeNull();

      // The depth-0 close replaces the address with the listing; Next intercepts it into @overlay.
      state.pathname = "/listing/100001";
      const copy = await mount();

      expect(standaloneChild()).toBeNull();
      expect(standalonePortal()).toBeNull();
      expect(document.querySelector('[data-presentation="standalone"] [data-listing-state="loaded"]')).not.toBeNull();

      // A later child of the overlay copy does not revive it, nor does the copy leaving.
      state.pathname = "/listing/100001/photos";
      await copy.rerender({ children: <Child label="overlay" /> });
      await standalone.rerender({ presentation: "standalone", children: <Child label="standalone" /> });
      expect(document.querySelector('[data-portal="overlay"]')).not.toBeNull();
      expect(standaloneChild()).toBeNull();
      expect(standalonePortal()).toBeNull();

      await copy.rerender({ mode: "hidden" });
      copy.unmount();
      await standalone.rerender({ presentation: "standalone", children: <Child label="standalone" /> });
      expect(standaloneChild()).toBeNull();
      expect(standalonePortal()).toBeNull();
    });

    it("without an overlay copy the standalone copy keeps its child routes, so the ?step pushes still work", async () => {
      state.depth = 0;
      state.pathname = "/listing/100001/actions";
      const standalone = await mount({ presentation: "standalone", children: <Child label="standalone" /> });

      await standalone.rerender({ presentation: "standalone", children: <Child label="standalone" /> });
      await standalone.rerender({ presentation: "standalone", children: <Child label="standalone" /> });

      expect(standaloneChild()?.textContent).toBe("100001");
      expect(standalonePortal()?.textContent).toBe("100001");
    });
  });

  describe("swipe back", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    const swipe = () => {
      swipeRight(overlay(), 150);
      act(() => vi.advanceTimersByTime(SWIPE_BACK_SETTLE_MS));
    };

    it("on while the details are shown at the listing's own address: the route changes at once, without the leave (WP-36)", async () => {
      await mount();

      swipe();

      expect(state.navBack).toHaveBeenCalledTimes(1);
      expect(overlay().hasAttribute("data-leaving")).toBe(false);
    });

    it("on while the preview is shown", async () => {
      setPreview(100001, previewOf());
      await mount({ screen: <Streaming /> });

      swipe();

      expect(state.navBack).toHaveBeenCalledTimes(1);
      expect(overlay().hasAttribute("data-leaving")).toBe(false);
    });

    it("off with the skeleton", async () => {
      await mount({ screen: <Streaming /> });

      swipe();

      expect(state.navBack).not.toHaveBeenCalled();
      expect(state.back).not.toHaveBeenCalled();
    });

    it("off in an error state (the server's failure never reaches the resource)", async () => {
      setPreview(100001, previewOf());
      await mount({ screen: <ListingScreen number={100001} initial={SERVER_FAILURE} /> });
      expect(layer().querySelector('[data-listing-state="server"]')).not.toBeNull();

      swipe();

      expect(state.navBack).not.toHaveBeenCalled();
      expect(state.back).not.toHaveBeenCalled();
    });

    it("off while a child route is open over the listing", async () => {
      state.pathname = "/listing/100001/photos";
      await mount();

      swipe();

      expect(state.navBack).not.toHaveBeenCalled();
      expect(state.back).not.toHaveBeenCalled();
    });

    it("off at the app's depth 0, also on an overlay copy with data (only a directly loaded copy lies below)", async () => {
      state.depth = 0;
      await mount();
      expect(overlay().getAttribute("data-presentation")).toBe("layer");
      expect(layer().querySelector('[data-listing-state="loaded"]')).not.toBeNull();

      swipe();

      expect(state.navBack).not.toHaveBeenCalled();
      expect(state.back).not.toHaveBeenCalled();
    });
  });

  describe("the close (WP-36, row 5)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    /** Telegram's BackButton as `TelegramButtons` calls it: the handler the layer registered. */
    const telegramBack = () => act(() => backHandler()?.());
    const leaving = () => overlay().hasAttribute("data-leaving");
    const cross = () => document.querySelector<HTMLButtonElement>("[data-fallback-close]");
    const withoutSdk = () => {
      fake?.uninstall();
      fake = null;
    };
    const NOT_FOUND: ApiFailure = { ok: false, error: "not_found", status: 404, method: "GET", path: "listings/:number" };
    const DAY_LIMIT: ApiFailure = { ...SERVER_FAILURE, error: "rate_limited", status: 429, reason: "daily" };

    it("the overlay copy enters with its animation; the standalone copy does not", async () => {
      const { unmount } = await mount();
      expect(overlay().className).toContain("animate-listing-in");
      expect(overlay().hasAttribute("data-layer-motion")).toBe(true);
      unmount();

      await mount({ presentation: "standalone" });
      expect(overlay().className).not.toContain("animate-listing-in");
      expect(overlay().hasAttribute("data-layer-motion")).toBe(false);
    });

    it("Telegram's Back plays the leave, then changes the route once; a second Back during the leave does nothing", async () => {
      await mount();

      telegramBack();
      expect(leaving()).toBe(true);
      expect(overlay().className).toContain("animate-listing-out");
      expect(overlay().className).not.toContain("animate-listing-in");
      expect(overlay().className).toContain("pointer-events-none");
      expect(state.navBack).not.toHaveBeenCalled();

      telegramBack();
      act(() => vi.advanceTimersByTime(LISTING_LEAVE_MS - 1));
      expect(state.navBack).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));
      expect(state.navBack).toHaveBeenCalledTimes(1);
      expect(state.back).not.toHaveBeenCalled();

      telegramBack();
      act(() => vi.advanceTimersByTime(LISTING_LEAVE_MS));
      expect(state.navBack).toHaveBeenCalledTimes(1);
    });

    it("a sale launch listing loaded directly leaves the sale feed behind it: the layer hands its number to the route change (WP-38)", async () => {
      state.depth = 0;
      state.launch = 100001;
      try {
        // The first full record is a sale over a rent feed (the mounted copy's own record, a rent one, comes second).
        saleSwitchRecord(100001, "sale", defaultFilters("rent_long", "samarkand"), null);
        await mount({ presentation: "standalone" });

        telegramBack();
        act(() => vi.advanceTimersByTime(LISTING_LEAVE_MS));

        expect(state.navReplace.mock.calls).toEqual([["/?city=samarkand&deal=sale"]]);
      } finally {
        state.launch = null;
      }
    });

    it("hidden under a page pushed over it the mark stays; left for good it goes (WP-38)", async () => {
      state.launch = 100002;
      try {
        saleSwitchRecord(100002, "sale", defaultFilters("rent_long", "samarkand"), null);
        resetDepth("/");
        pushEntry("/listing/100002");
        pushEntry("/settings");
        const pushed = await mount({ number: "100002" });
        pushed.unmount();
        expect(takeSaleSwitch(100002)).toBe("/?city=samarkand&deal=sale");

        state.launch = 100003;
        saleSwitchRecord(100003, "sale", defaultFilters("rent_long", "samarkand"), null);
        resetDepth("/saved");
        const left = await mount({ number: "100003" });
        left.unmount();
        expect(takeSaleSwitch(100003)).toBeNull();
      } finally {
        state.launch = null;
        resetDepth("/");
      }
    });

    it("a listing loaded directly (depth 0) leaves to the feed by a replace", async () => {
      state.depth = 0;
      await mount({ presentation: "standalone" });

      telegramBack();
      act(() => vi.advanceTimersByTime(LISTING_LEAVE_MS));

      expect(state.navReplace.mock.calls).toEqual([["/"]]);
      expect(state.navBack).not.toHaveBeenCalled();
    });

    it("an overlay copy at depth 0 (over a standalone copy) changes the route at once, without the leave", async () => {
      state.depth = 0;
      await mount();

      telegramBack();

      expect(leaving()).toBe(false);
      expect(state.navReplace.mock.calls).toEqual([["/"]]);
    });

    it("takes Telegram's Back only at its own address: not while a child route is open", async () => {
      state.pathname = "/listing/100001/photos";
      await mount();
      expect(backHandler()).toBeNull();
    });

    it("lets go of Telegram's Back when it hides", async () => {
      const view = await mount();
      expect(backHandler()).not.toBeNull();

      await view.rerender({ mode: "hidden" });

      expect(backHandler()).toBeNull();
    });

    it.each([
      ["lite graphics", () => document.documentElement.classList.add("lite")],
      ["reduced motion", () => vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }) as MediaQueryList)],
    ])("in %s the route changes at once, without the leave", async (_case, arrange) => {
      arrange();
      try {
        await mount();
        telegramBack();

        expect(leaving()).toBe(false);
        expect(state.navBack).toHaveBeenCalledTimes(1);
      } finally {
        document.documentElement.classList.remove("lite");
      }
    });

    it("a new opening during the leave cancels it: no route change, and the new listing shows at once", async () => {
      const view = await mount();
      telegramBack();
      expect(leaving()).toBe(true);

      state.pathname = "/listing/100002";
      await view.rerender({ number: "100002", screen: <ListingScreen number={100002} initial={initialOk(detailsOf({ number: 100002 }))} /> });
      act(() => vi.advanceTimersByTime(LISTING_LEAVE_MS));

      expect(state.navBack).not.toHaveBeenCalled();
      expect(layer().getAttribute("data-listing-number")).toBe("100002");
      expect(leaving()).toBe(false);
    });

    it("an address that moved during the leave (another navigation) cancels the route change and shows the layer again", async () => {
      await mount();
      telegramBack();

      window.history.pushState(null, "", "/ru/listing/100001?x=1");
      act(() => vi.advanceTimersByTime(LISTING_LEAVE_MS));

      expect(state.navBack).not.toHaveBeenCalled();
      expect(leaving()).toBe(false);
      window.history.replaceState(null, "", "/");
    });

    it("a route change that never removed the layer lets it take Back again after the settle", async () => {
      await mount();
      telegramBack();
      act(() => vi.advanceTimersByTime(LISTING_LEAVE_MS));
      expect(state.navBack).toHaveBeenCalledTimes(1);

      act(() => vi.advanceTimersByTime(LISTING_CLOSE_SETTLE_MS));
      expect(leaving()).toBe(false);
      telegramBack();
      act(() => vi.advanceTimersByTime(LISTING_LEAVE_MS));

      expect(state.navBack).toHaveBeenCalledTimes(2);
    });

    it("a replace (depth 0) is never released: the layer stays faded and latched while the feed loads", async () => {
      state.depth = 0;
      await mount({ presentation: "standalone" });
      telegramBack();
      act(() => vi.advanceTimersByTime(LISTING_LEAVE_MS));
      expect(state.navReplace).toHaveBeenCalledTimes(1);

      act(() => vi.advanceTimersByTime(LISTING_CLOSE_SETTLE_MS * 3));
      telegramBack();
      act(() => vi.advanceTimersByTime(LISTING_LEAVE_MS));

      expect(leaving()).toBe(true);
      expect(state.navReplace).toHaveBeenCalledTimes(1);
    });

    it("a step back whose address changed is not released, however long the page takes", async () => {
      await mount();
      telegramBack();
      act(() => vi.advanceTimersByTime(LISTING_LEAVE_MS));
      expect(state.navBack).toHaveBeenCalledTimes(1);
      window.history.pushState(null, "", "/ru?landed=1");

      act(() => vi.advanceTimersByTime(LISTING_CLOSE_SETTLE_MS));

      expect(leaving()).toBe(true);
      window.history.replaceState(null, "", "/");
    });

    it("«Смотреть свежие» of a missing listing closes through the same path, once", async () => {
      await mount({ screen: <ListingScreen number={100001} initial={NOT_FOUND} /> });

      const fresh = Array.from(document.querySelectorAll("button")).find((button) => button.textContent === "Смотреть свежие")!;
      act(() => fresh.click());
      act(() => fresh.click());
      act(() => vi.advanceTimersByTime(LISTING_LEAVE_MS));

      expect(state.navBack).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["skeleton", () => <Streaming />],
      ["loaded", () => <ListingScreen number={100001} initial={initialOk()} />],
      ["not_found", () => <ListingScreen number={100001} initial={NOT_FOUND} />],
      ["day_limit", () => <ListingScreen number={100001} initial={DAY_LIMIT} />],
      ["server", () => <ListingScreen number={100001} initial={SERVER_FAILURE} />],
    ])("without the SDK the %s state carries the cross «Закрыть», which closes with the leave (TMA-047)", async (stateName, screen) => {
      withoutSdk();
      await mount({ screen: screen() });
      expect(layer().querySelector(`[data-listing-state="${stateName}"]`)).not.toBeNull();

      expect(cross()?.getAttribute("aria-label")).toBe("Закрыть");
      act(() => cross()!.click());
      expect(leaving()).toBe(true);
      act(() => vi.advanceTimersByTime(LISTING_LEAVE_MS));

      expect(state.navBack).toHaveBeenCalledTimes(1);
    });

    it("with the SDK there is no cross", async () => {
      await mount();
      expect(cross()).toBeNull();
    });
  });
});
