import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/actions/run";

const state = vi.hoisted(() => ({
  update: vi.fn<(input: { id: string; fields: Record<string, unknown> }) => Promise<ActionResult<unknown>>>(),
  push: vi.fn(),
  replace: vi.fn(),
  me: { city: "tashkent" } as { city: string | null } | null,
  query: "",
}));
vi.mock("@/lib/api/browser", () => ({ bffFetch: () => new Promise(() => undefined) }));
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: vi.fn(), reauthenticate: vi.fn(), patchMe: vi.fn(), refresh: vi.fn(async () => undefined) }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: "ready", me: state.me }) }));
vi.mock("@/lib/actions/owner", () => ({ updateOwnerListing: (input: { id: string; fields: Record<string, unknown> }) => state.update(input) }));
vi.mock("@/lib/actions/useAction", () => ({ useAction: (action: (input: unknown) => unknown) => (input: unknown) => action(input) }));
vi.mock("@/lib/navigation/nav", () => ({ nav: { push: state.push, replace: state.replace, back: vi.fn(), tab: vi.fn() } }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.query) }));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => "/owner/01JF0000000000000000000004" }));

import { Questionnaire } from "@/features/owner/form/Questionnaire";
import { normalizeOwnerListing } from "@/features/owner/normalize";
import { resetResources } from "@/lib/data/useResource";
import { resetReference } from "@/lib/reference/useReference";
import { currentToast, dismissToast } from "@/lib/ui/toast";

import { cityOf, feedReference } from "../helpers/reference";
import { withIntl } from "../settings/harness";

const ID = "01JF0000000000000000000004";
const listingOf = (overrides: Record<string, unknown> = {}, form: Record<string, unknown> = {}) =>
  normalizeOwnerListing({
    id: ID,
    status: "draft",
    photos: [{ id: "01JF0000000000000000000101", url: "https://cdn.test/1.jpg" }],
    phone_set: false,
    form: { city: "tashkent", district_code: "yunusabad", rooms: 2, price: 600, currency: "USD", ...form },
    ...overrides,
  })!;

let fake: FakeTelegram | null = null;
const ok: ActionResult<unknown> = { ok: true, data: { id: ID }, meta: { source: "stub" } };
const next = () => document.querySelector<HTMLButtonElement>('[data-action="next"]')!;
const note = () => document.querySelector("[data-footer-note]")?.textContent ?? null;
const notified = () => (fake?.calls ?? []).filter((call) => call.member === "HapticFeedback.notificationOccurred").map((call) => call.args[0]);

beforeEach(() => {
  vi.useFakeTimers();
  state.update.mockReset();
  state.update.mockResolvedValue(ok);
  state.push.mockReset();
  state.replace.mockReset();
  state.me = { city: "tashkent" };
  state.query = "";
  resetResources();
  feedReference({ cities: [cityOf(), cityOf({ code: "samarkand", name: "Самарканд", districts: [] })] });
  fake = fakeTelegram({ version: "8.0" });
});

afterEach(() => {
  cleanup();
  dismissToast("app");
  resetReference();
  fake?.uninstall();
  fake = null;
  vi.useRealTimers();
});

describe("Questionnaire (WP-81, SCR-052)", () => {
  it("renders the sections in order with the draft's title; «Дальше: подтвердить номер» without a phone", () => {
    render(withIntl(<Questionnaire listing={listingOf()} />));

    const order = [...document.querySelectorAll("[data-focus]")].map((node) => node.getAttribute("data-focus"));
    expect(order.slice(0, 4)).toEqual(["landmark", "photos", "city", "district_code"]);
    expect(document.querySelector("[data-owner-title]")?.textContent).toBe("Сдать квартиру");
    expect(next().textContent).toBe("Дальше: подтвердить номер");
  });

  it("an edit saves after 600 ms with the changed field only", async () => {
    render(withIntl(<Questionnaire listing={listingOf()} />));
    fireEvent.click(document.querySelector('[data-rooms="3"]')!);
    await act(() => vi.advanceTimersByTimeAsync(600));

    expect(state.update).toHaveBeenCalledWith({ id: ID, fields: { rooms: 3, room: false } });
  });

  it("a draft without a city takes the profile's", async () => {
    render(withIntl(<Questionnaire listing={listingOf({}, { city: null, district_code: null })} />));
    await act(() => vi.advanceTimersByTimeAsync(600));

    expect(state.update).toHaveBeenCalledWith({ id: ID, fields: { city: "tashkent" } });
  });

  it("«Дальше» with missing parts: the note names only them, they are highlighted, the warning haptic, no step", async () => {
    render(withIntl(<Questionnaire listing={listingOf({ photos: [] }, { price: null })} />));
    await act(async () => fireEvent.click(next()));

    expect(note()).toBe("Заполните: цену, фото");
    expect(document.querySelector('[data-focus="price"]')?.hasAttribute("data-invalid")).toBe(true);
    expect(notified()).toContain("warning");
    expect(state.push).not.toHaveBeenCalled();
  });

  it("«Дальше» when complete flushes, then pushes the phone step; with phone_set the mode step", async () => {
    const { unmount } = render(withIntl(<Questionnaire listing={listingOf()} />));
    await act(async () => fireEvent.click(next()));
    expect(state.push).toHaveBeenCalledWith(`/owner/${ID}/phone`);
    unmount();

    render(withIntl(<Questionnaire listing={listingOf({ phone_set: true })} />));
    expect(next().textContent).toBe("Дальше");
    await act(async () => fireEvent.click(next()));
    expect(state.push).toHaveBeenLastCalledWith(`/owner/${ID}/mode`);
  });

  it("a flush that fails keeps the form: the error haptic and the save-failed text", async () => {
    state.update.mockResolvedValue({ ok: false, error: "server", status: 500, method: "PATCH", path: "owner/listings/:id" });
    render(withIntl(<Questionnaire listing={listingOf()} />));
    fireEvent.click(document.querySelector('[data-rooms="4"]')!);
    await act(async () => fireEvent.click(next()));

    expect(notified()).toContain("error");
    expect(note()).toContain("Не получилось сохранить");
    expect(state.push).not.toHaveBeenCalled();
  });

  it("another city clears the district and the point and offers «Вернуть», which restores them (DEV-058)", async () => {
    render(withIntl(<Questionnaire listing={listingOf({}, { lat: 41.3, lon: 69.2 })} />));
    fireEvent.click(document.querySelector('[data-city="samarkand"]')!);
    const toast = currentToast("app");

    expect(toast?.message).toMatchObject({ text: "Район и точку сбросили", action: "Вернуть" });
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(state.update).toHaveBeenLastCalledWith({ id: ID, fields: { city: "samarkand", district_code: null, lat: null, lon: null } });

    await act(async () => (toast!.message as { run: () => void }).run());
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(state.update).toHaveBeenLastCalledWith({ id: ID, fields: { city: "tashkent", district_code: "yunusabad", lat: 41.3, lon: 69.2 } });
  });

  it("«5/9» in «Этаж» fills the floors; a floor above the floors shows own.floorBad", async () => {
    render(withIntl(<Questionnaire listing={listingOf()} />));
    fireEvent.change(document.querySelector('[data-field="floor"]')!, { target: { value: "5/9" } });
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(state.update).toHaveBeenLastCalledWith({ id: ID, fields: { floor: 5, floors_total: 9 } });

    fireEvent.change(document.querySelector('[data-field="floor"]')!, { target: { value: "12" } });
    expect(note()).toBe("Этаж не может быть выше, чем этажей в доме.");
  });

  it("?focus= highlights its element and drops the parameter", () => {
    state.query = "focus=description";
    render(withIntl(<Questionnaire listing={listingOf()} />));

    expect(document.querySelector('[data-focus="description"]')?.hasAttribute("data-highlight")).toBe(true);
    expect(state.replace).toHaveBeenCalledWith(`/owner/${ID}`);
  });

  it("a listing that is not a draft is an edit", () => {
    render(withIntl(<Questionnaire listing={listingOf({ status: "active", number: 10000008 })} />));

    expect(document.querySelector("[data-owner-title]")?.textContent).toBe("Изменить объявление");
  });
});
