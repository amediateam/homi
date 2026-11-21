import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/actions/run";

const state = vi.hoisted(() => ({
  setMode: vi.fn<(input: unknown) => Promise<ActionResult<unknown>>>(),
  publish: vi.fn<(input: unknown) => Promise<ActionResult<unknown>>>(),
  requestPhone: vi.fn<(input: unknown) => Promise<ActionResult<unknown>>>(),
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  closeThen: vi.fn(async () => undefined),
  flush: vi.fn(async () => ({ ok: true as const })),
}));
vi.mock("@/lib/api/browser", () => ({ bffFetch: () => new Promise(() => undefined) }));
vi.mock("@/lib/session/bootstrap", () => ({ refresh: vi.fn(async () => undefined), reauthenticate: vi.fn() }));
vi.mock("@/lib/actions/owner", () => ({
  setContactMode: (input: unknown) => state.setMode(input),
  publishOwnerListing: (input: unknown) => state.publish(input),
  requestOwnerPhone: (input: unknown) => state.requestPhone(input),
}));
vi.mock("@/lib/actions/useAction", () => ({ useAction: (action: (input: unknown) => unknown) => (input: unknown) => action(input) }));
vi.mock("@/lib/navigation/nav", () => ({ nav: { replace: state.replace, push: state.push, back: state.back, tab: vi.fn() } }));
vi.mock("@/lib/navigation/closeThen", () => ({ closeThen: state.closeThen }));

import { OwnerFormContext, type OwnerFormValue } from "@/features/owner/form/context";
import { normalizeOwnerListing, type OwnerListingView } from "@/features/owner/normalize";
import { DoneStep } from "@/features/owner/steps/DoneStep";
import { recordDone, resetDone } from "@/features/owner/steps/doneKind";
import { ModeStep } from "@/features/owner/steps/ModeStep";
import { PhoneStep } from "@/features/owner/steps/PhoneStep";
import { resetResources } from "@/lib/data/useResource";
import { resetReference } from "@/lib/reference/useReference";

import { cityOf, feedReference } from "../helpers/reference";
import { withIntl } from "../settings/harness";

const ID = "01JF0000000000000000000004";
const ok = (data: unknown): ActionResult<unknown> => ({ ok: true, data, meta: { source: "stub" } });
const failure = (code: string, status = 409, detail?: Record<string, unknown>): ActionResult<unknown> =>
  ({ ok: false, error: status === 409 ? "conflict" : "server", status, code, ...(detail === undefined ? {} : { detail }), method: "POST", path: "p" }) as never;
const raw = (overrides: Record<string, unknown> = {}) => ({
  id: ID,
  status: "draft",
  contact_mode: "request",
  phone_set: true,
  phone_display: "+998 90 *** ** 67",
  photos: [{ id: "01JF0000000000000000000101", url: "https://cdn.test/1.jpg" }],
  form: { city: "tashkent", district_code: "yunusabad", rooms: 2, price: 600, currency: "USD" },
  ...overrides,
});

let fake: FakeTelegram | null = null;
const button = (action: string) => document.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;

function inForm(listing: OwnerListingView, children: React.ReactNode) {
  const value: OwnerFormValue = { listing, form: listing.form, edit: vi.fn(), restore: vi.fn(), flush: state.flush, current: () => listing.form };
  return withIntl(<OwnerFormContext value={value}>{children}</OwnerFormContext>);
}

beforeEach(() => {
  for (const mock of Object.values(state)) {
    mock.mockClear();
  }
  state.flush.mockResolvedValue({ ok: true });
  resetResources();
  resetDone();
  feedReference({ cities: [cityOf()], reference: { radars_enabled: true, bot: { username: "homi_bot", support_username: "homi_support" } } as never });
  fake = fakeTelegram({ version: "8.0", answers: { contact: true } });
});

afterEach(() => {
  cleanup();
  resetReference();
  fake?.uninstall();
  fake = null;
});

describe("ModeStep (WP-81, SCR-055, BR-APP-086, BR-APP-087)", () => {
  it("«Через HOMI» is chosen for a new listing; a tap on the other mode sends it; an error restores", async () => {
    state.setMode.mockResolvedValueOnce(failure("x", 500));
    render(inForm(normalizeOwnerListing(raw({ contact_mode: null }))!, <ModeStep />));
    expect(document.querySelector('[data-mode="request"]')?.getAttribute("aria-checked")).toBe("true");

    await act(async () => fireEvent.click(document.querySelector('[data-mode="phone"]')!));
    expect(state.setMode).toHaveBeenCalledWith({ id: ID, mode: "phone" });
    expect(document.querySelector('[data-mode="request"]')?.getAttribute("aria-checked")).toBe("true");
  });

  it("shows the preview with the owner's number masked for replay", () => {
    render(inForm(normalizeOwnerListing(raw())!, <ModeStep />));

    const phone = document.querySelector("[data-owner-phone]");
    expect(phone?.textContent).toBe("+998 90 *** ** 67");
    expect(phone?.classList.contains("ph-mask")).toBe(true);
    expect(phone?.classList.contains("ph-no-capture")).toBe(true);
  });

  it("publish flushes first, then opens the done step through closeThen", async () => {
    state.publish.mockResolvedValue(ok(raw({ status: "active", number: 10000013 })));
    render(inForm(normalizeOwnerListing(raw())!, <ModeStep />));
    await act(async () => fireEvent.click(button("publish")));

    expect(state.flush).toHaveBeenCalled();
    expect(state.publish).toHaveBeenCalledWith({ id: ID });
    expect(state.closeThen).toHaveBeenCalledWith(`/owner/${ID}/done`);
  });

  it("publish refusals: the limit and «Мои объявления», the phone step, the rejection", async () => {
    state.publish.mockResolvedValueOnce(failure("owner_limit", 409, { limit: "account", max: 2 }));
    const { unmount } = render(inForm(normalizeOwnerListing(raw())!, <ModeStep />));
    await act(async () => fireEvent.click(button("publish")));
    expect(document.querySelector("[data-footer-note]")?.textContent).toContain("до 2 квартир");
    expect(button("mine")).toBeTruthy();
    unmount();

    state.publish.mockResolvedValueOnce(failure("owner_phone_required"));
    render(inForm(normalizeOwnerListing(raw())!, <ModeStep />));
    await act(async () => fireEvent.click(button("publish")));
    expect(state.replace).toHaveBeenCalledWith(`/owner/${ID}/phone`);
  });

  it("an edit says «Готово», sends no publish and shows the done step", async () => {
    render(inForm(normalizeOwnerListing(raw({ status: "paused", number: 10000009 }))!, <ModeStep />));
    expect(button("edit-done").textContent).toContain("Готово");
    await act(async () => fireEvent.click(button("edit-done")));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 1000)));

    expect(state.publish).not.toHaveBeenCalled();
    expect(state.closeThen).toHaveBeenCalledWith(`/owner/${ID}/done`);
  });
});

describe("DoneStep (WP-81, SCR-056)", () => {
  it("a new listing: the celebration, own.doneText with radars on", () => {
    recordDone(ID, "new");
    render(inForm(normalizeOwnerListing(raw({ status: "active" }))!, <DoneStep />));

    expect(document.querySelectorAll("[data-confetti-piece]")).toHaveLength(12);
    expect(document.querySelector('[data-done="new"]')?.textContent).toContain("уже уходит тем, у кого включён радар");
  });

  it("a held publish: «На проверке», no confetti, never a reason", () => {
    recordDone(ID, "held");
    render(inForm(normalizeOwnerListing(raw({ status: "paused", held: true, hold_reason: "realtor_check" }))!, <DoneStep />));

    expect(document.querySelector("[data-owner-title]")?.textContent).toBe("На проверке");
    expect(document.querySelectorAll("[data-confetti-piece]")).toHaveLength(0);
    expect(document.body.textContent).not.toContain("realtor");
  });

  it("an edit: «Сохранили», confetti only after a mascot tap", () => {
    recordDone(ID, "edit");
    render(inForm(normalizeOwnerListing(raw({ status: "active" }))!, <DoneStep />));
    expect(document.querySelector("[data-owner-title]")?.textContent).toBe("Сохранили");
    expect(document.querySelectorAll("[data-confetti-piece]")).toHaveLength(0);

    fireEvent.click(button("mascot"));
    expect(document.querySelectorAll("[data-confetti-piece]")).toHaveLength(12);
  });
});

describe("PhoneStep (WP-81, SCR-053, SCR-054)", () => {
  it("a tap opens the bot's window, then asks Telegram for the contact and waits", async () => {
    state.requestPhone.mockResolvedValue(ok(raw({ phone_set: false })));
    render(inForm(normalizeOwnerListing(raw({ phone_set: false }))!, <PhoneStep />));
    expect(document.querySelector("[data-phone-kept]")?.getAttribute("data-legal-review")).toBe("pending");
    await act(async () => fireEvent.click(button("share-phone")));

    expect(state.requestPhone).toHaveBeenCalledWith({ id: ID });
    expect(fake!.calls.some((call) => call.member === "requestContact")).toBe(true);
  });

  it("an old client shows own.phoneOldTg («Открыть бот» hidden without the bot's name); a decline shows the denied text", async () => {
    fake?.uninstall();
    fake = fakeTelegram({ version: "6.2" });
    state.requestPhone.mockResolvedValue(ok(raw({ phone_set: false })));
    const { unmount } = render(inForm(normalizeOwnerListing(raw({ phone_set: false }))!, <PhoneStep />));
    await act(async () => fireEvent.click(button("share-phone")));
    expect(document.querySelector('[data-phone-state="old"]')?.textContent).toContain("не умеет делиться номером");
    // `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` is not set here: `botStartUrl` is `null` and the button is hidden.
    expect(document.querySelector('[data-action="open-bot"]')).toBeNull();
    unmount();

    fake.uninstall();
    fake = fakeTelegram({ version: "8.0", answers: { contact: false } });
    render(inForm(normalizeOwnerListing(raw({ phone_set: false }))!, <PhoneStep />));
    await act(async () => fireEvent.click(button("share-phone")));
    expect(document.querySelector('[data-phone-state="denied"]')).toBeTruthy();
  });

  it("an inline error for phone_error; a rejected listing shows the rejection state with the support button", () => {
    const { unmount } = render(inForm(normalizeOwnerListing(raw({ phone_set: false, phone_error: "not_uz" }))!, <PhoneStep />));
    expect(document.querySelector('[data-phone-error="not_uz"]')?.textContent).toContain("узбекский номер");
    unmount();

    render(inForm(normalizeOwnerListing(raw({ status: "rejected", reject_reason: "limit" }))!, <PhoneStep />));
    expect(document.querySelector("[data-owner-title]")?.textContent).toBe("Не получилось");
    expect(document.querySelector('[data-reject-reason="limit"]')?.textContent).toContain("2 квартиры");
    expect(button("support")).toBeTruthy();
    expect(button("mine")).toBeTruthy();
  });
});
