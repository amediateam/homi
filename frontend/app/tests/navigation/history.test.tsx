import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const search = vi.hoisted(() => ({ current: () => new URLSearchParams(window.location.search) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => search.current() }));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => {
    const [, first, ...rest] = window.location.pathname.split("/");
    return ["ru", "uz", "en"].includes(first) ? `/${rest.join("/")}` : window.location.pathname;
  },
}));

/** A router that moves `window.history` the way the App Router does, with the locale prefix. */
const router = {
  push: vi.fn((href: string) => window.history.pushState(null, "", `/ru${href === "/" ? "" : href}`)),
  replace: vi.fn((href: string) => window.history.replaceState(null, "", `/ru${href === "/" ? "" : href}`)),
  back: vi.fn(() => window.history.back()),
};

async function popped(): Promise<void> {
  await new Promise<void>((resolve) => window.addEventListener("popstate", () => resolve(), { once: true }));
}

async function fresh(address: string) {
  window.history.replaceState(null, "", address);
  vi.resetModules();
  const history = await import("@/lib/navigation/history");
  const { nav, bindRouter } = await import("@/lib/navigation/nav");
  const { closeThen } = await import("@/lib/navigation/closeThen");
  const { useBack } = await import("@/lib/navigation/useBack");
  const { useLayerState } = await import("@/lib/navigation/useLayerState");
  bindRouter(router);
  return { history, nav, closeThen, useBack, useLayerState };
}

const here = () => window.location.pathname + window.location.search;

beforeEach(() => {
  for (const method of [router.push, router.replace, router.back]) {
    method.mockClear();
  }
});

afterEach(cleanup);

describe("the app's history stack (25 §3.2)", () => {
  it("push appends, back pops to the matching entry, replace rewrites the top, tab clears", async () => {
    const { history, nav } = await fresh("/ru");

    nav.push("/filters");
    nav.push("/sort");
    expect(history.depth()).toBe(2);
    expect(router.push).toHaveBeenLastCalledWith("/sort", { scroll: false });

    const back = popped();
    nav.back();
    await back;
    expect(history.depth()).toBe(1);
    expect(here()).toBe("/ru/filters");

    nav.replace("/city");
    expect(history.depth()).toBe(1);
    expect(router.replace).toHaveBeenLastCalledWith("/city", { scroll: false });

    nav.tab("/map");
    expect(history.depth()).toBe(0);
    expect(here()).toBe("/ru/map");
  });

  it("a popstate to an address it does not know starts a new stack", async () => {
    const { history, nav } = await fresh("/ru");
    nav.push("/filters");

    window.history.replaceState(null, "", "/ru/saved");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(history.depth()).toBe(0);
  });
});

describe("closeThen", () => {
  it("at depth 1 goes back, waits for popstate, then replaces — history never grows", async () => {
    const { history, nav, closeThen } = await fresh("/ru");
    nav.push("/sort");
    const length = window.history.length;

    await closeThen("/?sort=new");

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenLastCalledWith("/?sort=new", { scroll: false });
    expect(history.depth()).toBe(0);
    expect(window.history.length).toBe(length);
  });

  it("at depth 0 only replaces", async () => {
    const { closeThen } = await fresh("/ru/city");

    await closeThen("/");

    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/", { scroll: false });
  });

  it("gives up waiting for popstate after 500 ms", async () => {
    const { nav, closeThen } = await fresh("/ru");
    nav.push("/sort");
    router.back.mockImplementationOnce(() => undefined);
    vi.useFakeTimers();

    const closing = closeThen("/?sort=new");
    await vi.advanceTimersByTimeAsync(500);
    await closing;

    expect(router.replace).toHaveBeenCalledWith("/?sort=new", { scroll: false });
    vi.useRealTimers();
  });
});

describe("backBy (WP-26)", () => {
  it("steps back over several entries at once and resolves with the steps taken", async () => {
    const { history, nav } = await fresh("/ru");
    nav.push("/listing/100001");
    nav.push("/listing/100001/actions");
    nav.push("/listing/100001/actions?step=report");
    const length = window.history.length;

    await expect(history.backBy(3)).resolves.toBe(3);

    expect(here()).toBe("/ru");
    expect(history.depth()).toBe(0);
    expect(window.history.length).toBe(length);
    expect(router.back).not.toHaveBeenCalled();
  });

  it("never goes below the first entry of the launch: a direct load takes fewer", async () => {
    const { history, nav } = await fresh("/ru/listing/100001");
    nav.push("/listing/100001/actions");

    await expect(history.backBy(2)).resolves.toBe(1);

    expect(here()).toBe("/ru/listing/100001");
    expect(history.depth()).toBe(0);
  });

  it("at depth 0, or for no steps, does nothing", async () => {
    const go = vi.spyOn(window.history, "go");
    const { history, nav } = await fresh("/ru/listing/100001/actions");

    await expect(history.backBy(2)).resolves.toBe(0);
    nav.push("/listing/100001/actions?step=report");
    for (const steps of [0, -1, 0.5, Number.NaN]) {
      await expect(history.backBy(steps), String(steps)).resolves.toBe(0);
    }

    expect(go).not.toHaveBeenCalled();
    expect(history.depth()).toBe(1);
    go.mockRestore();
  });

  it("takes whole steps only", async () => {
    const { history, nav } = await fresh("/ru");
    nav.push("/listing/100001");
    nav.push("/listing/100001/actions");

    await expect(history.backBy(1.7)).resolves.toBe(1);

    expect(here()).toBe("/ru/listing/100001");
  });

  it("gives up waiting for popstate after 500 ms", async () => {
    const { history, nav } = await fresh("/ru");
    nav.push("/listing/100001");
    const go = vi.spyOn(window.history, "go").mockImplementation(() => undefined);
    vi.useFakeTimers();

    let taken: number | null = null;
    void history.backBy(1).then((value) => {
      taken = value;
    });
    await vi.advanceTimersByTimeAsync(499);
    expect(taken).toBeNull();
    await vi.advanceTimersByTimeAsync(1);

    expect(taken).toBe(1);
    expect(go).toHaveBeenCalledWith(-1);
    vi.useRealTimers();
    go.mockRestore();
  });
});

describe("useBack", () => {
  function Probe({ useBack }: { useBack: () => { canGoBack: boolean; back: () => void } }) {
    const { canGoBack, back } = useBack();
    return (
      <button type="button" onClick={back}>
        {String(canGoBack)}
      </button>
    );
  }

  it("a direct load of /filters?from=map goes back to /map with the search state", async () => {
    const { useBack } = await fresh("/ru/filters?from=map&rooms_min=2&focus=pets");
    render(<Probe useBack={useBack} />);

    expect(screen.getByRole("button").textContent).toBe("true");
    act(() => screen.getByRole("button").click());

    expect(router.replace).toHaveBeenCalledWith("/map?rooms_min=2", { scroll: false });
    expect(router.back).not.toHaveBeenCalled();
  });

  it("a root tab at depth 0 cannot go back", async () => {
    const { useBack } = await fresh("/ru/map");
    render(<Probe useBack={useBack} />);
    expect(screen.getByRole("button").textContent).toBe("false");
  });

  it("after a push it goes back in history", async () => {
    const { useBack, nav } = await fresh("/ru");
    render(<Probe useBack={useBack} />);
    act(() => nav.push("/saved"));

    expect(screen.getByRole("button").textContent).toBe("true");
    const back = popped();
    act(() => screen.getByRole("button").click());
    await back;
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});

describe("useLayerState", () => {
  it("open appends the search parameter as a history entry, close removes it again", async () => {
    const { useLayerState, history } = await fresh("/ru/map?rooms=2");
    function Layer() {
      const pick = useLayerState("pick");
      return (
        <>
          <output>{pick.value ?? "none"}</output>
          <button type="button" onClick={() => pick.open("7")}>
            open
          </button>
          <button type="button" onClick={pick.close}>
            close
          </button>
        </>
      );
    }
    const { rerender } = render(<Layer />);

    act(() => screen.getByText("open").click());
    rerender(<Layer />);
    expect(here()).toBe("/ru/map?rooms=2&pick=7");
    expect(history.depth()).toBe(1);
    expect(screen.getByRole("status").textContent).toBe("7");

    const back = popped();
    act(() => screen.getByText("close").click());
    await back;
    rerender(<Layer />);
    expect(here()).toBe("/ru/map?rooms=2");
    expect(history.depth()).toBe(0);
  });
});
