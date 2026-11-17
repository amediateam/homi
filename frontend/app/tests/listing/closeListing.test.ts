import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("closeListing", () => {
  it("from the menu: the sheet and the listing in one move, back to the feed", async () => {
    const { nav, history, closeListing } = await fresh("/ru");
    nav.push("/listing/100001");
    nav.push("/listing/100001/actions");
    const length = window.history.length;

    await closeListing(null);

    expect(here()).toBe("/ru");
    expect(history.depth()).toBe(0);
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
    expect(window.history.length).toBe(length);
  });

  it("from the report step: back to the page the listing was opened from", async () => {
    const { nav, history, closeListing } = await fresh("/ru/saved");
    nav.push("/listing/100001");
    nav.push("/listing/100001/actions");
    openStep(history, "report");

    await closeListing("report");

    expect(here()).toBe("/ru/saved");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("from the detail step: four entries at once", async () => {
    const { nav, history, closeListing } = await fresh("/ru");
    nav.push("/listing/100001");
    nav.push("/listing/100001/actions");
    openStep(history, "report");
    openStep(history, "detail");

    await closeListing("detail");

    expect(here()).toBe("/ru");
    expect(history.depth()).toBe(0);
  });

  it("a listing loaded directly: back to it, then the feed replaces it", async () => {
    const { nav, closeListing } = await fresh("/ru/listing/100001");
    nav.push("/listing/100001/actions");

    await closeListing(null);

    expect(router.replace).toHaveBeenCalledWith("/", { scroll: false });
    expect(here()).toBe("/ru");
  });

  it("a direct load of the sheet (depth 0) replaces the address with the feed", async () => {
    const go = vi.spyOn(window.history, "go");
    const { closeListing } = await fresh("/ru/listing/100001/actions");

    await closeListing(null);

    expect(go).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/", { scroll: false });
    expect(here()).toBe("/ru");
  });
});
