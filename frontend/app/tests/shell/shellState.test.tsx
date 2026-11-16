import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ShellState = typeof import("@/lib/ui/shellState");

/** A fresh module store per test: the state lives for the launch. */
let store: ShellState;

beforeEach(async () => {
  vi.resetModules();
  store = await import("@/lib/ui/shellState");
});

afterEach(cleanup);

describe("last addresses of the search and saved tabs", () => {
  it("start at the feed and the favourites", () => {
    expect(store.lastSearchHref()).toBe("/");
    expect(store.lastSavedHref()).toBe("/saved");
    expect(store.lastSearchQuery().toString()).toBe("");
  });

  it("keep the last list or map address with its filter keys and sort", () => {
    store.rememberHref("/", "city=tashkent&deal=sale&sort=cheap");
    expect(store.lastSearchHref()).toBe("/?city=tashkent&deal=sale&sort=cheap");

    store.rememberHref("/map", "?city=tashkent&districts=1&districts=2");
    expect(store.lastSearchHref()).toBe("/map?city=tashkent&districts=1&districts=2");

    store.rememberHref("/map/", new URLSearchParams("polygon=1,2"));
    expect(store.lastSearchHref()).toBe("/map?polygon=1%2C2");
  });

  it("drop layers, a sheet's origin and foreign parameters", () => {
    store.rememberHref("/map", "draw=1&pin=5&from=map&city=x&listing=42&utm_source=tg");
    expect(store.lastSearchHref()).toBe("/map?city=x");
    expect(store.lastSearchQuery().toString()).toBe("city=x");

    store.rememberHref("/", "news=pets");
    expect(store.lastSearchHref()).toBe("/");
  });

  it("keep the favourites or the history, whichever was shown last", () => {
    store.rememberHref("/saved/history", "");
    expect(store.lastSavedHref()).toBe("/saved/history");
    store.rememberHref("/saved", "x=1");
    expect(store.lastSavedHref()).toBe("/saved");
  });

  it("are left alone by every other address", () => {
    store.rememberHref("/", "city=x");
    store.rememberHref("/saved/history", "");
    for (const pathname of ["/filters", "/sort", "/city", "/listing/42", "/radars", "/settings/theme", "/welcome/city", "/x"]) {
      store.rememberHref(pathname, "city=y");
    }
    expect(store.lastSearchHref()).toBe("/?city=x");
    expect(store.lastSavedHref()).toBe("/saved/history");
  });
});

describe("area too small", () => {
  function Probe() {
    return <output>{String(store.useAreaTooSmall())}</output>;
  }

  it("is false until the lasso says so, and re-renders its readers", () => {
    const view = render(<Probe />);
    expect(store.areaTooSmall()).toBe(false);
    expect(view.container.textContent).toBe("false");

    act(() => store.setAreaTooSmall(true));
    expect(store.areaTooSmall()).toBe(true);
    expect(view.container.textContent).toBe("true");

    act(() => store.setAreaTooSmall(false));
    expect(view.container.textContent).toBe("false");
  });
});

describe("refresh handlers", () => {
  const handler = () => vi.fn(() => Promise.resolve());

  it("answer for their address only, whatever its trailing slash", () => {
    const feed = handler();
    const unregister = store.registerRefresh("/", feed);
    expect(store.refreshHandlerFor("/")).toBe(feed);
    expect(store.refreshHandlerFor("/saved")).toBeUndefined();

    const saved = handler();
    store.registerRefresh("/saved/", saved);
    expect(store.refreshHandlerFor("/saved")).toBe(saved);

    unregister();
    expect(store.refreshHandlerFor("/")).toBeUndefined();
    expect(store.refreshHandlerFor("/saved")).toBe(saved);
  });

  it("answer with the last registration; removing one leaves the others", () => {
    const first = handler();
    const second = handler();
    const removeFirst = store.registerRefresh("/", first);
    const removeSecond = store.registerRefresh("/", second);
    expect(store.refreshHandlerFor("/")).toBe(second);

    removeSecond();
    expect(store.refreshHandlerFor("/")).toBe(first);
    removeSecond();
    expect(store.refreshHandlerFor("/")).toBe(first);
    removeFirst();
    expect(store.refreshHandlerFor("/")).toBeUndefined();
  });

  it("re-render a reader when a handler arrives late or leaves", () => {
    function Probe() {
      return <output>{store.useRefreshHandler("/") ? "yes" : "no"}</output>;
    }
    const view = render(<Probe />);
    expect(view.container.textContent).toBe("no");

    let unregister = () => {};
    act(() => {
      unregister = store.registerRefresh("/", handler());
    });
    expect(view.container.textContent).toBe("yes");

    act(() => unregister());
    expect(view.container.textContent).toBe("no");
  });
});

describe("draw request", () => {
  it("is consumed once", () => {
    expect(store.consumeDrawRequest()).toBe(false);
    store.requestDraw();
    store.requestDraw();
    expect(store.consumeDrawRequest()).toBe(true);
    expect(store.consumeDrawRequest()).toBe(false);
  });
});
