import { fakeTelegram, syntheticInitData, type FakeTelegram } from "@homi/testing";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseLaunch } from "@/lib/deeplinks/parse";
import { EMPTY_REFERENCE } from "@/lib/reference/empty";

const state = vi.hoisted(() => ({
  status: "ready",
  me: { locale_chosen: true, city_chosen: true } as { locale_chosen: boolean; city_chosen: boolean } | null,
  push: vi.fn((href: string) => window.history.pushState(null, "", `/ru${href}`)),
  replace: vi.fn((href: string) => window.history.replaceState(null, "", `/ru${href.replace(/^\/(?=\?|$)/, "")}`)),
}));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: state.status, me: state.me }) }));
vi.mock("@/lib/navigation/nav", () => ({ nav: { push: state.push, replace: state.replace } }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search), usePathname: () => window.location.pathname }));

const ID = "01JF0000000000000000000004";
let fake: FakeTelegram | null = null;

/** Mounts the redirector with fresh modules; `reference` feeds their reference store (`null` leaves it missing). */
async function mount(address: string, startParam: string | undefined, reference: { owner_enabled: boolean } | null) {
  window.history.replaceState(null, "", address);
  fake = fakeTelegram({ initData: syntheticInitData({}, { startParam }) });
  vi.resetModules();
  const store = await import("@/lib/reference/useReference");
  const feed = (value: { owner_enabled: boolean } | null) =>
    store.setReference({
      reference: value === null ? { loaded: false, data: EMPTY_REFERENCE } : { loaded: true, data: { ...EMPTY_REFERENCE, ...value } },
      cities: { loaded: false, data: [] },
    });
  feed(reference);
  const { LaunchRedirector } = await import("@/features/shell/LaunchRedirector");
  const launch = await import("@/lib/deeplinks/launch");
  const view = render(<LaunchRedirector />);
  return { launch, feed, rerender: () => view.rerender(<LaunchRedirector />) };
}

afterEach(() => {
  cleanup();
  fake?.uninstall();
  fake = null;
  state.push.mockClear();
  state.replace.mockClear();
  window.history.replaceState(null, "", "/");
  window.sessionStorage.clear();
});

describe("owner launch links (WP-81, TMA-046, LB-APP-060)", () => {
  it("parses owner_new, owner-new, ?owner=new and o_<ULID>; a listing link wins; entry stays menu", () => {
    const data = (startParam?: string) => syntheticInitData({}, { startParam });
    expect(parseLaunch(data("owner_new"), "").owner).toEqual({ kind: "new" });
    expect(parseLaunch(data("owner-new"), "").owner).toEqual({ kind: "new" });
    expect(parseLaunch(data(), "?owner=new").owner).toEqual({ kind: "new" });
    expect(parseLaunch(data(`o_${ID}`), "")).toMatchObject({ owner: { kind: "phone", id: ID }, entry: "menu" });
    expect(parseLaunch(data("l_42"), "?owner=new").owner).toBeNull();
    expect(parseLaunch(data("o_123"), "").owner).toBeNull();
  });

  it("owner_new opens the form once the reference data says the cabinet is on, once per launch", async () => {
    const { rerender, feed } = await mount("/ru", "owner_new", null);
    expect(state.push).not.toHaveBeenCalled();
    act(() => feed({ owner_enabled: true }));
    rerender();

    expect(state.push.mock.calls).toEqual([["/owner/new"]]);
  });

  it("o_<id> opens the questionnaire, then its phone step", async () => {
    const { rerender } = await mount("/ru", `o_${ID}`, { owner_enabled: true });
    rerender();

    expect(state.push.mock.calls).toEqual([[`/owner/${ID}`], [`/owner/${ID}/phone`]]);
  });

  it("?owner=new leaves the address first; while the cabinet is off the target is dropped", async () => {
    const { rerender } = await mount("/ru?owner=new&deal=rent_long", undefined, { owner_enabled: false });
    rerender();

    expect(state.replace.mock.calls).toEqual([["/?deal=rent_long"]]);
    expect(state.push).not.toHaveBeenCalled();
  });

  it("the search filter owner=owners is not a launch parameter and stays in the address", async () => {
    const { rerender } = await mount("/ru?owner=owners&deal=rent_long", undefined, { owner_enabled: true });
    rerender();

    expect(state.replace).not.toHaveBeenCalled();
    expect(state.push).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?owner=owners&deal=rent_long");
  });

  it("an owner launch waits until the city is chosen, and keeps ?owner=new through the city pick (second review)", async () => {
    state.me = { locale_chosen: true, city_chosen: false };
    const { rerender } = await mount("/ru?owner=new", undefined, { owner_enabled: true });
    rerender();
    expect(state.push).not.toHaveBeenCalled();

    // The city page replaced the address; the pick lands on the feed without the query.
    window.history.replaceState(null, "", "/ru");
    state.me = { locale_chosen: true, city_chosen: true };
    rerender();
    expect(state.push.mock.calls).toEqual([["/owner/new"]]);
    state.me = { locale_chosen: true, city_chosen: true };
  });

  it("an owner launch is never pending: the first-launch pickers come first (default (c))", async () => {
    const { launch } = await mount("/ru", "owner_new", null);

    expect(launch.launchPending()).toBe(false);
  });
});
