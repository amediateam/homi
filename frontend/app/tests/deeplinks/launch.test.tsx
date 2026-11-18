import { fakeTelegram, syntheticInitData, type FakeTelegram } from "@homi/testing";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveGate } from "@/features/gates/resolveGate";

const state = vi.hoisted(() => ({
  status: "booting",
  push: vi.fn(),
  // The router's replace: the address changes, the search parameters follow on the next render.
  replace: vi.fn((href: string) => window.history.replaceState(null, "", `/ru${href.replace(/^\/(?=\?|$)/, "")}`)),
}));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: state.status }) }));
vi.mock("@/lib/navigation/nav", () => ({ nav: { push: state.push, replace: state.replace } }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));

let fake: FakeTelegram | null = null;

async function mount(address: string, startParam?: string) {
  window.history.replaceState(null, "", address);
  fake = fakeTelegram({ initData: syntheticInitData({}, { startParam }) });
  vi.resetModules();
  const { LaunchRedirector } = await import("@/features/shell/LaunchRedirector");
  const launch = await import("@/lib/deeplinks/launch");
  const view = render(<LaunchRedirector />);
  return { launch, rerender: () => view.rerender(<LaunchRedirector />) };
}

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  cleanup();
  fake?.uninstall();
  fake = null;
  state.status = "booting";
  state.push.mockReset();
  state.replace.mockClear();
  window.history.replaceState(null, "", "/");
});

describe("LaunchRedirector (TMA-010 … TMA-012)", () => {
  it("opens the listing of start_param over the feed once the session is ready, once per launch", async () => {
    const { rerender } = await mount("/ru", "l_42-web");
    expect(state.push).not.toHaveBeenCalled();

    state.status = "ready";
    rerender();
    rerender();

    expect(state.push.mock.calls).toEqual([["/listing/42"]]);
  });

  it("?listing= first leaves the address by a replace, then opens the listing", async () => {
    state.status = "ready";
    const { rerender } = await mount("/ru?listing=7&news=pets&deal=rent");

    expect(state.replace.mock.calls).toEqual([["/?deal=rent"]]);
    expect(state.push).not.toHaveBeenCalled();
    rerender();

    expect(state.push.mock.calls).toEqual([["/listing/7"]]);
    expect(window.location.pathname + window.location.search).toBe("/ru?deal=rent");
  });

  it("?news=pets without a listing opens the filters on the pets section", async () => {
    state.status = "ready";
    const { rerender } = await mount("/ru?news=pets");
    rerender();

    expect(state.push.mock.calls).toEqual([["/filters?focus=pets"]]);
    expect(window.location.search).toBe("");
  });

  it("waits while the launch gate of WP-23 is closed", async () => {
    let open = false;
    window.history.replaceState(null, "", "/ru?listing=9");
    vi.resetModules();
    const launch = await import("@/lib/deeplinks/launch");
    launch.setLaunchGate(() => open);
    fake = fakeTelegram();
    state.status = "ready";
    const { LaunchRedirector } = await import("@/features/shell/LaunchRedirector");
    const view = render(<LaunchRedirector />);
    expect(state.push).not.toHaveBeenCalled();

    open = true;
    act(() => launch.releaseLaunchGate());
    expect(state.replace.mock.calls).toEqual([["/"]]);
    view.rerender(<LaunchRedirector />);

    expect(state.push.mock.calls).toEqual([["/listing/9"]]);
  });

  it("does nothing for a plain launch", async () => {
    state.status = "ready";
    await mount("/ru/map");
    expect(state.push).not.toHaveBeenCalled();
  });
});

describe("launchTarget (the one rule of LaunchRedirector and launchPending)", () => {
  it("is the listing, else the filters on the pets section for ?news=pets, else nothing", async () => {
    const { launchTarget } = await import("@/lib/deeplinks/launch");
    const { parseLaunch } = await import("@/lib/deeplinks/parse");
    const withStart = syntheticInitData({}, { startParam: "l_42-web" });

    expect(launchTarget(parseLaunch(withStart, "?listing=7&news=pets"))).toBe("/listing/42");
    expect(launchTarget(parseLaunch("", "?listing=7&news=pets"))).toBe("/listing/7");
    expect(launchTarget(parseLaunch("", "?news=pets"))).toBe("/filters?focus=pets");
    expect(launchTarget(parseLaunch("", "?news=other"))).toBeNull();
    expect(launchTarget(parseLaunch("", ""))).toBeNull();
  });
});

describe("launchPending (WP-23, D-S-8, BR-APP-055)", () => {
  async function fresh(address: string, startParam?: string) {
    window.history.replaceState(null, "", address);
    fake = fakeTelegram({ initData: syntheticInitData({}, { startParam }) });
    vi.resetModules();
    return import("@/lib/deeplinks/launch");
  }

  it("a plain launch, or ?news= other than pets, is never pending", async () => {
    for (const address of ["/ru", "/ru/map?deal=sale", "/ru?news=other"]) {
      const launch = await fresh(address);
      expect(launch.launchPending(), address).toBe(false);
      launch.consumeLaunch();
      expect(launch.launchPending(), address).toBe(false);
      fake?.uninstall();
      fake = null;
    }
  });

  it("a listing of start_param is pending until the push of the redirect is committed, and stays done after Back", async () => {
    const launch = await fresh("/ru", "l_42-web");
    expect(launch.launchPending()).toBe(true);

    launch.consumeLaunch();
    expect(launch.launchPending()).toBe(true);

    window.history.pushState(null, "", "/ru/listing/42");
    expect(launch.launchPending()).toBe(false);

    window.history.replaceState(null, "", "/ru");
    expect(launch.launchPending()).toBe(false);
  });

  it("does not count the history: Telegram Web's iframe at Chromium's cap of 50 entries still ends it", async () => {
    const length = vi.spyOn(History.prototype, "length", "get").mockReturnValue(50);
    const launch = await fresh("/ru", "l_42-web");
    launch.consumeLaunch();
    expect(launch.launchPending()).toBe(true);

    window.history.pushState(null, "", "/ru/listing/42");
    expect(launch.launchPending()).toBe(false);

    window.history.replaceState(null, "", "/ru");
    expect(launch.launchPending()).toBe(false);
    length.mockRestore();
  });

  it("an address other than the target does not end it", async () => {
    const launch = await fresh("/ru", "l_42-web");
    launch.consumeLaunch();
    for (const address of ["/ru/map", "/ru/listing/43", "/ru/filters?focus=pets"]) {
      window.history.pushState(null, "", address);
      expect(launch.launchPending(), address).toBe(true);
    }
  });

  it("?listing= and ?news=pets stay pending through the replace that drops them", async () => {
    for (const [address, target] of [
      ["/ru?listing=7&deal=rent", "/ru/listing/7"],
      ["/ru?news=pets", "/ru/filters?focus=pets"],
    ]) {
      const launch = await fresh(address);
      expect(launch.launchPending(), address).toBe(true);

      launch.consumeLaunch();
      window.history.replaceState(null, "", "/ru?deal=rent");
      expect(launch.launchPending(), address).toBe(true);

      window.history.pushState(null, "", target);
      expect(launch.launchPending(), address).toBe(false);
      fake?.uninstall();
      fake = null;
    }
  });

  it("?listing= stays pending while a gate route without the query is shown before the redirect", async () => {
    const launch = await fresh("/ru?listing=7");
    window.history.replaceState(null, "", "/uz/welcome/language");
    expect(launch.launchPending()).toBe(true);

    window.history.replaceState(null, "", "/uz?listing=7");
    launch.consumeLaunch();
    expect(launch.launchPending()).toBe(true);
  });

  it("a launch consumed where its query got lost opens nothing and is not pending", async () => {
    const launch = await fresh("/ru?listing=7");
    window.history.replaceState(null, "", "/ru/map");
    launch.consumeLaunch();
    expect(launch.launchPending()).toBe(false);
  });

  it("follows LaunchRedirector: pending until its push lands, also while the launch gate is closed", async () => {
    state.push.mockImplementation((href: string) => window.history.pushState(null, "", `/ru${href}`));
    let open = false;
    const launch = await fresh("/ru", "l_5");
    launch.setLaunchGate(() => open);
    state.status = "ready";
    const { LaunchRedirector } = await import("@/features/shell/LaunchRedirector");
    render(<LaunchRedirector />);
    expect(launch.launchPending()).toBe(true);

    open = true;
    act(() => launch.releaseLaunchGate());

    expect(state.push.mock.calls).toEqual([["/listing/5"]]);
    expect(launch.launchPending()).toBe(false);
  });

  it("a landed push still ends the launch before the bound, and the bound does not bring it back", async () => {
    vi.useFakeTimers();
    const launch = await fresh("/ru", "l_42-web");
    await vi.advanceTimersByTimeAsync(launch.LAUNCH_PENDING_MS);
    expect(launch.launchPending()).toBe(true);

    launch.consumeLaunch();
    await vi.advanceTimersByTimeAsync(launch.LAUNCH_PENDING_MS - 1);
    expect(launch.launchPending()).toBe(true);

    window.history.pushState(null, "", "/ru/listing/42");
    expect(launch.launchPending()).toBe(false);

    await vi.advanceTimersByTimeAsync(launch.LAUNCH_PENDING_MS);
    window.history.replaceState(null, "", "/ru");
    expect(launch.launchPending()).toBe(false);
  });

  it("a push that never lands stops being pending at the bound, and the city gate can then fire", async () => {
    vi.useFakeTimers();
    const launch = await fresh("/ru", "l_42-web");
    function Probe() {
      return <span data-version={launch.useLaunchGate()} />;
    }
    const view = render(<Probe />);
    const version = () => view.container.querySelector("span")!.getAttribute("data-version");
    const before = version();

    launch.consumeLaunch();
    window.history.pushState(null, "", "/ru/map");
    await vi.advanceTimersByTimeAsync(launch.LAUNCH_PENDING_MS - 1);
    expect(launch.launchPending()).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(launch.launchPending()).toBe(false);
    expect(window.location.pathname).toBe("/ru/map");
    expect(version()).not.toBe(before);
    expect(
      resolveGate({
        status: "ready",
        me: { locale: "uz", locale_chosen: true, city_chosen: false },
        reason: null,
        locale: "uz",
        pathname: "/map",
        searchParams: new URLSearchParams(),
        citiesCount: 3,
        localePicked: false,
        cityPicked: false,
        launchPending: launch.launchPending(),
        telegramLocale: "en",
        returnTo: null,
      }),
    ).toEqual({ href: "/welcome/city", locale: "uz" });
  });
});

describe("launchMapOptions (TMA-012)", () => {
  async function opened(address: string) {
    window.history.replaceState(null, "", address);
    fake = fakeTelegram({ initData: syntheticInitData({}) });
    vi.resetModules();
    return import("@/lib/deeplinks/launch");
  }

  it("reads ?map= and ?mapdebug of the launch query, also after the address dropped them", async () => {
    const launch = await opened("/ru?map=gl&mapdebug");
    window.history.replaceState(null, "", "/ru/map?deal=rent");

    expect(launch.launchMapOptions()).toEqual({ override: "gl", debug: true });
  });

  it("an address set after the launch does not count", async () => {
    const launch = await opened("/ru");
    window.history.replaceState(null, "", "/ru/map?map=leaflet&mapdebug");

    expect(launch.launchMapOptions()).toEqual({ override: null, debug: false });
  });

  it("an unknown ?map= value is no override", async () => {
    const launch = await opened("/ru?map=svg");
    expect(launch.launchMapOptions().override).toBeNull();
  });

  it("?mapdebug is off in a production build", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    try {
      const launch = await opened("/ru?map=auto&mapdebug");
      expect(launch.launchMapOptions()).toEqual({ override: "auto", debug: false });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
