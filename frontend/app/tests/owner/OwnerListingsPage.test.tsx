import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/actions/run";

const state = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  setStatus: vi.fn<(input: unknown) => Promise<ActionResult<unknown>>>(),
  remove: vi.fn<(input: unknown) => Promise<ActionResult<unknown>>>(),
  confirm: vi.fn(async () => true),
  toast: vi.fn(),
  refresh: vi.fn(async () => undefined),
  list: null as unknown,
  reads: 0,
  search: "",
}));

vi.mock("@/lib/session/bootstrap", () => ({ refresh: state.refresh, reauthenticate: vi.fn() }));
vi.mock("@/lib/session/SessionProvider", () => {
  const session = () => ({ status: "ready", me: { owner: { pending: 2, has_listings: true, waitlisted: false } } });
  return { useSession: session, useOptionalSession: session };
});
vi.mock("@/lib/api/browser", () => ({
  bffFetch: async () => {
    state.reads += 1;
    return state.list === null ? { ok: false, error: "server", status: 500, method: "GET", path: "owner/listings" } : { ok: true, data: state.list, meta: { source: "stub" } };
  },
}));
vi.mock("@/lib/actions/owner", () => ({ setOwnerStatus: (input: unknown) => state.setStatus(input), deleteOwnerListing: (input: unknown) => state.remove(input) }));
vi.mock("@/lib/actions/useAction", () => ({ useAction: (action: (input: unknown) => unknown) => (input: unknown) => action(input) }));
vi.mock("@/lib/navigation/nav", () => ({ nav: { push: state.push, replace: state.replace, back: vi.fn(), tab: vi.fn() } }));
vi.mock("@/lib/ui/confirm", () => ({ confirmText: state.confirm }));
vi.mock("@/lib/ui/toast", () => ({ showToast: state.toast }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.search) }));
vi.mock("@/features/shell/SubPage", () => ({
  SubPage: ({ title, children, ...rest }: { title: string; children: React.ReactNode }) => (
    <section data-subpage-title={title} {...rest}>
      {children}
    </section>
  ),
}));

import { OwnerListingsPage } from "@/features/owner/lists/OwnerListingsPage";
import { resetResources } from "@/lib/data/useResource";
import { resetReference } from "@/lib/reference/useReference";

import { cityOf, feedReference } from "../helpers/reference";
import { withIntl } from "../settings/harness";

const id = (n: number) => `01JF00000000000000000000${String(n).padStart(2, "0")}`;
const item = (n: number, status: string, fields: Record<string, unknown> = {}, stats: Record<string, unknown> | null = null) => ({
  id: id(n),
  number: status === "draft" || status === "rejected" ? null : 10_000_000 + n,
  status,
  withdrawn: false,
  held: false,
  hold_reason: null,
  published_at: "2026-11-10T07:00:00Z",
  photos: [],
  form: { city: "tashkent", district_code: null, landmark: "Чиланзар-9", room: false, rooms: 2, price: 500, currency: "USD" },
  stats: stats === null && status !== "draft" ? { pending: 0, requests: 0, given: 0, sent: 40, opened: 12, favorites: 0, days_listed: 11, daily: [0, 0, 0, 0, 0, 0, 0], price_delta: null, price_tone: null } : stats,
  reject_reason: status === "rejected" ? "limit" : null,
  ...fields,
});
const pendingStats = { pending: 2, requests: 4, given: 1, sent: 61, opened: 30, favorites: 5, days_listed: 3, daily: [0, 0, 0, 0, 0, 12, 29], price_delta: -12, price_tone: "good" };
const listOf = (items: unknown[], extra: Record<string, unknown> = {}) => ({ items, max: 2, can_add: true, past: 0, ...extra });

let fake: FakeTelegram | null = null;
const card = (n: number) => document.querySelector<HTMLElement>(`[data-owner-card="${id(n)}"]`);
const action = (n: number, name: string) => card(n)?.querySelector<HTMLButtonElement>(`[data-action="${name}"]`) ?? null;
const ids = () => [...document.querySelectorAll("[data-owner-card]")].map((node) => node.getAttribute("data-owner-card"));
const tabButton = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="radio"], button')].find((node) => node.textContent?.startsWith(label))!;

async function mount(cabinetOn = true) {
  feedReference({ cities: [cityOf()], reference: { owner_enabled: cabinetOn, bot: { username: "homi_bot", support_username: "homi_support" } } as never });
  render(withIntl(<OwnerListingsPage />));
  await act(async () => undefined);
}

beforeEach(() => {
  for (const mock of [state.push, state.replace, state.setStatus, state.remove, state.toast, state.refresh]) {
    mock.mockClear();
  }
  state.confirm.mockReset();
  state.confirm.mockResolvedValue(true);
  state.reads = 0;
  state.search = "";
  state.list = listOf([item(1, "draft"), item(3, "active", {}, pendingStats), item(5, "paused"), item(8, "rented"), item(9, "rejected"), item(6, "paused", { held: true, hold_reason: "votes_agent" }), item(7, "active", { withdrawn: true })], { can_add: false, past: 3 });
  resetResources();
  fake = fakeTelegram({ version: "8.0" });
});

afterEach(() => {
  cleanup();
  resetReference();
  fake?.uninstall();
  fake = null;
});

describe("«Мои объявления» (WP-82, SCR-057)", () => {
  it("splits «Актуальные» and «История», with the red dot on the tab that holds requests waiting", async () => {
    await mount();
    expect(ids()).toEqual([id(1), id(3), id(5), id(9), id(6)]);
    expect(tabButton("Актуальные").querySelector("[data-tab-dot]")).not.toBeNull();
    expect(tabButton("История").querySelector("[data-tab-dot]")).toBeNull();

    fireEvent.click(tabButton("История"));
    expect(ids()).toEqual([id(8), id(7)]);
  });

  it("draws the chips, the stats, the notes and the rejected reason; never a hold reason", async () => {
    await mount();
    expect(card(3)?.querySelector("[data-owner-status]")?.textContent).toMatch(/^Сдаётся · \d+ (день|дня|дней)$/);
    expect(card(3)?.querySelector("[data-owner-new-requests]")?.textContent).toBe("2 новых отклика");
    expect(card(3)?.querySelector("[data-owner-stats]")?.textContent).toBe("61 получили по радару · 30 открыли · 5 в избранном");
    expect(card(3)?.querySelector("[data-price-delta]")?.textContent).toBe("−12 %");
    expect(card(5)?.querySelector("[data-owner-stats]")?.textContent).toBe("40 получили по радару · 12 открыли");
    expect(card(1)?.querySelector("[data-owner-stats]")).toBeNull();
    expect(card(6)?.querySelector("[data-owner-status]")?.textContent).toBe("На проверке");
    expect(card(6)?.textContent).not.toMatch(/риелтор/i);
    expect(card(9)?.querySelector("[data-owner-reason]")?.textContent).toBe("С этим номером уже сдаются 2 квартиры.");

    fireEvent.click(tabButton("История"));
    expect(card(7)?.querySelector("[data-owner-status]")?.textContent).toBe("Снято с публикации");
    expect(card(7)?.querySelector("[data-owner-note]")?.textContent).toMatch(/^Объявление сняли с публикации/);
  });

  it("a tap on a draft opens the form, on a published listing its page; a tap on a button is not a tap on the card", async () => {
    await mount();
    fireEvent.click(card(1)!.querySelector('[role="button"]')!);
    expect(state.push).toHaveBeenLastCalledWith(`/owner/${id(1)}`);
    fireEvent.click(card(3)!.querySelector('[role="button"]')!);
    expect(state.push).toHaveBeenLastCalledWith("/listing/10000003");
    fireEvent.click(action(3, "requests")!);
    expect(state.push).toHaveBeenLastCalledWith(`/settings/owner/${id(3)}/requests`);
    expect(state.push).toHaveBeenCalledTimes(3);
  });

  it("«Пауза» sends the change at once, replaces the card with the answer, toasts and invalidates", async () => {
    state.setStatus.mockImplementationOnce(async () => {
      // The server's list after the change, which the invalidation reads again.
      const list = state.list as { items: { id: string; status: string }[] };
      state.list = { ...list, items: list.items.map((entry) => (entry.id === id(3) ? { ...entry, status: "paused" } : entry)) };
      return { ok: true, data: item(3, "paused", {}, pendingStats), meta: { source: "stub" } } as never;
    });
    await mount();
    await act(async () => fireEvent.click(action(3, "pause")!));

    expect(state.confirm).not.toHaveBeenCalled();
    expect(state.setStatus).toHaveBeenCalledWith({ id: id(3), status: "paused" });
    expect(state.toast).toHaveBeenCalledWith({ key: "own.toast.paused" });
    expect(action(3, "resume")).not.toBeNull();
    expect(state.refresh).toHaveBeenCalled();
  });

  it("«Сдано» confirms first; a refusal of the confirm sends nothing", async () => {
    state.confirm.mockResolvedValueOnce(false);
    await mount();
    await act(async () => fireEvent.click(action(3, "rented")!));
    expect(state.confirm).toHaveBeenCalledWith(expect.stringMatching(/^Отметить «Сдано»\?/));
    expect(state.setStatus).not.toHaveBeenCalled();
  });

  it("«Удалить» of a rejected listing asks «Удалить объявление?» and drops the card", async () => {
    state.remove.mockImplementationOnce(async () => {
      const list = state.list as { items: { id: string }[] };
      state.list = { ...list, items: list.items.filter((entry) => entry.id !== id(9)) };
      return { ok: true, data: null, meta: { source: "stub" } } as never;
    });
    await mount();
    await act(async () => fireEvent.click(action(9, "delete")!));
    expect(state.confirm).toHaveBeenCalledWith("Удалить объявление?");
    expect(state.toast).toHaveBeenCalledWith({ key: "own.toast.deleted" });
    expect(card(9)).toBeNull();
  });

  it("a locked answer reads the list again; an offline one says so", async () => {
    state.setStatus.mockResolvedValueOnce({ ok: false, error: "conflict", status: 409, code: "owner_listing_locked", method: "PUT", path: "p" } as never);
    await mount();
    const before = state.reads;
    await act(async () => fireEvent.click(action(5, "resume")!));
    expect(state.reads).toBe(before + 1);
    expect(state.toast).toHaveBeenCalledWith({ key: "common.saveFailed" });

    state.setStatus.mockResolvedValueOnce({ ok: false, error: "offline", status: 0, method: "PUT", path: "p" } as never);
    await act(async () => fireEvent.click(action(5, "resume")!));
    expect(state.toast).toHaveBeenLastCalledWith({ key: "own.actionOffline" });
  });

  it("«+ Сдать ещё одну квартиру»: the limit sheet at the limit, the foot line with the max", async () => {
    await mount();
    fireEvent.click(document.querySelector('[data-action="add-another"]')!);
    expect(state.push).toHaveBeenLastCalledWith("/owner/limit?where=mine");
    expect(document.querySelector("[data-owner-foot]")?.textContent).toBe("Можно сдавать до 2 квартир сразу.");
  });

  it("with the cabinet off: no «Продолжить», «Вернуть», no add row, and a draft's card does not open (DEC-81)", async () => {
    await mount(false);
    expect(action(1, "continue")).toBeNull();
    expect(action(1, "delete")).not.toBeNull();
    expect(action(5, "resume")).toBeNull();
    expect(action(5, "rented")).not.toBeNull();
    expect(document.querySelector('[data-action="add-another"]')).toBeNull();
    fireEvent.click(card(1)!.querySelector("div")!);
    expect(state.push).not.toHaveBeenCalled();
  });

  it("the empty texts: «С возвращением!» with only past listings, else the HOMI text; «История» its own", async () => {
    state.list = listOf([], { past: 3 });
    await mount();
    expect(document.querySelector('[data-owner-list-empty="current"]')?.textContent).toBe("С возвращением! Вы уже размещали у нас квартир: 3");

    cleanup();
    resetResources();
    state.list = listOf([]);
    await mount();
    expect(document.querySelector('[data-owner-list-empty="current"]')?.textContent).toBe("Здесь появятся квартиры, которые вы сдаёте через HOMI.");
    fireEvent.click(tabButton("История"));
    expect(document.querySelector('[data-owner-list-empty="past"]')?.textContent).toBe("Здесь будут квартиры, которые вы сдали или сняли.");
  });

  it("?focus=<id> opens the tab of that listing and leaves the address", async () => {
    state.search = `focus=${id(8)}`;
    await mount();
    expect(ids()).toEqual([id(8), id(7)]);
    expect(state.replace).toHaveBeenCalledWith("/settings/owner");
  });

  it("a failed first read shows the error with «Повторить»", async () => {
    state.list = null;
    await mount();
    expect(document.querySelector("[data-owner-card]")).toBeNull();
    expect(document.body.textContent).toMatch(/Повторить/);
  });
});
