import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ canGoBack: false, back: vi.fn(), status: "ready", pathname: "/", push: vi.fn() }));
vi.mock("@/lib/navigation/useBack", () => ({ useBack: () => ({ canGoBack: state.canGoBack, back: state.back }) }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: state.status }) }));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@/lib/navigation/nav", () => ({ nav: { push: state.push } }));

import { TelegramButtons } from "@/features/shell/TelegramButtons";
import { initTelegramApp } from "@/lib/telegram";

let fake: FakeTelegram | null = null;

beforeEach(() => {
  Object.assign(state, { canGoBack: false, status: "ready", pathname: "/" });
  state.back.mockReset();
  state.push.mockReset();
});

afterEach(() => {
  cleanup();
  fake?.uninstall();
  fake = null;
});

describe("TelegramButtons (TMA-022, TMA-023)", () => {
  it("shows BackButton iff Back is possible and the session is not expired; its click runs back()", () => {
    fake = fakeTelegram({ version: "7.0" });
    const { rerender } = render(<TelegramButtons />);
    expect(fake.webApp.BackButton.isVisible).toBe(false);

    state.canGoBack = true;
    rerender(<TelegramButtons />);
    expect(fake.webApp.BackButton.isVisible).toBe(true);
    act(() => fake?.emit("backButtonClicked"));
    expect(state.back).toHaveBeenCalledTimes(1);

    state.status = "expired";
    rerender(<TelegramButtons />);
    expect(fake.webApp.BackButton.isVisible).toBe(false);
  });

  it("SettingsButton pushes /settings, but not from under /settings", () => {
    fake = fakeTelegram({ version: "7.0" });
    const { rerender } = render(<TelegramButtons />);
    expect(fake.webApp.SettingsButton.isVisible).toBe(true);

    act(() => fake?.emit("settingsButtonClicked"));
    expect(state.push).toHaveBeenCalledWith("/settings");

    state.pathname = "/settings/theme";
    rerender(<TelegramButtons />);
    act(() => fake?.emit("settingsButtonClicked"));
    expect(state.push).toHaveBeenCalledTimes(1);
  });

  it("6.0 has no SettingsButton", () => {
    fake = fakeTelegram({ version: "6.0" });
    render(<TelegramButtons />);
    expect(fake.calls.filter((call) => call.member.startsWith("SettingsButton"))).toEqual([]);
  });

  it("a late SDK gets its handlers once", () => {
    render(<TelegramButtons />);
    fake = fakeTelegram({ version: "7.0" });
    act(() => initTelegramApp());

    act(() => fake?.emit("backButtonClicked"));
    expect(state.back).toHaveBeenCalledTimes(1);
    expect(fake.calls.filter((call) => call.member === "BackButton.onClick")).toHaveLength(1);
  });
});
