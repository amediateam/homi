import { getMessages } from "@homi/i18n";
import { act, cleanup, renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ContactData } from "@/features/listing/listingData";
import type { ActionResult } from "@/lib/actions/run";

const state = vi.hoisted(() => ({
  getContact: vi.fn<(input: { number: number }, auth?: unknown, locale?: string) => Promise<ActionResult<ContactData>>>(),
}));
vi.mock("@/lib/actions/listing", () => ({ getContact: state.getContact, translate: vi.fn(), prepareShare: vi.fn() }));

import {
  CONTACT_EXPIRY_MARGIN_MS,
  CONTACT_FRESH_MS,
  type ContactInfo,
  isStale,
  useContact,
} from "@/features/listing/cta/useContact";

import { contactOf } from "../helpers/details";

const MINUTE = 60_000;
const START = new Date("2026-11-17T10:00:00Z").getTime();

const UNAVAILABLE: ActionResult<ContactData> = {
  ok: false,
  error: "not_found",
  status: 404,
  code: "contact_unavailable",
  method: "POST",
  path: "listings/:number/contact",
};
const DOWN: ActionResult<ContactData> = {
  ok: false,
  error: "source_unavailable",
  status: 503,
  code: "source_unavailable",
  method: "POST",
  path: "listings/:number/contact",
};

function answer(overrides: Partial<ContactData> = {}): ActionResult<ContactData> {
  return { ok: true, data: contactOf(overrides), meta: { source: "stub" } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      {children}
    </NextIntlClientProvider>
  );
}

function contactHook(number = 100001, options?: { now?: () => number }) {
  return renderHook((current: number) => useContact(current, options), { initialProps: number, wrapper });
}

function setVisibility(hidden: boolean): void {
  Object.defineProperty(document, "visibilityState", { value: hidden ? "hidden" : "visible", configurable: true });
  Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers({ now: START });
  state.getContact.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setVisibility(false);
});

describe("isStale", () => {
  const contact = (overrides: Partial<ContactInfo> = {}): ContactInfo => ({
    phone: "+998000000067",
    phoneDisplay: "+998 00 000-00-67",
    url: "https://api.homi.loc/call/stub-token-100001",
    receivedAt: START,
    expiresAt: START + 10 * MINUTE,
    ...overrides,
  });

  it("is stale from two minutes before the contract's expiry", () => {
    expect(CONTACT_EXPIRY_MARGIN_MS).toBe(2 * MINUTE);
    expect(isStale(contact(), START + 8 * MINUTE - 1)).toBe(false);
    expect(isStale(contact(), START + 8 * MINUTE)).toBe(true);
    expect(isStale(contact({ expiresAt: START + 3 * MINUTE }), START + MINUTE - 1)).toBe(false);
    expect(isStale(contact({ expiresAt: START + 3 * MINUTE }), START + MINUTE)).toBe(true);
  });

  it("a readable expiry replaces the eight minutes: a 30-minute contact is fresh until 28 minutes", () => {
    expect(isStale(contact({ expiresAt: START + 30 * MINUTE }), START + 9 * MINUTE)).toBe(false);
    expect(isStale(contact({ expiresAt: START + 30 * MINUTE }), START + 28 * MINUTE - 1)).toBe(false);
    expect(isStale(contact({ expiresAt: START + 30 * MINUTE }), START + 28 * MINUTE)).toBe(true);
  });

  it("without an expiry, is stale eight minutes after the receipt", () => {
    expect(CONTACT_FRESH_MS).toBe(8 * MINUTE);
    expect(isStale(contact({ expiresAt: null }), START + 8 * MINUTE - 1)).toBe(false);
    expect(isStale(contact({ expiresAt: null }), START + 8 * MINUTE)).toBe(true);
  });

  it("an expiry already past or within the margin is stale at once", () => {
    expect(isStale(contact({ expiresAt: START + MINUTE }), START)).toBe(true);
    expect(isStale(contact({ expiresAt: START - MINUTE }), START)).toBe(true);
  });
});

describe("useContact (WP-26, DEC-52)", () => {
  it("asks for nothing on mount, after ten minutes without a tap, or on a return to the app", async () => {
    const { result } = contactHook();
    expect(result.current.contact).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * MINUTE);
    });
    setVisibility(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MINUTE);
    });
    setVisibility(false);
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("pageshow"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * MINUTE);
    });

    expect(state.getContact).not.toHaveBeenCalled();
    expect(result.current.contact).toBeNull();
  });

  it("the first reveal sends one request and holds the answer", async () => {
    state.getContact.mockResolvedValueOnce(answer());
    const { result } = contactHook();

    let revealed: ContactInfo | null = null;
    await act(async () => {
      revealed = await result.current.reveal();
    });

    expect(state.getContact.mock.calls).toEqual([[{ number: 100001 }, undefined, "ru"]]);
    const expected: ContactInfo = {
      phone: "+998000000067",
      phoneDisplay: "+998 00 000-00-67",
      url: "https://api.homi.loc/call/stub-token-100001",
      receivedAt: START,
      expiresAt: START + 10 * MINUTE,
    };
    expect(revealed).toEqual(expected);
    expect(result.current.contact).toEqual(expected);
  });

  it("a fresh contact is returned as it is, with no request", async () => {
    state.getContact.mockResolvedValueOnce(answer());
    const { result } = contactHook();
    let first: ContactInfo | null = null;
    await act(async () => {
      first = await result.current.reveal();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8 * MINUTE - 1);
    });
    let second: ContactInfo | null = null;
    await act(async () => {
      second = await result.current.reveal();
    });

    expect(second).toBe(first);
    expect(state.getContact).toHaveBeenCalledTimes(1);
  });

  it("the stub's ten-minute contact, stale two minutes before it expires, is fetched again on the next tap", async () => {
    state.getContact.mockResolvedValueOnce(answer());
    const { result } = contactHook();
    await act(async () => {
      await result.current.reveal();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8 * MINUTE);
    });
    expect(state.getContact).toHaveBeenCalledTimes(1);
    state.getContact.mockResolvedValueOnce(answer({ call_url: "https://api.homi.loc/call/stub-token-fresh" }));
    let fresh: ContactInfo | null = null;
    await act(async () => {
      fresh = await result.current.reveal();
    });

    expect(state.getContact).toHaveBeenCalledTimes(2);
    expect(fresh).toMatchObject({ url: "https://api.homi.loc/call/stub-token-fresh", receivedAt: START + 8 * MINUTE });
    expect(result.current.contact).toBe(fresh);
  });

  it("a contact stale by the contract's expiry is fetched again on the next tap", async () => {
    state.getContact.mockResolvedValueOnce(answer({ expires_at: new Date(START + 3 * MINUTE).toISOString() }));
    const { result } = contactHook();
    await act(async () => {
      await result.current.reveal();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MINUTE - 1);
      await result.current.reveal();
    });
    expect(state.getContact).toHaveBeenCalledTimes(1);

    state.getContact.mockResolvedValueOnce(answer());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await result.current.reveal();
    });
    expect(state.getContact).toHaveBeenCalledTimes(2);
  });

  it("a contact valid for 30 minutes is not fetched again after eight; it is two minutes before its expiry", async () => {
    state.getContact.mockResolvedValue(answer({ expires_at: new Date(START + 30 * MINUTE).toISOString() }));
    const { result } = contactHook();
    await act(async () => {
      await result.current.reveal();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9 * MINUTE);
      await result.current.reveal();
    });
    expect(state.getContact).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(19 * MINUTE);
      await result.current.reveal();
    });
    expect(state.getContact).toHaveBeenCalledTimes(2);
  });

  it("an unreadable expiry falls back to eight minutes after the receipt", async () => {
    state.getContact.mockResolvedValueOnce(answer({ expires_at: "soon" }));
    const { result } = contactHook();
    await act(async () => {
      await result.current.reveal();
    });
    expect(result.current.contact?.expiresAt).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8 * MINUTE - 1);
      await result.current.reveal();
    });
    expect(state.getContact).toHaveBeenCalledTimes(1);

    state.getContact.mockResolvedValueOnce(answer());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await result.current.reveal();
    });
    expect(state.getContact).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["an error answer", () => Promise.resolve(DOWN)],
    ["a rejected action", () => Promise.reject(new Error("network"))],
  ])("a failed refetch (%s) returns the old contact and keeps it", async (_name, failure) => {
    state.getContact.mockResolvedValueOnce(answer());
    const { result } = contactHook();
    let old: ContactInfo | null = null;
    await act(async () => {
      old = await result.current.reveal();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9 * MINUTE);
    });
    state.getContact.mockImplementationOnce(failure);
    let again: ContactInfo | null = null;
    await act(async () => {
      again = await result.current.reveal();
    });

    expect(state.getContact).toHaveBeenCalledTimes(2);
    expect(again).toBe(old);
    expect(result.current.contact).toBe(old);
  });

  it("two concurrent taps share one request", async () => {
    const pending = deferred<ActionResult<ContactData>>();
    state.getContact.mockReturnValueOnce(pending.promise);
    const { result } = contactHook();

    const first = result.current.reveal();
    const second = result.current.reveal();
    expect(state.getContact).toHaveBeenCalledTimes(1);

    await act(async () => pending.resolve(answer()));

    const [a, b] = await Promise.all([first, second]);
    expect(a).not.toBeNull();
    expect(b).toBe(a);

    state.getContact.mockResolvedValueOnce(answer());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8 * MINUTE);
      await Promise.all([result.current.reveal(), result.current.reveal()]);
    });
    expect(state.getContact).toHaveBeenCalledTimes(2);
  });

  it("contact_unavailable gives no contact, and the next tap asks again", async () => {
    state.getContact.mockResolvedValueOnce(UNAVAILABLE);
    const { result } = contactHook();
    let found: ContactInfo | null | undefined;
    await act(async () => {
      found = await result.current.reveal();
    });
    expect(found).toBeNull();
    expect(result.current.contact).toBeNull();

    state.getContact.mockResolvedValueOnce(answer());
    await act(async () => {
      found = await result.current.reveal();
    });
    expect(state.getContact).toHaveBeenCalledTimes(2);
    expect(found).not.toBeNull();
  });

  it("an answer without a number keeps the call link and null phone fields", async () => {
    state.getContact.mockResolvedValueOnce(answer({ phone: null, phone_display: null }));
    const { result } = contactHook();
    await act(async () => {
      await result.current.reveal();
    });

    expect(result.current.contact).toMatchObject({ phone: null, phoneDisplay: null, url: "https://api.homi.loc/call/stub-token-100001" });
  });

  it("reads the time from `now` when given", async () => {
    let clock = 1_000_000;
    state.getContact.mockResolvedValue(answer({ expires_at: "" }));
    const { result } = contactHook(100001, { now: () => clock });
    await act(async () => {
      await result.current.reveal();
    });
    expect(result.current.contact?.receivedAt).toBe(1_000_000);

    clock += 8 * MINUTE - 1;
    await act(async () => {
      await result.current.reveal();
    });
    expect(state.getContact).toHaveBeenCalledTimes(1);

    clock += 1;
    await act(async () => {
      await result.current.reveal();
    });
    expect(state.getContact).toHaveBeenCalledTimes(2);
  });

  it("a contact belongs to its number: another number starts empty and asks for its own", async () => {
    state.getContact.mockResolvedValue(answer());
    const { result, rerender } = contactHook(100001);
    await act(async () => {
      await result.current.reveal();
    });
    expect(result.current.contact).not.toBeNull();

    rerender(100021);
    expect(result.current.contact).toBeNull();
    await act(async () => {
      await result.current.reveal();
    });
    expect(state.getContact.mock.calls.map(([input]) => input)).toEqual([{ number: 100001 }, { number: 100021 }]);
  });
});
