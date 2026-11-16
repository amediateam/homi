import { fakeTelegram, syntheticInitData, type FakeTelegram } from "@homi/testing";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Me = { locale: string; locale_chosen: boolean; city_chosen: boolean };

const state = vi.hoisted(() => ({
  status: "booting" as string,
  prepared: true,
  me: null as Me | null,
  reason: null as string | null,
  locale: "ru",
  pathname: "/",
  query: "",
  cities: [{ code: "tashkent" }, { code: "samarkand" }],
  launchPending: false,
  router: { replace: vi.fn() },
  setLaunchGate: vi.fn(),
  releaseLaunchGate: vi.fn(),
  resetDepth: vi.fn(),
}));
vi.mock("@/lib/session/SessionProvider", () => ({
  useSession: () => ({ status: state.status, prepared: state.prepared, me: state.me, reason: state.reason }),
}));
vi.mock("@/lib/session/bootstrap", () => ({ getSession: () => ({ status: state.status, me: state.me }) }));
vi.mock("next-intl", () => ({ useLocale: () => state.locale }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.query) }));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => state.pathname, useRouter: () => state.router }));
vi.mock("@/lib/reference/useReference", () => ({ useReference: () => ({ cities: state.cities }) }));
vi.mock("@/lib/deeplinks/launch", () => ({
  launchPending: () => state.launchPending,
  setLaunchGate: state.setLaunchGate,
  releaseLaunchGate: state.releaseLaunchGate,
}));
vi.mock("@/lib/navigation/history", () => ({ resetDepth: state.resetDepth }));
vi.mock("@/features/gates/useBootRetry", () => ({ useBootRetry: () => undefined }));

import { GateRedirector } from "@/features/gates/GateRedirector";
import { gateState, resetGateState } from "@/features/gates/gateState";

const FIRST_LAUNCH: Me = { locale: "en", locale_chosen: false, city_chosen: true };
const CHOSEN: Me = { locale: "en", locale_chosen: true, city_chosen: true };

let fake: FakeTelegram | null = null;

function at(view: ReturnType<typeof render>, change: Partial<typeof state>) {
  Object.assign(state, change);
  view.rerender(<GateRedirector />);
}

/** The registered launch gate: the redirect may fire when it answers `true`. */
function launchGate(): boolean {
  const check = state.setLaunchGate.mock.calls.at(-1)?.[0] as (() => boolean) | undefined;
  return check?.() ?? true;
}

beforeEach(() => {
  Object.assign(state, {
    status: "booting",
    prepared: true,
    me: null,
    reason: null,
    locale: "ru",
    pathname: "/",
    query: "",
    cities: [{ code: "tashkent" }, { code: "samarkand" }],
    launchPending: false,
  });
  for (const spy of [state.router.replace, state.setLaunchGate, state.releaseLaunchGate, state.resetDepth]) {
    spy.mockReset();
  }
});

afterEach(() => {
  cleanup();
  resetGateState();
  fake?.uninstall();
  fake = null;
});

describe("GateRedirector (WP-23 'Gates', D-S-6, D-S-7)", () => {
  it("navigates once into the language gate, in the user's locale, and resets the depth", () => {
    const view = render(<GateRedirector />);
    expect(state.router.replace).not.toHaveBeenCalled();

    at(view, { status: "ready", me: FIRST_LAUNCH, query: "deal=rent" });
    at(view, { me: { ...FIRST_LAUNCH } });
    at(view, { me: { ...FIRST_LAUNCH } });

    expect(state.router.replace.mock.calls).toEqual([["/welcome/language", { locale: "en" }]]);
    expect(state.resetDepth.mock.calls).toEqual([["/welcome/language"]]);
  });

  it("keeps the return address with its query and goes back to it once the locale is picked", () => {
    const view = render(<GateRedirector />);
    at(view, { status: "ready", me: FIRST_LAUNCH, query: "listing=7&deal=rent" });
    expect(gateState.returnTo).toBe("/?listing=7&deal=rent");

    at(view, { pathname: "/welcome/language", query: "", locale: "en" });
    expect(state.router.replace).toHaveBeenCalledTimes(1);
    expect(gateState.returnTo).toBe("/?listing=7&deal=rent");

    // The picker: the flag, then patchMe — a new `me` with the chosen locale.
    gateState.localePicked = true;
    at(view, { me: { ...FIRST_LAUNCH, locale: "uz", locale_chosen: true } });
    expect(state.router.replace.mock.calls.at(-1)).toEqual(["/?listing=7&deal=rent", { locale: "uz" }]);
    expect(state.resetDepth.mock.calls.at(-1)).toEqual(["/?listing=7&deal=rent"]);
  });

  it("registers the launch gate on mount and releases it only once the address is back in the app", () => {
    const view = render(<GateRedirector />);
    expect(state.setLaunchGate).toHaveBeenCalledTimes(1);
    expect(launchGate()).toBe(true);

    at(view, { status: "ready", me: FIRST_LAUNCH });
    expect(launchGate()).toBe(false);
    at(view, { pathname: "/welcome/language", locale: "en" });
    expect(launchGate()).toBe(false);

    gateState.localePicked = true;
    at(view, { me: { ...FIRST_LAUNCH, locale_chosen: true } });
    // Still on the language page: the redirect would push over it.
    expect(launchGate()).toBe(false);
    expect(state.releaseLaunchGate).not.toHaveBeenCalled();

    at(view, { pathname: "/" });
    expect(launchGate()).toBe(true);
    expect(state.releaseLaunchGate).toHaveBeenCalledTimes(1);
    at(view, { query: "deal=sale" });
    expect(state.releaseLaunchGate).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(launchGate()).toBe(true);
  });

  it("a listing launch opens before the city page; Back to the feed then shows it (D-S-8)", () => {
    const view = render(<GateRedirector />);
    at(view, { status: "ready", me: { ...CHOSEN, city_chosen: false }, launchPending: true });
    expect(state.router.replace).not.toHaveBeenCalled();
    expect(launchGate()).toBe(true);

    at(view, { pathname: "/listing/42", launchPending: false });
    expect(state.router.replace).not.toHaveBeenCalled();

    at(view, { pathname: "/" });
    expect(state.router.replace.mock.calls).toEqual([["/welcome/city", { locale: "en" }]]);
    expect(gateState.returnTo).toBe("/");
  });

  it("a refusal goes to /no-access in the full Telegram language mapping (D-S-5)", () => {
    fake = fakeTelegram({ initData: syntheticInitData({ language_code: "en-US" }) });
    const view = render(<GateRedirector />);
    at(view, { status: "denied", reason: "join", pathname: "/map", query: "city=tashkent" });
    expect(state.router.replace.mock.calls).toEqual([["/no-access?reason=join", { locale: "en" }]]);
    expect(state.resetDepth).toHaveBeenCalledWith("/no-access?reason=join");
    expect(gateState.returnTo).toBe("/map?city=tashkent");

    at(view, { pathname: "/no-access", query: "reason=join", locale: "en" });
    expect(state.router.replace).toHaveBeenCalledTimes(1);

    // A later re-check lets the user in: back where the launch was going, in the user's locale.
    at(view, { status: "ready", reason: null, me: CHOSEN });
    expect(state.router.replace.mock.calls.at(-1)).toEqual(["/map?city=tashkent", { locale: "en" }]);
  });

  it("outside Telegram: /outside in the address's locale", () => {
    const view = render(<GateRedirector />);
    at(view, { status: "outside", locale: "uz", pathname: "/listing/5" });
    expect(state.router.replace.mock.calls).toEqual([["/outside", { locale: "uz" }]]);
  });

  it("an expired session navigates nowhere: the screen replaces the route in place", () => {
    const view = render(<GateRedirector />);
    at(view, { status: "expired", pathname: "/listing/5" });
    expect(state.router.replace).not.toHaveBeenCalled();
  });

  it("waits until the launch is prepared: the fragment scrub would undo the navigation", () => {
    const view = render(<GateRedirector />);
    at(view, { status: "outside", prepared: false });
    expect(state.router.replace).not.toHaveBeenCalled();
    at(view, { prepared: true });
    expect(state.router.replace).toHaveBeenCalledTimes(1);
  });

  it("sends again when the address changed without reaching the target, never twice from the same address", () => {
    const view = render(<GateRedirector />);
    at(view, { status: "ready", me: FIRST_LAUNCH });
    // Another navigation won the race (the locale guard's): the address changed, the gate is still due.
    at(view, { locale: "en" });
    at(view, { locale: "en" });
    expect(state.router.replace.mock.calls).toEqual([
      ["/welcome/language", { locale: "en" }],
      ["/welcome/language", { locale: "en" }],
    ]);
  });

  it("one city in the reference data: no city page", () => {
    const view = render(<GateRedirector />);
    at(view, { status: "ready", me: { ...CHOSEN, city_chosen: false }, cities: [{ code: "tashkent" }] });
    expect(state.router.replace).not.toHaveBeenCalled();
  });
});
