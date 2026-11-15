import { fakeTelegram, syntheticInitData, type FakeTelegram } from "@homi/testing";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
