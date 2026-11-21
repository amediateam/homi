import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: { status: "ready" } as Record<string, unknown>,
  track: vi.fn<(name: string) => void>(),
}));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => state.session }));
vi.mock("@/lib/analytics/events", () => ({ track: (name: string) => state.track(name) }));

import { readHomeMemory } from "@/features/nudges/homeScreen";
import { HomeScreenNudge } from "@/features/nudges/HomeScreenNudge";
import { type NudgeEnv, releaseSlot, resetNudgeSlot, setFollowPending, setReturnPending, takeSlot } from "@/features/nudges/store";
import { HOME_OFFER_DELAY_MS, HOME_SHOW_MS, resetHomeOffer, useHomeScreenOffer } from "@/features/nudges/useHomeScreenOffer";
import { currentToast, dismissToast } from "@/lib/ui/toast";

import { withIntl } from "../settings/harness";

let fake: FakeTelegram | null = null;
const CALM: NudgeEnv = { allowed: true, layer: false, filters: null, toast: false, radars: undefined, radarsEnabled: false, limit: 10, referenceLoaded: true };

function Host({ env }: { env: NudgeEnv }) {
  const home = useHomeScreenOffer(env);
  return home.visible ? <HomeScreenNudge onExpire={home.expire} onClose={home.close} onAdd={home.add} /> : null;
}

const card = () => screen.queryByText("HOMI на экране телефона");
const memory = (days: string[], offered = false) => window.localStorage.setItem("homi-home", JSON.stringify({ days, offered }));
const THREE = ["2026-11-18", "2026-11-19", "2026-11-20"];
const telegram = (version: string, status: "missed" | "unknown" | "added" | "unsupported" = "missed") => {
  fake?.uninstall();
  fake = fakeTelegram({ version, answers: { homeScreenStatus: status } });
};
const wait = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-20T08:00:00Z"));
  window.localStorage.clear();
  state.session = { status: "ready" };
  state.track.mockReset();
  resetNudgeSlot();
  resetHomeOffer();
  telegram("8.0");
});

afterEach(() => {
  cleanup();
  dismissToast("app");
  fake?.uninstall();
  fake = null;
  vi.useRealTimers();
});

describe("useHomeScreenOffer (WP-31, BR-APP-045)", () => {
  it("records the launch's visit day once, when the session is ready", async () => {
    state.session = { status: "booting" };
    const view = render(withIntl(<Host env={CALM} />));
    expect(readHomeMemory().days).toEqual([]);

    state.session = { status: "ready" };
    view.rerender(withIntl(<Host env={CALM} />));
    expect(readHomeMemory().days).toEqual(["2026-11-20"]);
    view.rerender(withIntl(<Host env={CALM} />));
    expect(readHomeMemory().days).toEqual(["2026-11-20"]);
  });

  it("three visit days and `missed`: the card after 4 s of calm, `home_screen_offered`, then `offered: true`", async () => {
    memory(THREE);
    render(withIntl(<Host env={CALM} />));

    await wait(HOME_OFFER_DELAY_MS - 1);
    expect(card()).toBeNull();
    await wait(1);
    expect(card()).not.toBeNull();
    expect(state.track.mock.calls).toEqual([["home_screen_offered"]]);
    expect(readHomeMemory().offered).toBe(true);
  });

  it.each(["unknown", "added", "unsupported"] as const)("status `%s`: no card and `offered` stays false (the fix of LB-APP-040)", async (status) => {
    telegram("8.0", status);
    memory(THREE);
    render(withIntl(<Host env={CALM} />));

    await wait(HOME_OFFER_DELAY_MS + 2_000);
    expect(card()).toBeNull();
    expect(readHomeMemory().offered).toBe(false);
    expect(state.track).not.toHaveBeenCalled();
  });

  it("nothing below Telegram 8.0, fewer than three days, or once offered; no status is asked", async () => {
    telegram("7.10");
    memory(THREE);
    const view = render(withIntl(<Host env={CALM} />));
    await wait(HOME_OFFER_DELAY_MS + 2_000);
    expect(card()).toBeNull();
    expect(fake?.calls.some((call) => call.member === "checkHomeScreenStatus")).toBe(false);
    view.unmount();

    telegram("8.0");
    memory(["2026-11-19"]);
    const second = render(withIntl(<Host env={CALM} />));
    await wait(HOME_OFFER_DELAY_MS + 2_000);
    expect(card()).toBeNull();
    second.unmount();

    memory(THREE, true);
    render(withIntl(<Host env={CALM} />));
    await wait(HOME_OFFER_DELAY_MS + 2_000);
    expect(card()).toBeNull();
  });

  it("waits while a toast, a layer away from the feed list, a follow candidate or a return check is present (BR-APP-046)", async () => {
    memory(THREE);
    const view = render(withIntl(<Host env={{ ...CALM, toast: true }} />));
    await wait(HOME_OFFER_DELAY_MS + 2_000);
    expect(card()).toBeNull();

    view.rerender(withIntl(<Host env={{ ...CALM, allowed: false }} />));
    await wait(HOME_OFFER_DELAY_MS + 2_000);
    expect(card()).toBeNull();

    act(() => setFollowPending(true));
    view.rerender(withIntl(<Host env={CALM} />));
    await wait(HOME_OFFER_DELAY_MS + 2_000);
    expect(card()).toBeNull();
    act(() => setFollowPending(false));
    act(() => setReturnPending("abc"));
    view.rerender(withIntl(<Host env={{ ...CALM }} />));
    await wait(HOME_OFFER_DELAY_MS + 2_000);
    expect(card()).toBeNull();

    act(() => setReturnPending(null));
    view.rerender(withIntl(<Host env={{ ...CALM }} />));
    await wait(HOME_OFFER_DELAY_MS);
    expect(card()).not.toBeNull();
  });

  it("a calm broken during the 4 s starts the wait over", async () => {
    memory(THREE);
    const view = render(withIntl(<Host env={CALM} />));
    await wait(HOME_OFFER_DELAY_MS - 1_000);
    view.rerender(withIntl(<Host env={{ ...CALM, toast: true }} />));
    await wait(500);
    view.rerender(withIntl(<Host env={CALM} />));
    await wait(HOME_OFFER_DELAY_MS - 1);
    expect(card()).toBeNull();
    await wait(1);
    expect(card()).not.toBeNull();
  });
});

describe("HomeScreenNudge (WP-31, SCR-041)", () => {
  async function shown() {
    memory(THREE);
    const view = render(withIntl(<Host env={CALM} />));
    await wait(HOME_OFFER_DELAY_MS);
    expect(card()).not.toBeNull();
    state.track.mockReset();
    return view;
  }

  it("the texts; 10 s on screen hide it without an event", async () => {
    await shown();
    expect(screen.getByText("Открывать в одно касание, как обычное приложение")).toBeTruthy();

    await wait(HOME_SHOW_MS - 1);
    expect(card()).not.toBeNull();
    await wait(1);
    expect(card()).toBeNull();
    expect(state.track).not.toHaveBeenCalled();
    expect(readHomeMemory().offered).toBe(true);
  });

  it("×: hidden with `home_screen_closed`", async () => {
    await shown();
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));

    expect(card()).toBeNull();
    expect(state.track.mock.calls).toEqual([["home_screen_closed"]]);
  });

  it("«Добавить»: a medium impact, hidden, then Telegram's own dialog", async () => {
    await shown();
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));

    expect(card()).toBeNull();
    expect(fake?.calls.some((call) => call.member === "HapticFeedback.impactOccurred" && call.args[0] === "medium")).toBe(true);
    expect(fake?.calls.some((call) => call.member === "addToHomeScreen")).toBe(true);
  });

  it("a return banner taking the slot hides it without an event and writes `offered: false`, so it comes back at a later calm", async () => {
    await shown();
    let ticket: number | null = null;
    act(() => {
      ticket = takeSlot("return");
    });
    expect(card()).toBeNull();
    expect(state.track).not.toHaveBeenCalled();
    expect(readHomeMemory().offered).toBe(false);

    act(() => releaseSlot("return", ticket ?? undefined));
    await wait(HOME_OFFER_DELAY_MS);
    expect(card()).not.toBeNull();
  });

  it("Telegram reports the icon added: `home_screen_added`, the card goes, «Значок HOMI добавлен на экран телефона»", async () => {
    await shown();
    act(() => fake?.emit("homeScreenAdded"));

    expect(card()).toBeNull();
    expect(state.track.mock.calls).toEqual([["home_screen_added"]]);
    expect(currentToast("app")?.message).toEqual({ key: "home.added" });
  });
});
