import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { type ComponentProps, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ListingPreview } from "@/features/feed/types";
import type { Selection } from "@/features/map/types";
import type { BffOptions } from "@/lib/api/browser";
import type { ApiResult } from "@/lib/api/types";
import type { DevFlags } from "@/lib/flags";

type Answer = ApiResult<ListingPreview>;

/** One `bffFetch` the card sent; the test answers it when it wants. */
interface Sent {
  path: string;
  query: BffOptions["query"];
  signal: AbortSignal | undefined;
  resolve: (answer: Answer) => void;
}

const state = vi.hoisted(() => ({
  sent: [] as Sent[],
  /** Subscribers of the fake address: the router, `pushState` and `popstate` tell them. */
  listeners: new Set<() => void>(),
}));
vi.mock("@/lib/api/browser", () => ({
  bffFetch: (path: string, options: BffOptions) =>
    new Promise<Answer>((resolve) => {
      state.sent.push({ path, query: options.query, signal: options.signal, resolve });
    }),
}));
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: vi.fn(), reauthenticate: vi.fn() }));
vi.mock("@/lib/actions/favorites", () => ({ setFavorite: vi.fn() }));
/** The App Router's address as hooks see it: `window.location`, re-read whenever it moves. */
vi.mock("next/navigation", async () => {
  const { useMemo, useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => {
    state.listeners.add(listener);
    window.addEventListener("popstate", listener);
    return () => {
      state.listeners.delete(listener);
      window.removeEventListener("popstate", listener);
    };
  };
  return {
    useSearchParams: () => {
      const search = useSyncExternalStore(subscribe, () => window.location.search, () => "");
      return useMemo(() => new URLSearchParams(search), [search]);
    },
  };
});
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => {
    const [, first, ...rest] = window.location.pathname.split("/");
    return ["ru", "uz", "en"].includes(first) ? `/${rest.join("/")}` : window.location.pathname;
  },
  /** The counted `Link` needs the App Router: a plain anchor that never navigates. */
  Link: ({ href, prefetch, scroll, onClick, ...props }: ComponentProps<"a"> & { href: string; prefetch?: boolean; scroll?: boolean }) => (
    <a
      {...props}
      href={href}
      data-prefetch={String(prefetch)}
      data-scroll={String(scroll)}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
    />
  ),
}));

import { useSearchParams } from "next/navigation";

import { resetPendingFavorites } from "@/features/feed/FavButton";
import { MapSelectionCard } from "@/features/map/MapSelectionCard";
import { useCardLayer } from "@/features/map/useCardLayer";
import { usePathname } from "@/i18n/navigation";
import { failureOf } from "@/lib/api/errors";
import { getPreview, resetPreviews } from "@/lib/data/previewCache";
import { isSeen, resetSessionMaps } from "@/lib/data/sessionMaps";
import { resetResources } from "@/lib/data/useResource";
import { closeThen } from "@/lib/navigation/closeThen";
import { depth, resetDepth } from "@/lib/navigation/history";
import { bindRouter, nav } from "@/lib/navigation/nav";
import { useBack } from "@/lib/navigation/useBack";

import { withDevFlags } from "../helpers/flags";
import { previewOf } from "../helpers/listing";

const tellAddress = () => {
  for (const listener of state.listeners) {
    listener();
  }
};

/** A router that moves `window.history` the way the App Router does, with the locale prefix. */
const router = {
  push: vi.fn((href: string) => {
    window.history.pushState(null, "", `/ru${href === "/" ? "" : href}`);
    tellAddress();
  }),
  replace: vi.fn((href: string) => {
    window.history.replaceState(null, "", `/ru${href === "/" ? "" : href}`);
    tellAddress();
  }),
  back: vi.fn(() => window.history.back()),
};

const STACK = [100001, 100002, 100003, 100004, 100005, 100006, 100007];
const STEP = 320;

/** The search of the map's own address (`pin` is not part of it); `null` while a sheet or a listing covers the map. */
function useMapSearch(): string | null {
  const params = useSearchParams();
  const pathname = usePathname();
  if (pathname !== "/map") {
    return null;
  }
  const search = new URLSearchParams(params);
  search.delete("pin");
  return search.toString();
}

/**
 * The card as `MapScreen` drives it: the selection is its state, a swipe moves `at`, × and Back close it, and another
 * search on the map's own address closes it while rendering. The Back of the shell is in `data-test-can-go-back`.
 */
function Card({
  initial,
  onIndex,
  onClose,
  flags,
}: {
  initial: Selection;
  onIndex?: (at: number) => void;
  onClose?: () => void;
  flags?: DevFlags;
}) {
  const [selection, setSelection] = useState<Selection>(initial);
  const search = useMapSearch();
  const [openFor, setOpenFor] = useState(search);
  if (search !== null && search !== openFor) {
    setOpenFor(search);
    setSelection(null);
  }
  const close = () => {
    onClose?.();
    setSelection(null);
  };
  useCardLayer(selection, close, flags);
  const { canGoBack } = useBack();
  return (
    <>
      <output data-test-can-go-back={String(canGoBack)} />
      <button type="button" data-test-open="" onClick={() => setSelection({ numbers: [100001], at: 0 })}>
        open
      </button>
      <button type="button" data-test-spread="" onClick={() => setSelection((current) => current && { ...current, at: 4 })}>
        spread
      </button>
      <button type="button" data-test-other="" onClick={() => setSelection({ numbers: [200001, 200002, 200003], at: 0 })}>
        other
      </button>
      {selection ? (
        <MapSelectionCard
          selection={selection}
          onIndex={(at) => {
            onIndex?.(at);
            setSelection((current) => current && { ...current, at });
          }}
          onClose={close}
        />
      ) : null}
    </>
  );
}

function renderCard(props: ComponentProps<typeof Card>, locale: Locale = "ru") {
  return render(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
      <Card {...props} />
    </NextIntlClientProvider>,
  );
}

const card = () => document.querySelector<HTMLElement>("[data-map-card]");
const header = () => document.querySelector("[data-map-card-header]")?.textContent ?? null;
const track = () => document.querySelector<HTMLElement>("[data-map-card] [data-scroll-x]")!;
const statuses = () =>
  [...document.querySelectorAll<HTMLElement>("[data-map-card-slot]")].map((element) => element.dataset.status ?? "empty");
const listings = () => [...document.querySelectorAll<HTMLElement>("article[data-listing]")].map((element) => Number(element.dataset.listing));
const asked = () => state.sent.map((sent) => Number(sent.path.replace("listings/", "")));
const pending = (number: number) => state.sent.findLast((sent) => sent.path === `listings/${number}`)!;
const answer = (number: number, value: Answer = { ok: true, data: previewOf({ number }), meta: { source: "stub" } }) =>
  act(async () => pending(number).resolve(value));
const here = () => window.location.pathname + window.location.search;
const canGoBack = () => document.querySelector<HTMLElement>("[data-test-can-go-back]")?.dataset.testCanGoBack ?? null;
const popped = () => new Promise<void>((resolve) => window.addEventListener("popstate", () => resolve(), { once: true }));

let fake: FakeTelegram | null = null;
const haptics = () =>
  (fake?.calls ?? []).filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);

/**
 * Lays every track out as a browser would: slot `i` starts at `i · STEP` (plus the track's padding) and each element
 * keeps the `scrollLeft` written to it. jsdom has no layout.
 */
const offsetLeft = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetLeft")!;
let scrolled = new WeakMap<Element, number>();
function layOut() {
  Object.defineProperty(HTMLElement.prototype, "offsetLeft", {
    configurable: true,
    get(this: HTMLElement) {
      const index = this.dataset.mapCardSlot;
      return index === undefined ? 0 : 24 + Number(index) * STEP;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollLeft", {
    configurable: true,
    get(this: HTMLElement) {
      return scrolled.get(this) ?? 0;
    },
    set(this: HTMLElement, value: number) {
      scrolled.set(this, value);
    },
  });
}

/** The user's swipe: the track scrolled to `left` and its `scroll` event. */
function swipe(left: number) {
  const element = track();
  act(() => {
    element.scrollLeft = left;
    fireEvent.scroll(element);
  });
}

beforeEach(() => {
  state.sent.length = 0;
  window.history.replaceState(null, "", "/ru/map?city=tashkent");
  resetDepth("/map?city=tashkent");
  bindRouter(router);
  for (const method of [router.push, router.replace, router.back]) {
    method.mockClear();
  }
  const pushState = History.prototype.pushState;
  vi.spyOn(History.prototype, "pushState").mockImplementation(function (this: History, ...args: Parameters<History["pushState"]>) {
    pushState.apply(this, args);
    tellAddress();
  });
  scrolled = new WeakMap();
  layOut();
  fake = fakeTelegram({ version: "8.0" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(HTMLElement.prototype, "offsetLeft", offsetLeft);
  delete (HTMLElement.prototype as { scrollLeft?: number }).scrollLeft;
  fake?.uninstall();
  fake = null;
  resetResources();
  resetSessionMaps();
  resetPreviews();
  resetPendingFavorites();
});

describe("MapSelectionCard: one listing (SCR-013)", () => {
  it("reads the preview form of the listing, spins in its slot, then shows the compact card and a ×", async () => {
    const onClose = vi.fn();
    renderCard({ initial: { numbers: [100001], at: 0 }, onClose });

    expect(state.sent.map(({ path, query }) => [path, query])).toEqual([["listings/100001", { preview: 1 }]]);
    expect(statuses()).toEqual(["loading"]);
    expect(screen.getByRole("status", { name: "Загрузка…" })).toBeTruthy();
    expect(document.querySelector("[data-map-card-header]")).toBeNull();
    expect(document.querySelector("[data-map-card] [data-scroll-x]")).toBeNull();

    await answer(100001);

    expect(statuses()).toEqual(["success"]);
    expect(listings()).toEqual([100001]);
    const article = document.querySelector("article[data-listing]")!;
    expect(article.hasAttribute("data-card")).toBe(false);
    expect(article.querySelectorAll("img").length).toBeLessThanOrEqual(1);
    expect(article.querySelector("[data-badge]")).toBeNull();
    expect(article.querySelector("[data-viewed]")).toBeNull();
    expect(article.querySelector("[data-fav]")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(card()).toBeNull();
  });

  it("is a glass card of the column above the tab bar, at the card's layer", () => {
    renderCard({ initial: { numbers: [100001], at: 0 } });
    const frame = card()!;
    expect(frame.className).toMatch(/(?:^|\s)z-\(--z-map-card\)(?:\s|$)/);
    expect(frame.className).toContain("max-w-(--feed-max)");
    expect(frame.className).toContain("bottom-[calc(var(--tabbar-h)+var(--bottom-inset)+20px)]");
    expect(frame.querySelector(".glass.animate-rise-in")).not.toBeNull();
  });

  it("a tap on the card marks the listing seen and seeds the preview for the listing screen", async () => {
    renderCard({ initial: { numbers: [100001], at: 0 } });
    await answer(100001);

    fireEvent.click(document.querySelector("article a")!);

    expect(isSeen(100001, false)).toBe(true);
    expect(getPreview(100001)?.number).toBe(100001);
  });

  it("a merged duplicate answers with another number and still renders the card", async () => {
    renderCard({ initial: { numbers: [100005], at: 0 } });

    await answer(100005, { ok: true, data: previewOf({ number: 100002 }), meta: { source: "stub" } });

    expect(statuses()).toEqual(["success"]);
    expect(listings()).toEqual([100002]);
  });

  it("a failed preview shows «Не загрузилось — повторить», which reads that slot again (LB-APP-017)", async () => {
    renderCard({ initial: { numbers: [100001], at: 0 } });

    await answer(100001, failureOf({ method: "GET", path: "listings/:number" }, { status: 500 }));

    expect(statuses()).toEqual(["error"]);
    expect(listings()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Не загрузилось — повторить" }));

    expect(asked()).toEqual([100001, 100001]);
    expect(statuses()).toEqual(["loading"]);

    await answer(100001);
    expect(statuses()).toEqual(["success"]);
    expect(listings()).toEqual([100001]);
  });

  it.each([
    ["uz", "Yuklanmadi — takrorlash", "Yopish"],
    ["en", "Couldn’t load — retry", "Close"],
  ] as const)("speaks %s", async (locale, retry, close) => {
    renderCard({ initial: { numbers: [100001], at: 0 } }, locale);
    await answer(100001, failureOf({ method: "GET", path: "listings/:number" }, "offline"));

    expect(screen.getByRole("button", { name: retry })).toBeTruthy();
    expect(screen.getByRole("button", { name: close })).toBeTruthy();
  });
});

describe("MapSelectionCard: a stack (SCR-013)", () => {
  it("shows «{n} из {total}», the ×, one slot per listing and content only next to the shown one", () => {
    renderCard({ initial: { numbers: STACK.slice(0, 3), at: 0 } });

    expect(header()).toBe("1 из 3");
    expect(screen.getByRole("button", { name: "Закрыть" })).toBeTruthy();
    expect(statuses()).toEqual(["loading", "loading", "empty"]);
    expect(track().className).toContain("snap-x");
  });

  it("a 7-listing stack reads 0 and 1, then 2, 3 and 4 after a swipe to 3, and nothing twice", async () => {
    const onIndex = vi.fn();
    renderCard({ initial: { numbers: STACK, at: 0 }, onIndex });

    expect(asked()).toEqual([100001, 100002]);
    await answer(100001);
    await answer(100002);

    swipe(3 * STEP);

    expect(onIndex.mock.calls).toEqual([[3]]);
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
    expect(header()).toBe("4 из 7");
    expect(asked()).toEqual([100001, 100002, 100003, 100004, 100005]);
    expect(statuses()).toEqual(["empty", "empty", "loading", "loading", "loading", "empty", "empty"]);
    for (const number of [100003, 100004, 100005]) {
      await answer(number);
    }

    swipe(1 * STEP);

    expect(header()).toBe("2 из 7");
    expect(statuses()).toEqual(["success", "success", "success", "empty", "empty", "empty", "empty"]);
    expect(asked()).toEqual([100001, 100002, 100003, 100004, 100005]);
  });

  it("a scroll that stays on the slot neither reports nor vibrates", () => {
    const onIndex = vi.fn();
    renderCard({ initial: { numbers: STACK, at: 0 }, onIndex });

    swipe(0.4 * STEP);
    swipe(0);

    expect(onIndex).not.toHaveBeenCalled();
    expect(haptics()).toEqual([]);
  });

  it("each slot a swipe passes plays one light haptic", () => {
    const onIndex = vi.fn();
    renderCard({ initial: { numbers: STACK, at: 0 }, onIndex });

    swipe(0.6 * STEP);
    swipe(1.4 * STEP);
    swipe(2 * STEP);

    expect(onIndex.mock.calls).toEqual([[1], [2]]);
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)", "HapticFeedback.impactOccurred(light)"]);
  });

  it("a failed slot retries alone", async () => {
    renderCard({ initial: { numbers: STACK.slice(0, 3), at: 0 } });
    await answer(100001);
    await answer(100002, failureOf({ method: "GET", path: "listings/:number" }, { status: 503, code: "source_unavailable" }));

    expect(statuses()).toEqual(["success", "error", "empty"]);
    fireEvent.click(screen.getByRole("button", { name: "Не загрузилось — повторить" }));

    expect(asked()).toEqual([100001, 100002, 100002]);
    await answer(100002);
    expect(statuses()).toEqual(["success", "success", "empty"]);
  });

  it("an index from outside (a spread pin) scrolls the track there without a report", async () => {
    const onIndex = vi.fn();
    renderCard({ initial: { numbers: STACK, at: 0 }, onIndex });

    fireEvent.click(document.querySelector("[data-test-spread]")!);

    expect(track().scrollLeft).toBe(4 * STEP);
    expect(header()).toBe("5 из 7");
    expect(asked()).toEqual([100001, 100002, 100004, 100005, 100006]);

    // The browser's scroll event for that move.
    swipe(4 * STEP);
    expect(onIndex).not.toHaveBeenCalled();
    expect(haptics()).toEqual([]);
  });

  it("new numbers start a new track at the first slot", () => {
    const onIndex = vi.fn();
    renderCard({ initial: { numbers: STACK, at: 0 }, onIndex });
    swipe(3 * STEP);
    const before = track();

    fireEvent.click(document.querySelector("[data-test-other]")!);

    expect(track()).not.toBe(before);
    expect(track().scrollLeft).toBe(0);
    expect(header()).toBe("1 из 3");
    expect(statuses()).toEqual(["loading", "loading", "empty"]);
    expect(onIndex.mock.calls).toEqual([[3]]);
  });

  it("closing the card aborts the reads still pending", () => {
    renderCard({ initial: { numbers: STACK, at: 0 } });

    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));

    expect(state.sent.map((sent) => sent.signal?.aborted)).toEqual([true, true]);
  });
});

describe("DEV-013 'Back closes the map card' (LB-APP-024)", () => {
  it("off (legacy): the card is not a history layer, and a pin in a direct load stays", async () => {
    await withDevFlags({}, async (flags) => {
      renderCard({ initial: null, flags });
      fireEvent.click(document.querySelector("[data-test-open]")!);

      expect(card()).not.toBeNull();
      expect(here()).toBe("/ru/map?city=tashkent");
      expect(depth()).toBe(0);

      const back = popped();
      act(() => window.dispatchEvent(new PopStateEvent("popstate")));
      await back;
      expect(card()).not.toBeNull();
      cleanup();

      window.history.replaceState(null, "", "/ru/map?city=tashkent&pin=100005");
      renderCard({ initial: null, flags });
      expect(router.replace).not.toHaveBeenCalled();
      expect(here()).toBe("/ru/map?city=tashkent&pin=100005");
    });
  });

  it("on: opening pushes pin=<first number>, and Back closes the card", async () => {
    await withDevFlags({ dev013BackClosesMapCard: true }, async (flags) => {
      const onClose = vi.fn();
      renderCard({ initial: null, flags, onClose });

      fireEvent.click(document.querySelector("[data-test-open]")!);

      expect(here()).toBe("/ru/map?city=tashkent&pin=100001");
      expect(depth()).toBe(1);
      expect(card()).not.toBeNull();

      const back = popped();
      await act(async () => {
        nav.back();
        await back;
      });

      expect(card()).toBeNull();
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(here()).toBe("/ru/map?city=tashkent");
      expect(depth()).toBe(0);
    });
  });

  it("on: a stack pushes its first number once, swiping pushes nothing", async () => {
    await withDevFlags({ dev013BackClosesMapCard: true }, async (flags) => {
      renderCard({ initial: { numbers: STACK, at: 0 }, flags });

      expect(here()).toBe("/ru/map?city=tashkent&pin=100001");
      swipe(2 * STEP);
      fireEvent.click(document.querySelector("[data-test-spread]")!);

      expect(header()).toBe("5 из 7");
      expect(depth()).toBe(1);
      expect(History.prototype.pushState).toHaveBeenCalledTimes(1);
    });
  });

  it("on: the × pops the layer it pushed", async () => {
    await withDevFlags({ dev013BackClosesMapCard: true }, async (flags) => {
      renderCard({ initial: { numbers: [100001], at: 0 }, flags });
      expect(here()).toBe("/ru/map?city=tashkent&pin=100001");

      const back = popped();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
        await back;
      });

      expect(card()).toBeNull();
      expect(router.back).toHaveBeenCalledTimes(1);
      expect(here()).toBe("/ru/map?city=tashkent");
      expect(depth()).toBe(0);
    });
  });

  it("on: a listing opened from the card covers the map and the card is still there on return", async () => {
    await withDevFlags({ dev013BackClosesMapCard: true }, async (flags) => {
      renderCard({ initial: { numbers: [100001], at: 0 }, flags });

      act(() => nav.push("/listing/100001"));
      expect(card()).not.toBeNull();

      const back = popped();
      await act(async () => {
        nav.back();
        await back;
      });

      expect(here()).toBe("/ru/map?city=tashkent&pin=100001");
      expect(card()).not.toBeNull();
      expect(depth()).toBe(1);
    });
  });

  it("on: the deal switch under the card steps back over the pin entry, so the root map tab has no Back", async () => {
    await withDevFlags({ dev013BackClosesMapCard: true }, async (flags) => {
      renderCard({ initial: { numbers: [100001], at: 0 }, flags });
      expect(depth()).toBe(1);
      expect(canGoBack()).toBe("true");

      // `useSearchState().write` of the map bar: the search keys replaced, every other parameter (`pin`) kept.
      act(() => nav.replace("/map?city=tashkent&deal=sale&pin=100001"));

      await waitFor(() => {
        expect(here()).toBe("/ru/map?city=tashkent&deal=sale");
        expect(depth()).toBe(0);
      });
      expect(card()).toBeNull();
      expect(canGoBack()).toBe("false");
      expect(router.back).toHaveBeenCalledTimes(1);
      expect(router.replace.mock.calls.at(-1)).toEqual(["/map?city=tashkent&deal=sale", { scroll: false }]);
    });
  });

  it.each([
    ["another search", "/map?city=tashkent&deal=sale"],
    ["the same search", "/map?city=tashkent"],
  ])("on: «Показать» of the filters sheet over the card with %s steps back over the pin entry too", async (_, applied) => {
    await withDevFlags({ dev013BackClosesMapCard: true }, async (flags) => {
      renderCard({ initial: { numbers: [100001], at: 0 }, flags });
      act(() => nav.push("/filters?city=tashkent&from=map"));
      expect(depth()).toBe(2);

      // `applyFilters`: back to the map with the card, then a replace with the search keys only (no `pin`).
      const back = popped();
      await act(async () => {
        void closeThen(applied);
        await back;
      });

      await waitFor(() => {
        expect(here()).toBe(`/ru${applied}`);
        expect(depth()).toBe(0);
      });
      expect(card()).toBeNull();
      expect(canGoBack()).toBe("false");
      expect(router.back).toHaveBeenCalledTimes(2);
      expect(router.replace.mock.calls.at(-1)).toEqual([applied, { scroll: false }]);
    });
  });

  it("on: the lasso over the card closes it, and the Back that closes `draw=1` pops the pin entry, so the root map tab has no Back", async () => {
    await withDevFlags({ dev013BackClosesMapCard: true }, async (flags) => {
      renderCard({ initial: { numbers: [100001], at: 0 }, flags });
      expect(depth()).toBe(1);

      // `TopBar` starts drawing: a push of the map's search with `draw=1` (its `href` drops `pin`), which closes the card.
      act(() => nav.push("/map?city=tashkent&draw=1"));
      expect(card()).toBeNull();
      expect(depth()).toBe(2);

      // `MapScreen` closes the `draw=1` layer at once with Back (WP-28 draws there); it lands on the pin entry.
      const back = popped();
      await act(async () => {
        nav.back();
        await back;
      });

      await waitFor(() => {
        expect(here()).toBe("/ru/map?city=tashkent");
        expect(depth()).toBe(0);
      });
      expect(canGoBack()).toBe("false");
      expect(card()).toBeNull();
      expect(router.back).toHaveBeenCalledTimes(2);
      expect(router.replace).not.toHaveBeenCalled();
    });
  });

  it("on: a pin tap while that Back is on its way sends no second Back and pushes the new card's layer once it lands", async () => {
    await withDevFlags({ dev013BackClosesMapCard: true }, async (flags) => {
      renderCard({ initial: { numbers: [100001], at: 0 }, flags });
      act(() => nav.push("/map?city=tashkent&draw=1"));
      const back = popped();
      await act(async () => {
        nav.back();
        await back;
      });
      // The hook's Back over the pin entry has been sent and has not landed yet.
      expect(router.back).toHaveBeenCalledTimes(2);
      expect(here()).toBe("/ru/map?city=tashkent&pin=100001");

      const landed = popped();
      fireEvent.click(document.querySelector("[data-test-open]")!);
      await act(async () => {
        await landed;
      });

      expect(router.back).toHaveBeenCalledTimes(2);
      expect(router.replace).not.toHaveBeenCalled();
      expect(here()).toBe("/ru/map?city=tashkent&pin=100001");
      expect(depth()).toBe(1);
      expect(card()).not.toBeNull();
      expect(History.prototype.pushState).toHaveBeenCalledTimes(3);
    });
  });

  it("off (legacy): the deal switch and «Показать» under the card leave the map tab without a Back", async () => {
    await withDevFlags({}, async (flags) => {
      renderCard({ initial: { numbers: [100001], at: 0 }, flags });

      act(() => nav.replace("/map?city=tashkent&deal=sale"));

      expect(card()).toBeNull();
      expect(depth()).toBe(0);
      expect(router.back).not.toHaveBeenCalled();

      fireEvent.click(document.querySelector("[data-test-open]")!);
      act(() => nav.push("/filters?city=tashkent&deal=sale&from=map"));
      const back = popped();
      await act(async () => {
        void closeThen("/map?city=tashkent");
        await back;
      });

      expect(here()).toBe("/ru/map?city=tashkent");
      expect(depth()).toBe(0);
      expect(canGoBack()).toBe("false");
      expect(card()).toBeNull();
      expect(router.back).toHaveBeenCalledTimes(1);
      expect(router.replace.mock.calls).toEqual([
        ["/map?city=tashkent&deal=sale", { scroll: false }],
        ["/map?city=tashkent", { scroll: false }],
      ]);
    });
  });

  it("on: a direct load with pin drops the parameter with a replace", async () => {
    await withDevFlags({ dev013BackClosesMapCard: true }, async (flags) => {
      window.history.replaceState(null, "", "/ru/map?city=tashkent&pin=100005");
      renderCard({ initial: null, flags });

      expect(router.replace.mock.calls).toEqual([["/map?city=tashkent", { scroll: false }]]);
      expect(here()).toBe("/ru/map?city=tashkent");
      expect(card()).toBeNull();
    });
  });
});
