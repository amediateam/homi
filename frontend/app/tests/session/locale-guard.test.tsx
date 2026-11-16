import { fakeTelegram, syntheticInitData, type FakeTelegram } from "@homi/testing";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ status: "booting", prepared: true, me: null as null | { locale: string }, locale: "ru", pathname: "/map", replace: vi.fn() }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: state.status, prepared: state.prepared, me: state.me }) }));
vi.mock("next-intl", () => ({ useLocale: () => state.locale }));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => state.pathname, useRouter: () => ({ replace: state.replace }) }));

import { LocaleGuard } from "@/lib/session/LocaleGuard";

let fake: FakeTelegram | null = null;

beforeEach(() => {
  Object.assign(state, { status: "booting", prepared: true, me: null, locale: "ru", pathname: "/map" });
  state.replace.mockReset();
  document.cookie = "NEXT_LOCALE=; max-age=0; path=/";
  window.history.replaceState(null, "", "/ru/map?deal=rent");
});

afterEach(() => {
  cleanup();
  fake?.uninstall();
  fake = null;
});

describe("LocaleGuard (BR-APP-050, 25 §3.4 step 5)", () => {
  it("before sign-in moves an uz Telegram user to /uz while no locale is stored", () => {
    fake = fakeTelegram({ initData: syntheticInitData({ language_code: "uz" }) });
    render(<LocaleGuard />);
    expect(state.replace).toHaveBeenCalledWith("/map?deal=rent", { locale: "uz" });
  });

  it("waits until the launch is prepared: a navigation would be undone by the fragment scrub", () => {
    fake = fakeTelegram({ initData: syntheticInitData({ language_code: "uz" }) });
    state.prepared = false;
    const view = render(<LocaleGuard />);
    expect(state.replace).not.toHaveBeenCalled();

    state.prepared = true;
    view.rerender(<LocaleGuard />);
    expect(state.replace).toHaveBeenCalledWith("/map?deal=rent", { locale: "uz" });
  });

  it("keeps an English Telegram user on ru while the one-detector flag is off", () => {
    fake = fakeTelegram({ initData: syntheticInitData({ language_code: "en" }) });
    render(<LocaleGuard />);
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("does not touch a stored locale before sign-in", () => {
    document.cookie = "NEXT_LOCALE=ru; path=/";
    fake = fakeTelegram({ initData: syntheticInitData({ language_code: "uz" }) });
    render(<LocaleGuard />);
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("after sign-in me.locale wins, and it is checked again on every navigation", () => {
    fake = fakeTelegram({ initData: syntheticInitData({ language_code: "uz" }) });
    Object.assign(state, { status: "ready", me: { locale: "en" } });
    const view = render(<LocaleGuard />);
    expect(state.replace).toHaveBeenLastCalledWith("/map?deal=rent", { locale: "en" });

    state.locale = "en";
    view.rerender(<LocaleGuard />);
    expect(state.replace).toHaveBeenCalledTimes(1);

    // Back lands on an address of the old segment.
    Object.assign(state, { locale: "ru", pathname: "/" });
    window.history.replaceState(null, "", "/ru");
    view.rerender(<LocaleGuard />);
    expect(state.replace).toHaveBeenLastCalledWith("/", { locale: "en" });
  });

  it("does nothing on a gate route, before or after sign-in: GateRedirector navigates there (WP-23, D-S-6)", () => {
    fake = fakeTelegram({ initData: syntheticInitData({ language_code: "uz" }) });
    for (const pathname of ["/welcome/language", "/welcome/city", "/no-access", "/outside"]) {
      state.pathname = pathname;
      state.status = "booting";
      state.me = null;
      const view = render(<LocaleGuard />);
      Object.assign(state, { status: "ready", me: { locale: "en" } });
      view.rerender(<LocaleGuard />);
      view.unmount();
    }
    expect(state.replace).not.toHaveBeenCalled();

    // Out of the gate, me.locale wins again.
    state.pathname = "/";
    window.history.replaceState(null, "", "/ru");
    render(<LocaleGuard />);
    expect(state.replace).toHaveBeenCalledWith("/", { locale: "en" });
  });

  it("does nothing outside Telegram", () => {
    render(<LocaleGuard />);
    expect(state.replace).not.toHaveBeenCalled();
  });
});
