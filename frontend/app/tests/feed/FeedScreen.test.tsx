import { getMessages } from "@homi/i18n";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps, ReactElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ListingPreview } from "@/features/feed/types";
import type { BffOptions } from "@/lib/api/browser";
import type { ApiResult } from "@/lib/api/types";

type Answer = ApiResult<ListingPreview[]>;

/** One `bffFetch` the list sent; the test answers it when it wants. */
interface Sent {
  query: URLSearchParams;
  resolve: (answer: Answer) => void;
}

const state = vi.hoisted(() => ({
  sent: [] as Sent[],
  status: "ready" as string,
  me: null as { city: string | null } | null,
  /** The launch signed in (`useSession().renewed`). */
  renewed: false,
  /** The locale-less address the screen is mounted at, and its query. */
  pathname: "/",
  search: "",
  /** The server half: the cookie, and the cities `/me` names. */
  cookie: "cookie-token" as string | null,
  profileCity: "tashkent" as string | null,
  measure: vi.fn(),
}));
vi.mock("@/lib/api/browser", () => ({
  bffFetch: (_path: string, options: BffOptions) =>
    new Promise<Answer>((resolve) => {
      state.sent.push({ query: options.query as URLSearchParams, resolve });
    }),
}));
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: vi.fn(), reauthenticate: vi.fn() }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: state.status, me: state.me, renewed: state.renewed }) }));
vi.mock("@/lib/actions/favorites", () => ({ setFavorite: vi.fn() }));
vi.mock("@/lib/navigation/nav", () => ({ nav: { push: vi.fn(), replace: vi.fn() } }));
vi.mock("@/lib/graphics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/graphics")>()),
  measureScrollPerformance: () => state.measure(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => `/ru${state.pathname === "/" ? "" : state.pathname}`,
  useSearchParams: () => new URLSearchParams(state.search),
}));
/** The counted `Link` needs the App Router: a plain anchor that never navigates. */
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => state.pathname,
  Link: ({ href, prefetch, scroll, ...props }: ComponentProps<"a"> & { href: string; prefetch?: boolean; scroll?: boolean }) => (
    <a {...props} href={href} data-prefetch={String(prefetch)} data-scroll={String(scroll)} />
  ),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "homi_session" && state.cookie !== null ? { name, value: state.cookie } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ io: async () => undefined }));
vi.mock("next/root-params", () => ({ locale: async () => "ru" }));

import { resetPendingFavorites } from "@/features/feed/FavButton";
import { feedListKey } from "@/features/feed/feedQuery";
import { FeedScreen, type FeedScreenProps } from "@/features/feed/FeedScreen";
import { readFirstPage } from "@/features/feed/FeedServer";
import { resetSessionMaps } from "@/lib/data/sessionMaps";
import { resetSources } from "@/lib/data/sources";
import { resetReference } from "@/lib/reference/useReference";
import { useScreenSearchState } from "@/lib/search/useScreenSearchState";
import { refreshHandlerFor } from "@/lib/ui/shellState";

import { previewOf } from "../helpers/listing";
import { cityOf, feedReference } from "../helpers/reference";

/** jsdom has no `IntersectionObserver`; the sentinel is `ListingFeed.test.tsx`'s concern. */
class QuietObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

function page(numbers: number[], nextCursor: string | null = null): Answer {
  return { ok: true, data: numbers.map((number) => previewOf({ number })), meta: { source: "stub", next_cursor: nextCursor } };
}

/** The `searchParams` object a page receives for a query: a repeated key becomes an array, as Next.js gives it. */
function recordOf(query: string): Record<string, string | string[]> {
  const record: Record<string, string | string[]> = {};
  for (const [key, value] of new URLSearchParams(query)) {
    const before = record[key];
    record[key] = before === undefined ? value : [before, value].flat();
  }
  return record;
}

/** The server half for real (`readFirstPage`) against a fake API: `/me` names `state.profileCity`, a list answers 1 … 20. */
function serveApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL) => {
      const path = new URL(String(url)).pathname.replace("/api/v1", "");
      if (path === "/me") {
        return Response.json({ success: true, data: { city: state.profileCity, locale: "ru" }, meta: {} });
      }
      return Response.json({ success: true, data: range(1, 20).map((number) => previewOf({ number })), meta: { source: "stub", next_cursor: "c2" } });
    }),
  );
}

/** The address the screen is mounted at: `path` with `query`. */
const at = (path: string, query = "") => {
  state.pathname = path;
  state.search = query;
};

/** The screen with the catalogue, as the page renders it. */
const intl = (props: FeedScreenProps) => (
  <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
    <FeedScreen {...props} />
  </NextIntlClientProvider>
);

function screen(props: Partial<FeedScreenProps> = {}) {
  const all: FeedScreenProps = { initial: null, serverSmallOnly: false, ...props };
  const tree = (next: Partial<FeedScreenProps> = {}) => intl({ ...all, ...next });
  const view = render(tree());
  return { rerender: (next: Partial<FeedScreenProps> = {}) => view.rerender(tree(next)), unmount: view.unmount };
}

const answer = (index: number, value: Answer) => act(async () => state.sent[index].resolve(value));
const cards = () => [...document.querySelectorAll<HTMLElement>("article[data-listing]")].map((card) => Number(card.dataset.listing));
const skeletons = () => document.querySelectorAll("[data-card-skeleton]").length;
const pull = () => refreshHandlerFor("/")?.();

let scrolls: unknown[][] = [];

beforeEach(() => {
  state.sent.length = 0;
  state.status = "ready";
  state.me = { city: "tashkent" };
  state.renewed = false;
  state.cookie = "cookie-token";
  state.profileCity = "tashkent";
  state.measure.mockReset();
  at("/");
  window.localStorage.clear();
  scrolls = [];
  vi.stubEnv("API_URL", "https://api.test/api/v1");
  vi.stubGlobal("IntersectionObserver", QuietObserver);
  vi.spyOn(window, "scrollTo").mockImplementation((...args: unknown[]) => void scrolls.push(args));
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetSessionMaps();
  resetSources();
  resetReference();
  resetPendingFavorites();
});

describe("FeedScreen: the server's page one and the browser's list key (D2, D3)", () => {
  /**
   * Addresses as the bot, the tabs and the sheets write them: keys in any order, repeated keys, reserved and foreign
   * parameters, the default sort spelled out, `posted_days`, a polygon, an invalid city. The browser renders the
   * screen twice before it knows `me`: on the server, with no session and no storage, and at hydration, where the
   * device may have saved any city — the profile's since the last sign-in, another one when the profile changed
   * elsewhere, or none. Both take the city the server read page one for (`profileCity`).
   */
  const ADDRESSES = [
    "",
    "city=tashkent",
    "deal=sale",
    "districts=chilonzor&city=samarkand&deal=sale&districts=yunusabad",
    "utm_source=bot&rooms_min=2&from=map&sort=cheap&city=tashkent",
    "sort=new&posted_days=7",
    "polygon=41.31100,69.24000;41.32000,69.26000;41.30000,69.27000&rooms_min=2",
    "deal=rent_daily&types=room&price_max=50",
    "city=not%20a%20code&deal=sale",
  ];
  const CASES = ["tashkent", "andijan"].flatMap((profile) =>
    ADDRESSES.flatMap((query) => [profile, "namangan", null].map((saved) => [query, profile, saved] as const)),
  );

  /** The browser's list key for the address `at()` set, before the session is known. */
  const browserKey = (profileCity: string | null | undefined) => {
    const { result } = renderHook(() => useScreenSearchState("feed", { profileCity }));
    return feedListKey(result.current.filters, result.current.sort);
  };

  it.each(CASES)("for %j with the profile city %s and the saved city %s, the server's page one has the key of both early renders", async (query, profile, saved) => {
    serveApi();
    state.profileCity = profile;
    state.me = null;
    at("/", query);

    const { initial, profileCity } = await readFirstPage(recordOf(query));
    const serverRender = browserKey(profileCity);
    if (saved !== null) {
      window.localStorage.setItem("homi-city", saved);
    }
    const hydration = browserKey(profileCity);

    expect(initial?.key).toBeDefined();
    expect(initial?.key).toBe(serverRender);
    expect(initial?.key).toBe(hydration);
  });

  it.each(["tashkent", "andijan"])("the server render of the screen shows the server's page one it was given (profile %s)", async (profile) => {
    serveApi();
    state.profileCity = profile;
    state.me = null;
    state.status = "booting";
    at("/", "");

    const props = await readFirstPage({});
    const html = renderToString(
      <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
        <FeedScreen {...props} />
      </NextIntlClientProvider>,
    );

    expect(html.includes('data-listing="')).toBe(props.initial !== null);
    expect(html.includes("data-card-skeleton")).toBe(props.initial === null);
  });

  it("the browser adopts the server's page one on its first render while the session boots, and asks for nothing", async () => {
    serveApi();
    const query = "districts=chilonzor&rooms_min=2&city=tashkent&sort=cheap&from=map";
    at("/", query);
    const props = await readFirstPage(recordOf(query));
    state.status = "booting";
    state.me = null;

    const view = screen(props);

    expect(cards()).toEqual(range(1, 20));
    expect(skeletons()).toBe(0);
    state.status = "ready";
    state.me = { city: "tashkent" };
    view.rerender();
    expect(cards()).toEqual(range(1, 20));
    expect(state.sent).toHaveLength(0);
  });

  it("a server read for another search is ignored: skeletons, then page one of 20 through /bff once the session is ready", async () => {
    at("/", "city=tashkent&deal=sale");
    state.status = "booting";
    const view = screen({ initial: { key: "city=tashkent|0", result: page([7]) } });

    expect(cards()).toEqual([]);
    expect(skeletons()).toBe(3);
    expect(state.sent).toHaveLength(0);

    state.status = "ready";
    view.rerender();
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].query.get("deal")).toBe("sale");
    expect(state.sent[0].query.get("limit")).toBe("20");
    expect(state.sent[0].query.has("cursor")).toBe(false);
  });
});

describe("FeedScreen: hydration of the server's HTML (D3, KI-43)", () => {
  /** Renders `element` to HTML as the server does, then hydrates it as the browser does, collecting any mismatch. */
  async function hydrate(element: ReactElement) {
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.append(container);
    const serverCards = container.querySelectorAll("article[data-listing]").length;
    const recoverable: string[] = [];
    let root: Root | undefined;
    await act(async () => {
      root = hydrateRoot(container, element, { onRecoverableError: (error) => void recoverable.push(String(error)) });
    });
    await act(async () => undefined);
    const result = {
      serverCards,
      cards: container.querySelectorAll("article[data-listing]").length,
      skeletons: container.querySelectorAll("[data-card-skeleton]").length,
      recoverable,
    };
    act(() => root?.unmount());
    container.remove();
    return result;
  }

  it.each([
    ["", "tashkent", "tashkent"],
    ["", "tashkent", "andijan"],
    ["", "andijan", "andijan"],
    ["", "andijan", null],
    ["deal=sale", "samarkand", "tashkent"],
    ["city=samarkand", "andijan", "andijan"],
  ] as const)("for %j with the profile city %s and the saved city %s, hydration keeps the server's cards", async (query, profile, saved) => {
    serveApi();
    state.profileCity = profile;
    state.status = "booting";
    state.me = null;
    at("/", query);
    if (saved !== null) {
      window.localStorage.setItem("homi-city", saved);
    }

    const result = await hydrate(intl(await readFirstPage(recordOf(query))));

    expect(result).toEqual({ serverCards: 20, cards: 20, skeletons: 0, recoverable: [] });
    expect(state.sent).toHaveLength(0);
  });

  it("without the cookie both renders show skeletons, whatever city the device saved", async () => {
    state.cookie = null;
    state.status = "booting";
    state.me = null;
    at("/", "");
    window.localStorage.setItem("homi-city", "andijan");

    const result = await hydrate(intl(await readFirstPage({})));

    expect(result).toEqual({ serverCards: 0, cards: 0, skeletons: 3, recoverable: [] });
  });

  it("hands the server's network rule to the photos of page one (BR-APP-059, D4)", () => {
    at("/", "city=tashkent");
    const html = (serverSmallOnly: boolean) => renderToString(intl({ initial: { key: "city=tashkent|0", result: page([1, 2]) }, serverSmallOnly }));

    expect(html(true)).toContain(".s.jpg?");
    expect(html(true)).not.toContain("srcSet=");
    expect(html(false)).toContain('srcSet="');
  });
});

describe("FeedScreen: a sign-in of this launch (WP-21, `renewed`)", () => {
  it("the server's page one read with the document's cookie is read again through /bff once the session is ready", async () => {
    at("/", "city=tashkent");
    state.status = "booting";
    state.me = null;
    const view = screen({ initial: { key: "city=tashkent|0", result: page([1, 2]) } });
    expect(cards()).toEqual([1, 2]);

    state.status = "ready";
    state.me = { city: "tashkent" };
    state.renewed = true;
    view.rerender();
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].query.has("cursor")).toBe(false);
    await answer(0, page([3]));
    expect(cards()).toEqual([3]);
  });

  it("a search changed after the sign-in adopts the server's page one, read with the new cookie", () => {
    at("/", "city=tashkent");
    state.renewed = true;
    const view = screen({ initial: { key: "city=tashkent|0", result: page([1]) } });

    at("/", "city=tashkent&deal=sale");
    view.rerender({ initial: { key: "city=tashkent&deal=sale|0", result: page([8, 9]) } });

    expect(cards()).toEqual([8, 9]);
    expect(state.sent).toHaveLength(0);
  });
});

describe("FeedScreen: pull-to-refresh (SCR-010)", () => {
  it("registers for the feed's address; a pull re-creates the list from page one and settles when it answers", async () => {
    at("/", "city=tashkent");
    screen({ initial: { key: "city=tashkent|0", result: page([1, 2, 3]) } });
    expect(cards()).toEqual([1, 2, 3]);
    expect(refreshHandlerFor("/")).toBeTypeOf("function");

    let settled = false;
    let refresh: Promise<unknown> | undefined;
    act(() => {
      refresh = pull()?.then(() => (settled = true));
    });

    expect(cards()).toEqual([]);
    expect(skeletons()).toBe(3);
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].query.has("cursor")).toBe(false);
    await act(async () => undefined);
    expect(settled).toBe(false);

    await answer(0, page([4, 5]));
    await refresh;
    expect(settled).toBe(true);
    expect(cards()).toEqual([4, 5]);
  });

  it("a failed page one settles the pull too, and a second pull asks again", async () => {
    at("/", "city=tashkent");
    screen({ initial: { key: "city=tashkent|0", result: page([1]) } });

    let first: Promise<unknown> | undefined;
    act(() => {
      first = pull();
    });
    await answer(0, { ok: false, error: "server", status: 500, method: "GET", path: "listings" });
    await expect(first).resolves.toBeUndefined();

    act(() => {
      void pull();
    });
    expect(state.sent).toHaveLength(2);
  });

  it("after a pull, a new search starts again at the server's version: its page one from the server is adopted", async () => {
    at("/", "city=tashkent");
    const view = screen({ initial: { key: "city=tashkent|0", result: page([1]) } });
    act(() => {
      void pull();
    });
    await answer(0, page([2]));

    at("/", "city=tashkent&rooms_min=2");
    view.rerender({ initial: { key: "city=tashkent&rooms_min=2|0", result: page([9]) } });

    expect(cards()).toEqual([9]);
    expect(state.sent).toHaveLength(1);
  });

  it("back on a search pulled before, the version is the server's again: its page one from the server is adopted", async () => {
    at("/", "city=tashkent");
    const view = screen({ initial: { key: "city=tashkent|0", result: page([1]) } });
    act(() => {
      void pull();
    });
    await answer(0, page([2]));

    at("/", "city=tashkent&rooms_min=2");
    view.rerender({ initial: { key: "city=tashkent&rooms_min=2|0", result: page([9]) } });
    at("/", "city=tashkent");
    view.rerender({ initial: { key: "city=tashkent|0", result: page([5]) } });

    expect(cards()).toEqual([5]);
    expect(state.sent).toHaveLength(1);
  });

  it("leaving the feed unregisters the handler and settles a pull that still waits", async () => {
    at("/", "city=tashkent");
    const view = screen({ initial: { key: "city=tashkent|0", result: page([1]) } });
    let refresh: Promise<unknown> | undefined;
    act(() => {
      refresh = pull();
    });

    view.unmount();

    await expect(refresh).resolves.toBeUndefined();
    expect(refreshHandlerFor("/")).toBeUndefined();
  });
});

describe("FeedScreen: the top of the list (SCR-007, KI-43)", () => {
  it("a new search scrolls to the top; the first render, a layer over the feed and the way back do not", async () => {
    at("/", "city=tashkent");
    const view = screen({ initial: { key: "city=tashkent|0", result: page([1, 2]) } });
    expect(scrolls).toEqual([]);

    at("/listing/42");
    view.rerender();
    at("/filters", "city=tashkent&rooms_min=3");
    view.rerender();
    expect(scrolls).toEqual([]);
    expect(state.sent).toHaveLength(0);
    expect(cards()).toEqual([1, 2]);

    at("/", "city=tashkent");
    view.rerender();
    expect(scrolls).toEqual([]);

    at("/", "city=tashkent&rooms_min=3");
    view.rerender();
    expect(scrolls).toEqual([[0, 0]]);
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].query.get("rooms_min")).toBe("3");
  });

  it("below a sheet loaded directly the feed follows the sheet's address but stays where it is", () => {
    at("/filters", "city=tashkent");
    const view = screen();

    at("/filters", "city=tashkent&rooms_min=3");
    view.rerender();

    expect(scrolls).toEqual([]);
  });

  it("a pull scrolls to the top as well", () => {
    at("/", "city=tashkent");
    screen({ initial: { key: "city=tashkent|0", result: page([1]) } });

    act(() => {
      void pull();
    });

    expect(scrolls).toEqual([[0, 0]]);
  });
});

describe("FeedScreen: what follows the cards (SCR-009)", () => {
  it("no result with an active filter shows the search empty state", async () => {
    feedReference({ stats: [{ code: "tashkent", counts: { rent_long: 3, rent_daily: 0, sale: 120 }, price_presets: {}, typical_price: {} }] });
    at("/", "city=tashkent&rooms_min=2");
    screen({ initial: { key: "city=tashkent&rooms_min=2|0", result: page([]) } });

    expect(document.querySelector("[data-empty='feed']")).not.toBeNull();
    expect(document.querySelector("[data-slot='few-note']")).toBeNull();
  });

  it("an ended list without filters shows the plain empty state until the city's stats arrive, then the note", () => {
    feedReference({ stats: null });
    at("/", "city=tashkent");
    screen({ initial: { key: "city=tashkent|0", result: page([]) } });
    expect(document.querySelector("[data-empty='feed']")).not.toBeNull();
    expect(document.querySelector("[data-empty-action='reset']")).not.toBeNull();
    expect(document.querySelector("[data-slot='few-note']")).toBeNull();

    act(() => feedReference({ stats: [{ code: "tashkent", counts: { rent_long: 0, rent_daily: 0, sale: 120 }, price_presets: {}, typical_price: {} }] }));

    expect(document.querySelector("[data-slot='few-note']")).not.toBeNull();
    expect(document.querySelector("[data-empty]")).toBeNull();
  });

  it("a short list without filters shows the few-results note with the city of the feed's own search", () => {
    feedReference({
      cities: [cityOf(), cityOf({ code: "samarkand", name: "Самарканд" })],
      stats: [{ code: "tashkent", counts: { rent_long: 3, rent_daily: 0, sale: 120 }, price_presets: {}, typical_price: {} }],
    });
    at("/", "city=tashkent");
    const view = screen({ initial: { key: "city=tashkent|0", result: page([1, 2, 3]) } });

    expect(document.querySelector("[data-slot='few-note']")?.textContent).toContain("Ташкент");

    at("/filters", "city=samarkand");
    view.rerender();
    expect(document.querySelector("[data-slot='few-note']")?.textContent).toContain("Ташкент");
  });
});

describe("FeedScreen: the scroll measurement of lite graphics (03 §1.7)", () => {
  it("starts once per launch, on the first scroll of the feed", () => {
    at("/", "city=tashkent");
    const first = screen({ initial: { key: "city=tashkent|0", result: page([1]) } });
    expect(state.measure).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("scroll"));
    first.unmount();
    screen({ initial: { key: "city=tashkent|0", result: page([1]) } });
    window.dispatchEvent(new Event("scroll"));

    expect(state.measure).toHaveBeenCalledTimes(1);
  });
});
