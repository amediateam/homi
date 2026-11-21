import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  tab: vi.fn(),
  push: vi.fn(),
  track: vi.fn(),
  refresh: vi.fn(async () => undefined),
  owner: { pending: 2, has_listings: true, waitlisted: false },
  pathname: "/",
  list: { items: [] as unknown[], max: 2, can_add: true, past: 0 },
}));

vi.mock("@/lib/session/SessionProvider", () => {
  const session = () => ({ status: "ready", me: { owner: state.owner } });
  return { useSession: session, useOptionalSession: session };
});
vi.mock("@/lib/session/bootstrap", () => ({
  refresh: state.refresh,
  reauthenticate: vi.fn(),
  getSession: () => ({ status: "ready", me: { owner: state.owner } }),
}));
vi.mock("@/lib/api/browser", () => ({ bffFetch: async () => ({ ok: true, data: state.list, meta: { source: "stub" } }) }));
vi.mock("@/lib/navigation/nav", () => ({
  nav: {
    tab: (href: string) => {
      state.tab(href);
      window.history.replaceState(null, "", `/ru${href}`);
    },
    push: state.push,
    replace: vi.fn(),
    back: vi.fn(),
  },
}));
vi.mock("@/lib/analytics/events", () => ({ track: state.track }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("") }));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => state.pathname }));

import { OwnerSignals } from "@/features/owner/signals/OwnerSignals";
import { resetAttention } from "@/features/owner/signals/attention";
import { TabBar } from "@/features/shell/TabBar";
import { resetResources } from "@/lib/data/useResource";
import { storageSet } from "@/lib/storage";

import { withIntl } from "../settings/harness";

const PENDING = "01JF0000000000000000000003";
let fake: FakeTelegram | null = null;
const tip = () => document.querySelector('[data-request-tip="tab"]');
const events = () => state.track.mock.calls.filter(([name]) => name === "owner_attention").map(([, props]) => props);

async function mount(settingsTab = false) {
  render(withIntl(<OwnerSignals settingsTab={settingsTab} pathname={state.pathname} />));
  await act(async () => undefined);
}

beforeEach(() => {
  for (const mock of [state.tab, state.push, state.track, state.refresh]) {
    mock.mockClear();
  }
  state.owner = { pending: 2, has_listings: true, waitlisted: false };
  state.pathname = "/";
  state.list = { items: [{ id: "01JF0000000000000000000001", status: "draft", form: {}, photos: [] }, { id: PENDING, status: "active", form: {}, photos: [], stats: { pending: 2 } }], max: 2, can_add: true, past: 0 };
  window.localStorage.clear();
  window.history.replaceState(null, "", "/ru");
  resetResources();
  resetAttention();
  fake = fakeTelegram({ version: "8.0" });
});

afterEach(() => {
  cleanup();
  fake?.uninstall();
  fake = null;
});

describe("the tab tip (WP-82, SCR-060, DEV-059)", () => {
  it("shows while requests wait, off the Settings tab, with the coach event once per launch", async () => {
    await mount();
    expect(tip()?.textContent).toContain("Пришёл первый отклик!");
    expect(events()).toEqual([{ what: "coach", action: "shown" }]);
  });

  it.each([
    ["the Settings tab", { settingsTab: true }],
    ["no request waiting", { pending: 0 }],
    ["a listing open", { pathname: "/listing/42" }],
    ["the owner form open", { pathname: "/owner/new" }],
    ["a filters sheet open", { pathname: "/filters" }],
  ])("hides on %s", async (_name, change: { settingsTab?: boolean; pending?: number; pathname?: string }) => {
    if (change.pending !== undefined) {
      state.owner = { ...state.owner, pending: change.pending };
    }
    state.pathname = change.pathname ?? "/";
    await mount(change.settingsTab ?? false);
    expect(tip()).toBeNull();
  });

  it("a tap presses the Settings tab, then opens «Мои объявления» on the first listing with requests", async () => {
    await mount();
    await act(async () => fireEvent.click(tip()!.querySelector('[data-action="tip-open"]')!));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    expect(state.tab).toHaveBeenCalledWith("/settings");
    expect(state.push).toHaveBeenCalledWith(`/settings/owner?focus=${PENDING}`);
    expect(events()).toContainEqual({ what: "coach", action: "clicked" });
  });

  it("«×» dismisses it for good and sends nothing; a done restored after the first render hides it too", async () => {
    await mount();
    fireEvent.click(tip()!.querySelector('[data-action="tip-close"]')!);
    expect(tip()).toBeNull();
    expect(window.localStorage.getItem("homi-req-tip")).toBe("done");
    expect(events()).toEqual([{ what: "coach", action: "shown" }]);

    cleanup();
    window.localStorage.clear();
    await mount();
    expect(tip()).not.toBeNull();
    // The DeviceStorage restore writes through the storage module, which tells every reader.
    act(() => storageSet("homi-req-tip", "done"));
    expect(tip()).toBeNull();
  });

  it("a return to the app reads GET /me again, only for a user with listings (default (a))", async () => {
    await mount();
    act(() => fake?.emit("visibilityChanged", { is_visible: true }));
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    const reads = state.refresh.mock.calls.length;
    expect(reads).toBeGreaterThan(0);

    cleanup();
    state.refresh.mockClear();
    state.owner = { pending: 0, has_listings: false, waitlisted: false };
    await mount();
    act(() => fake?.emit("visibilityChanged", { is_visible: true }));
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(state.refresh).not.toHaveBeenCalled();
  });
});

describe("the red dot of the Settings tab (SCR-060)", () => {
  it("shows while requests wait, named «ждут ответа: N»; dot shown once, clicked on a press of Settings", async () => {
    render(withIntl(<TabBar active="search" />));
    await act(async () => undefined);
    const settings = document.querySelector('[data-tab="settings"]')!;
    expect(settings.querySelector("[data-tab-dot]")?.getAttribute("data-tab-dot")).toBe("2");
    expect(settings.textContent).toContain("ждут ответа: 2");
    expect(events()).toEqual([{ what: "dot", action: "shown" }]);

    fireEvent.click(settings);
    expect(events()).toContainEqual({ what: "dot", action: "clicked" });
  });

  it("is absent with nothing waiting", async () => {
    state.owner = { pending: 0, has_listings: true, waitlisted: false };
    render(withIntl(<TabBar active="search" />));
    expect(document.querySelector("[data-tab-dot]")).toBeNull();
    expect(events()).toEqual([]);
  });
});
