import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useTelegram } from "@/lib/telegram/useTelegram";

let fake: FakeTelegram | null = null;

function Probe() {
  const state = useTelegram();
  return <output>{`${String(state.inside)} ${state.platform} ${state.version} ${String(state.isFullscreen)} ${state.colorScheme}`}</output>;
}

afterEach(() => {
  cleanup();
  fake?.uninstall();
  fake = null;
});

describe("useTelegram (TMA-016)", () => {
  it("follows fullscreenChanged and themeChanged", () => {
    fake = fakeTelegram({ version: "8.0", platform: "ios", colorScheme: "light" });
    render(<Probe />);
    expect(screen.getByRole("status").textContent).toBe("true ios 8.0 false light");

    act(() => {
      fake?.webApp.requestFullscreen();
      fake?.emit("fullscreenChanged");
      (fake?.webApp as { colorScheme: string }).colorScheme = "dark";
      fake?.emit("themeChanged");
    });
    expect(screen.getByRole("status").textContent).toBe("true ios 8.0 true dark");
  });

  it("answers as outside Telegram without an SDK", () => {
    render(<Probe />);
    expect(screen.getByRole("status").textContent).toBe("false unknown  false light");
  });
});
