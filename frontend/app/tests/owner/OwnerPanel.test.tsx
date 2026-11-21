import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/actions/run";

const state = vi.hoisted(() => ({
  push: vi.fn(),
  track: vi.fn(),
  setStatus: vi.fn<(input: unknown) => Promise<ActionResult<unknown>>>(),
  confirm: vi.fn(async () => true),
  toast: vi.fn(),
  listing: null as unknown,
  reads: 0,
}));

vi.mock("@/lib/session/bootstrap", () => ({ refresh: vi.fn(async () => undefined), reauthenticate: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({
  bffFetch: async (path: string) => {
    state.reads += 1;
    return state.listing === null ? { ok: false, error: "server", status: 500, method: "GET", path } : { ok: true, data: state.listing, meta: { source: "stub" } };
  },
}));
vi.mock("@/lib/actions/owner", () => ({ setOwnerStatus: (input: unknown) => state.setStatus(input), deleteOwnerListing: vi.fn() }));
vi.mock("@/lib/actions/useAction", () => ({ useAction: (action: (input: unknown) => unknown) => (input: unknown) => action(input) }));
vi.mock("@/lib/navigation/nav", () => ({ nav: { push: state.push, replace: vi.fn(), back: vi.fn(), tab: vi.fn() } }));
vi.mock("@/lib/analytics/events", () => ({ track: state.track }));
vi.mock("@/lib/ui/confirm", () => ({ confirmText: state.confirm }));
vi.mock("@/lib/ui/toast", () => ({ showToast: state.toast }));

import { OwnerPanel } from "@/features/owner/panel/OwnerPanel";
import { OwnerPanelFooter } from "@/features/owner/panel/OwnerPanelFooter";
import { resetAttention } from "@/features/owner/signals/attention";
import { resetResources } from "@/lib/data/useResource";
import { resetReference } from "@/lib/reference/useReference";

import { cityOf, feedReference } from "../helpers/reference";
import { withIntl } from "../settings/harness";

const ID = "01JF0000000000000000000003";
const NUMBER = 10000008;
const raw = (fields: Record<string, unknown> = {}, stats: Record<string, unknown> = {}) => ({
  id: ID,
  number: NUMBER,
  status: "active",
  withdrawn: false,
  held: false,
  published_at: "2026-11-18T07:00:00Z",
  photos: [{ id: "p1", url: "https://cdn.test/1.jpg" }],
  form: { city: "tashkent", rooms: 2, price: 600, currency: "USD", area_m2: 54, floor: null, renovation: null, description: null },
  stats: { pending: 2, requests: 4, given: 1, sent: 61, opened: 30, favorites: 5, days_listed: 3, daily: [0, 0, 0, 0, 0, 12, 29], price_delta: null, price_tone: null, ...stats },
  ...fields,
});

let fake: FakeTelegram | null = null;

async function mount(node: React.ReactNode, cabinetOn = true) {
  feedReference({ cities: [cityOf()], reference: { owner_enabled: cabinetOn, bot: { username: "homi_bot", support_username: "homi_support" } } as never });
  render(withIntl(node));
  await act(async () => undefined);
}

beforeEach(() => {
  for (const mock of [state.push, state.track, state.setStatus, state.toast]) {
    mock.mockReset();
  }
  state.confirm.mockResolvedValue(true);
  state.listing = raw();
  state.reads = 0;
  resetResources();
  resetAttention();
  fake = fakeTelegram({ version: "8.0" });
});

afterEach(() => {
  cleanup();
  resetReference();
  fake?.uninstall();
  fake = null;
});

describe("OwnerPanel (WP-82, SCR-059)", () => {
  it("draws the heading, the waiting row, the tiles, the week and the days; the banner events once per launch", async () => {
    await mount(<OwnerPanel listingId={ID} number={NUMBER} />);
    const panel = document.querySelector("[data-owner-panel]")!;
    expect(panel.textContent).toContain("Ваше объявление");
    expect(panel.textContent).toContain("Этот блок видите только вы.");
    expect(panel.querySelector('[data-action="answer"]')?.textContent).toContain("2 человека ждут ответа");
    expect(panel.querySelector('[data-owner-tile="requests"]')?.textContent).toContain("номер дали 1");
    expect(panel.querySelector("[data-owner-week]")?.getAttribute("data-owner-week")).toBe("41");
    expect(panel.querySelectorAll("[data-day]")).toHaveLength(7);
    expect(panel.querySelector("[data-owner-listed]")?.textContent).toBe("В HOMI 3 дня");
    expect(state.track).toHaveBeenCalledWith("owner_attention", { what: "banner", action: "shown" });

    fireEvent.click(panel.querySelector('[data-action="answer"]')!);
    fireEvent.click(panel.querySelector('[data-action="answer"]')!);
    expect(state.push).toHaveBeenCalledWith(`/listing/${NUMBER}/requests`);
    expect(state.track.mock.calls.filter(([, props]) => (props as { action: string }).action === "clicked")).toHaveLength(1);
  });

  it("the fill hints: «n из 5», the open items first, a tap opens the form on the field with the event", async () => {
    await mount(<OwnerPanel listingId={ID} number={NUMBER} />);
    const filled = document.querySelector("[data-owner-filled]")!;
    // The rolling number (BR-APP-113) names itself; its strip of digits is hidden.
    expect(filled.querySelector('[data-slot="roll-number"]')?.getAttribute("aria-label")).toBe("1");
    expect(filled.textContent).toMatch(/ из 5$/);
    expect([...document.querySelectorAll("[data-hint]")].map((node) => node.getAttribute("data-hint"))).toEqual(["photos", "floor", "renovation", "description", "area_m2"]);
    fireEvent.click(document.querySelector('[data-hint="floor"]')!);
    expect(state.track).toHaveBeenCalledWith("owner_hint_opened", { field: "floor" });
    expect(state.push).toHaveBeenCalledWith(`/owner/${ID}?focus=floor`);
  });

  it("no fill hints while the cabinet is off, or for a held listing; a held listing's note, never its reason", async () => {
    await mount(<OwnerPanel listingId={ID} number={NUMBER} />, false);
    expect(document.querySelector("[data-owner-hints]")).toBeNull();

    cleanup();
    resetResources();
    state.listing = raw({ status: "paused", held: true, hold_reason: "votes_agent" });
    await mount(<OwnerPanel listingId={ID} number={NUMBER} />);
    expect(document.querySelector("[data-owner-hints]")).toBeNull();
    expect(document.querySelector("[data-owner-note]")?.textContent).toMatch(/^Объявление проверяем/);
    expect(document.querySelector("[data-owner-panel]")?.textContent).not.toMatch(/риелтор/i);
  });

  it("a failed read shows the island with «Повторить»", async () => {
    state.listing = null;
    await mount(<OwnerPanel listingId={ID} number={NUMBER} />);
    expect(document.querySelector('[data-owner-panel="error"]')?.textContent).toMatch(/Повторить/);
  });
});

describe("OwnerPanelFooter (SCR-059, LB-APP-059, LB-APP-070)", () => {
  it("a manageable listing: «Отклики» with the badge, «Изменить», «Пауза», «Сдано», «Снять»", async () => {
    await mount(<OwnerPanelFooter listingId={ID} number={NUMBER} />);
    const actions = [...document.querySelectorAll("[data-owner-footer] [data-action]")].map((node) => node.getAttribute("data-action"));
    expect(actions).toEqual(["requests", "edit", "pause", "rented", "remove"]);
    expect(document.querySelector("[data-requests-badge]")?.textContent).toBe("2");
    fireEvent.click(document.querySelector('[data-action="edit"]')!);
    expect(state.push).toHaveBeenLastCalledWith(`/owner/${ID}`);
  });

  it("«Снять» confirms, toasts and reads the owner listing again without clearing the footer", async () => {
    state.setStatus.mockImplementationOnce(async () => {
      state.listing = raw({ status: "removed" });
      return { ok: true, data: raw({ status: "removed" }), meta: { source: "stub" } } as never;
    });
    await mount(<OwnerPanelFooter listingId={ID} number={NUMBER} />);
    const before = state.reads;
    await act(async () => fireEvent.click(document.querySelector('[data-action="remove"]')!));
    expect(state.confirm).toHaveBeenCalledWith("Снять объявление?");
    expect(state.toast).toHaveBeenCalledWith({ key: "own.toast.removed" });
    expect(state.reads).toBeGreaterThan(before);
    expect(document.querySelector("[data-owner-footer]")).not.toBeNull();
  });

  it("is never empty: a let listing without requests while the cabinet is off, or a failed read, shows MineBar", async () => {
    state.listing = raw({ status: "rented" }, { requests: 0, pending: 0 });
    await mount(<OwnerPanelFooter listingId={ID} number={NUMBER} />, false);
    expect(document.querySelector("[data-mine-bar]")?.textContent).toContain("Это ваше объявление");

    cleanup();
    resetResources();
    state.listing = null;
    await mount(<OwnerPanelFooter listingId={ID} number={NUMBER} />);
    expect(document.querySelector("[data-mine-bar]")).not.toBeNull();
  });
});
