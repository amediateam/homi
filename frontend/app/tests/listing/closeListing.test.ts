import { defaultFilters, toSearchParams } from "@homi/search";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A router that moves `window.history` the way the App Router does, with the locale prefix. */
const router = {
  push: vi.fn((href: string) => window.history.pushState(null, "", `/ru${href === "/" ? "" : href}`)),
  replace: vi.fn((href: string) => window.history.replaceState(null, "", `/ru${href === "/" ? "" : href}`)),
  back: vi.fn(() => window.history.back()),
};

/** A launch at `address`: a fresh history stack (module state) bound to the router above. */
async function fresh(address: string) {
  window.history.replaceState(null, "", address);
  vi.resetModules();
  const history = await import("@/lib/navigation/history");
  const { nav, bindRouter } = await import("@/lib/navigation/nav");
  const close = await import("@/features/listing/closeListing");
  bindRouter(router);
  return { history, nav, ...close };
}

const here = () => window.location.pathname + window.location.search;

/** A step layer as `useLayerState("step").open` pushes it: shallow, beside the router. */
function openStep(history: Awaited<ReturnType<typeof fresh>>["history"], step: string) {
  history.stack();
  const url = new URL(window.location.href);
  url.searchParams.set("step", step);
  window.history.pushState(null, "", url.pathname + url.search);
  history.pushEntry(url.pathname + url.search);
}

beforeEach(() => {
  for (const method of [router.push, router.replace, router.back]) {
    method.mockClear();
  }
});

describe("stepLayersOf", () => {
  it("counts the entries the steps pushed: none on the menu, one for report, two for detail, one for any other value", async () => {
    const { stepLayersOf } = await fresh("/ru");
    expect(stepLayersOf(null)).toBe(0);
    expect(stepLayersOf("report")).toBe(1);
    expect(stepLayersOf("detail")).toBe(2);
    expect(stepLayersOf("menu")).toBe(1);
    expect(stepLayersOf("")).toBe(1);
  });
});

describe("closeActions", () => {
  it("from the menu: one step back to the listing, no replace", async () => {
    const { nav, history, closeActions } = await fresh("/ru");
    nav.push("/listing/100001");
    nav.push("/listing/100001/actions");
    const length = window.history.length;

    await closeActions(100001, null);

    expect(here()).toBe("/ru/listing/100001");
    expect(history.depth()).toBe(1);
    expect(router.replace).not.toHaveBeenCalled();
    expect(window.history.length).toBe(length);
  });

  it("from the detail step: the two step layers and the sheet at once", async () => {
    const { nav, history, closeActions } = await fresh("/ru");
    nav.push("/listing/100001");
    nav.push("/listing/100001/actions");
    openStep(history, "report");
    openStep(history, "detail");

    await closeActions(100001, "detail");

    expect(here()).toBe("/ru/listing/100001");
    expect(history.depth()).toBe(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("a direct load of the sheet (depth 0) replaces the address with the listing", async () => {
    const { closeActions, history } = await fresh("/ru/listing/100001/actions");

    await closeActions(100001, null);

    expect(router.replace).toHaveBeenCalledWith("/listing/100001", { scroll: false });
    expect(here()).toBe("/ru/listing/100001");
    expect(history.depth()).toBe(0);
  });

  it("a direct load of a step takes what it can, then replaces with the listing", async () => {
    const { closeActions, history } = await fresh("/ru/listing/100001/actions");
    openStep(history, "report");

    await closeActions(100001, "report");

    expect(router.replace).toHaveBeenCalledWith("/listing/100001", { scroll: false });
    expect(here()).toBe("/ru/listing/100001");
  });
});

/** The next `popstate` (a `history.back()` lands asynchronously). */
const popped = () => new Promise<void>((resolve) => window.addEventListener("popstate", () => resolve(), { once: true }));

describe("leaveListingRoute (WP-36)", () => {
  it("steps back once when the app pushed a page below the listing", async () => {
    const { nav, history, leaveListingRoute } = await fresh("/ru/saved");
    nav.push("/listing/100001");
    const landed = popped();

    expect(leaveListingRoute(100001)).toBe("back");
    await landed;

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(here()).toBe("/ru/saved");
    expect(history.depth()).toBe(0);
  });

  it("replaces a listing loaded directly (depth 0) with the feed", async () => {
    const { leaveListingRoute } = await fresh("/ru/listing/100001");

    expect(leaveListingRoute(100001)).toBe("replace");

    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/", { scroll: false });
    expect(here()).toBe("/ru");
  });
});

describe("listingLeavePlays (WP-36)", () => {
  it("plays outside lite graphics and without reduced motion", async () => {
    const { listingLeavePlays } = await fresh("/ru");
    expect(listingLeavePlays()).toBe(true);
  });

  it("not in lite graphics", async () => {
    const { listingLeavePlays } = await fresh("/ru");
    document.documentElement.classList.add("lite");
    try {
      expect(listingLeavePlays()).toBe(false);
    } finally {
      document.documentElement.classList.remove("lite");
    }
  });

  it("not under reduced motion", async () => {
    const { listingLeavePlays } = await fresh("/ru");
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }) as MediaQueryList);
    try {
      expect(listingLeavePlays()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("closeListing", () => {
  /**
   * The layer's close as it ends after its leave: the route change, checked to run at the listing's own address.
   * `landed` resolves on the `popstate` of that change (the sheet's own step back lands before it).
   */
  function layerClose(loaded: Awaited<ReturnType<typeof fresh>>) {
    let land: () => void = () => {};
    const landed = new Promise<void>((resolve) => {
      land = resolve;
    });
    const close = vi.fn(() => {
      expect(here()).toBe("/ru/listing/100001");
      window.addEventListener("popstate", () => land(), { once: true });
      loaded.leaveListingRoute(100001);
    });
    return { close, landed };
  }

  it("from the menu: the sheet goes first, then the layer's own close takes the listing back to the feed", async () => {
    const loaded = await fresh("/ru");
    const { nav, history, closeListing } = loaded;
    nav.push("/listing/100001");
    nav.push("/listing/100001/actions");
    const length = window.history.length;
    const { close, landed } = layerClose(loaded);

    await closeListing(null, close, 100001);
    await landed;

    expect(close).toHaveBeenCalledTimes(1);
    expect(here()).toBe("/ru");
    expect(history.depth()).toBe(0);
    expect(router.replace).not.toHaveBeenCalled();
    expect(window.history.length).toBe(length);
  });

  it("from the report step: back to the page the listing was opened from", async () => {
    const loaded = await fresh("/ru/saved");
    const { nav, history, closeListing } = loaded;
    nav.push("/listing/100001");
    nav.push("/listing/100001/actions");
    openStep(history, "report");
    const { close, landed } = layerClose(loaded);

    await closeListing("report", close, 100001);
    await landed;

    expect(close).toHaveBeenCalledTimes(1);
    expect(here()).toBe("/ru/saved");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("from the detail step: the three entries of the sheet at once, then the listing", async () => {
    const loaded = await fresh("/ru");
    const { nav, history, closeListing } = loaded;
    nav.push("/listing/100001");
    nav.push("/listing/100001/actions");
    openStep(history, "report");
    openStep(history, "detail");
    const { close, landed } = layerClose(loaded);

    await closeListing("detail", close, 100001);
    await landed;

    expect(close).toHaveBeenCalledTimes(1);
    expect(here()).toBe("/ru");
    expect(history.depth()).toBe(0);
  });

  it("a listing loaded directly: the sheet and the listing in one move, then the feed replaces it, without the layer's close", async () => {
    // The sheet's soft push opened an overlay copy over the standalone one: the step back hides the copy whose close
    // this would be (review of WP-36), so the old single move stays.
    const loaded = await fresh("/ru/listing/100001");
    loaded.nav.push("/listing/100001/actions");
    const { close } = layerClose(loaded);

    await loaded.closeListing(null, close, 100001);

    expect(close).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/", { scroll: false });
    expect(here()).toBe("/ru");
  });

  it("a listing loaded directly with the report step open: the same single move", async () => {
    const loaded = await fresh("/ru/listing/100001");
    loaded.nav.push("/listing/100001/actions");
    openStep(loaded.history, "report");
    const { close } = layerClose(loaded);

    await loaded.closeListing("report", close, 100001);

    expect(close).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/", { scroll: false });
    expect(here()).toBe("/ru");
  });

  it("a direct load of the sheet (depth 0) replaces the address with the feed at once, without the layer's close", async () => {
    const go = vi.spyOn(window.history, "go");
    const loaded = await fresh("/ru/listing/100001/actions");
    const { close } = layerClose(loaded);

    await loaded.closeListing(null, close, 100001);

    expect(go).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/", { scroll: false });
    expect(here()).toBe("/ru");
  });
});

describe("the sale switch of a launch listing (WP-38, BR-APP-108)", () => {
  /** A launch whose link opened listing 100001, marked as a sale over the rent feed of Samarkand. */
  async function marked(address: string, { sale = true }: { sale?: boolean } = {}) {
    vi.doMock("@/lib/deeplinks/launch", () => ({ launchListing: () => 100001 }));
    const loaded = await fresh(address);
    const switcher = await import("@/features/listing/saleSwitch");
    switcher.saleSwitchRecord(100001, sale ? "sale" : "rent_daily", defaultFilters("rent_long", "samarkand"), null);
    return { ...loaded, switcher };
  }
  const saleFeed = `/?${toSearchParams(defaultFilters("sale", "samarkand")).toString()}`;

  afterEach(() => {
    vi.doUnmock("@/lib/deeplinks/launch");
  });

  it("over the feed: one step back, then the replace with the sale defaults of the feed's city", async () => {
    const { nav, history, leaveListingRoute, switcher } = await marked("/ru");
    nav.push("/listing/100001");
    const length = window.history.length;

    expect(leaveListingRoute(100001)).toBe("back");
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith(saleFeed, { scroll: false }));

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe(saleFeed.slice(1));
    expect(history.depth()).toBe(0);
    expect(window.history.length).toBe(length);
    expect(switcher.takeSaleSwitch(100001)).toBeNull();
  });

  it("over another page than the feed: only the step back, and the mark goes", async () => {
    const { nav, leaveListingRoute, switcher } = await marked("/ru/saved");
    nav.push("/listing/100001");
    const landed = popped();

    expect(leaveListingRoute(100001)).toBe("back");
    await landed;

    expect(router.replace).not.toHaveBeenCalled();
    expect(here()).toBe("/ru/saved");
    expect(switcher.takeSaleSwitch(100001)).toBeNull();
  });

  it("loaded directly (depth 0): the replace carries the sale feed", async () => {
    const { leaveListingRoute } = await marked("/ru/listing/100001");

    expect(leaveListingRoute(100001)).toBe("replace");

    expect(router.replace).toHaveBeenCalledWith(saleFeed, { scroll: false });
  });

  it("the direct-load branch of closeListing replaces with the sale feed too", async () => {
    const loaded = await marked("/ru/listing/100001");
    loaded.nav.push("/listing/100001/actions");

    await loaded.closeListing(null, vi.fn(), 100001);

    expect(router.replace).toHaveBeenCalledWith(saleFeed, { scroll: false });
  });

  it("another listing's close and a daily-rent launch listing change nothing", async () => {
    const other = await marked("/ru/listing/100002");
    expect(other.leaveListingRoute(100002)).toBe("replace");
    expect(router.replace).toHaveBeenLastCalledWith("/", { scroll: false });

    const daily = await marked("/ru/listing/100001", { sale: false });
    expect(daily.leaveListingRoute(100001)).toBe("replace");
    expect(router.replace).toHaveBeenLastCalledWith("/", { scroll: false });
  });
});
