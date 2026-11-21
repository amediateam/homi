import { getMessages } from "@homi/i18n";
import { fakeTelegram, type FakeTelegram, type TelegramPlatform } from "@homi/testing";
import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ContactData, ListingDetails } from "@/features/listing/listingData";
import type { ActionResult } from "@/lib/actions/run";

const state = vi.hoisted(() => ({
  getContact: vi.fn<(input: { number: number }, auth?: unknown, locale?: string) => Promise<ActionResult<ContactData>>>(),
}));
vi.mock("@/lib/actions/listing", () => ({ getContact: state.getContact, translate: vi.fn(), prepareShare: vi.fn() }));

import { ListingCtaBar } from "@/features/listing/cta/ListingCtaBar";
import { type ListingContactView, useListingContact } from "@/features/listing/cta/useContact";
import { AuthorSection } from "@/features/listing/sections/AuthorSection";
import { OriginalText } from "@/features/listing/sections/OriginalText";
import { clearTracked, recentTracked } from "@/lib/analytics/events";
import { LINK_DEBOUNCE_MS, TEL_DETECTION_MS } from "@/lib/telegram";
import { currentToast, dismissToast } from "@/lib/ui/toast";

import { contactOf, detailsOf } from "../helpers/details";

const MINUTE = 60_000;
const START = new Date("2026-11-17T10:00:00Z").getTime();
const PHONE = "+998000000067";
const DISPLAY = "+998 00 000-00-67";

const UNAVAILABLE: ActionResult<ContactData> = {
  ok: false,
  error: "not_found",
  status: 404,
  code: "contact_unavailable",
  method: "POST",
  path: "listings/:number/contact",
};
const DOWN: ActionResult<ContactData> = { ...UNAVAILABLE, error: "source_unavailable", status: 503, code: "source_unavailable" };

/**
 * `openLink` keeps the last address for its 1.5 s debounce across tests, and every test starts the clock at START
 * again, so each test opens addresses of its own.
 */
let seq = 0;
let callUrl = "";
let writeUrl = "";
let postUrl = "";
let fake: FakeTelegram | null = null;
let dialled: string[] = [];

function reply(overrides: Partial<ContactData> = {}): ActionResult<ContactData> {
  return { ok: true, data: contactOf({ call_url: callUrl, ...overrides }), meta: { source: "stub" } };
}

/** 100001 with a phone, a chat link and a post of this test's own. */
function listing(contact: Partial<ListingDetails["contact"]> = {}, original: Partial<ListingDetails["original"]> = {}): ListingDetails {
  const base = detailsOf();
  return detailsOf({
    contact: { has_phone: true, contact_url: writeUrl, contact_paid: false, mode: null, request: null, ...contact },
    original: { ...base.original, url: postUrl, ...original },
  });
}

const NO_PHONE = { has_phone: false };
const NO_CONTACT = { has_phone: false, contact_url: null };

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

function contactView(details: ListingDetails | null = listing(), number = 100001) {
  return renderHook(({ n, d }: { n: number; d: ListingDetails | null }) => useListingContact(n, d), {
    initialProps: { n: number, d: details },
    wrapper,
  });
}

function install(platform: TelegramPlatform = "ios"): FakeTelegram {
  fake?.uninstall();
  fake = fakeTelegram({ platform });
  return fake;
}

/** A tap and everything it awaits (the action, `tg.call` on platforms other than Android). */
async function press(tap: () => void): Promise<void> {
  await act(async () => {
    tap();
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function wait(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, "visibilityState", { value: hidden ? "hidden" : "visible", configurable: true });
  Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

const haptics = () =>
  (fake?.calls ?? [])
    .filter((entry) => entry.member.startsWith("HapticFeedback"))
    .map((entry) => String(entry.args[0]));
const opened = () =>
  (fake?.calls ?? [])
    .filter((entry) => entry.member === "openLink" || entry.member === "openTelegramLink")
    .map((entry) => entry.args[0]);
const events = () => [...recentTracked()];

beforeEach(() => {
  vi.useFakeTimers({ now: START });
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.homi.loc/api/v1");
  seq += 1;
  callUrl = `https://api.homi.loc/call/stub-token-${seq}`;
  writeUrl = `https://t.me/stub_author_${seq}`;
  postUrl = `https://t.me/stub_channel_a/${5000 + seq}`;
  state.getContact.mockReset();
  dialled = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    dialled.push(this.href);
  });
  install();
});

afterEach(() => {
  cleanup();
  dismissToast("app");
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fake?.uninstall();
  fake = null;
  clearTracked();
  setHidden(false);
});

describe("useListingContact: the phone control", () => {
  it("exists only while the listing has a phone, and shows no number before a tap", () => {
    expect(contactView(null).result.current.phone).toBeNull();
    expect(contactView(listing(NO_PHONE)).result.current.phone).toBeNull();

    const { phone } = contactView().result.current;
    expect(phone).toMatchObject({ display: null, tail: null });
    expect(state.getContact).not.toHaveBeenCalled();
  });

  it("«Показать номер»: medium haptic, one request, then the display number and its tail; nothing opens", async () => {
    state.getContact.mockResolvedValueOnce(reply());
    const { result } = contactView();

    await press(() => result.current.phone!.onReveal("author"));

    expect(haptics()).toEqual(["medium"]);
    expect(state.getContact.mock.calls).toEqual([[{ number: 100001 }, undefined, "ru"]]);
    expect(result.current.phone).toMatchObject({ display: DISPLAY, tail: "67" });
    expect(opened()).toEqual([]);
    expect(events()).toEqual([]);
  });

  it("the revealed number calls with src author, the one in the text with src text, without a second request", async () => {
    state.getContact.mockResolvedValueOnce(reply());
    const { result } = contactView();
    await press(() => result.current.phone!.onReveal("author"));

    await press(() => result.current.phone!.onCall("author"));
    await wait(LINK_DEBOUNCE_MS);
    await press(() => result.current.phone!.onCall("text"));

    expect(state.getContact).toHaveBeenCalledTimes(1);
    expect(haptics()).toEqual(["medium", "medium", "medium"]);
    expect(opened()).toEqual([callUrl, callUrl]);
    expect(events()).toStrictEqual([
      { name: "contact_call", props: { listing_id: 100001, via: "browser", src: "author" } },
      { name: "contact_call", props: { listing_id: 100001, via: "browser", src: "text" } },
    ]);
  });

  it("an answer without a number opens the call link with the control's src, and the button stays", async () => {
    state.getContact.mockResolvedValueOnce(reply({ phone: null, phone_display: null }));
    const { result } = contactView();

    await press(() => result.current.phone!.onReveal("author"));
    expect(result.current.phone).toMatchObject({ display: null, tail: null });
    await wait(LINK_DEBOUNCE_MS);
    await press(() => result.current.phone!.onReveal("text"));

    expect(state.getContact).toHaveBeenCalledTimes(1);
    expect(haptics()).toEqual(["medium", "medium"]);
    expect(opened()).toEqual([callUrl, callUrl]);
    expect(events()).toStrictEqual([
      { name: "contact_call", props: { listing_id: 100001, via: "browser", src: "author" } },
      { name: "contact_call", props: { listing_id: 100001, via: "browser", src: "text" } },
    ]);
    expect(dialled).toEqual([]);
  });

  it("a failed request: the error haptic, the button stays, nothing is logged", async () => {
    state.getContact.mockResolvedValueOnce(DOWN);
    const { result } = contactView();

    await press(() => result.current.phone!.onReveal("author"));

    expect(haptics()).toEqual(["medium", "error"]);
    expect(result.current.phone).toMatchObject({ display: null, tail: null });
    expect(events()).toEqual([]);
    // Legacy shows no text for a contact failure, also since `index-CIa0Ldj2.js`.
    expect(currentToast()).toBeNull();
  });
});

describe("useListingContact: «Позвонить»", () => {
  it("as the first tap: medium haptic, one request, the call page, contact_call without src", async () => {
    state.getContact.mockResolvedValueOnce(reply());
    const { result } = contactView();

    await press(() => result.current.cta.onCall());

    expect(haptics()).toEqual(["medium"]);
    expect(state.getContact).toHaveBeenCalledTimes(1);
    expect(opened()).toEqual([callUrl]);
    expect(events()).toStrictEqual([{ name: "contact_call", props: { listing_id: 100001, via: "browser" } }]);
    expect(result.current.phone).toMatchObject({ display: DISPLAY, tail: "67" });
  });

  it("after a reveal sends no second request", async () => {
    state.getContact.mockResolvedValueOnce(reply());
    const { result } = contactView();
    await press(() => result.current.phone!.onReveal("author"));

    await press(() => result.current.cta.onCall());

    expect(state.getContact).toHaveBeenCalledTimes(1);
    expect(opened()).toEqual([callUrl]);
  });

  it("contact_unavailable: the error haptic, nothing opens, no event", async () => {
    state.getContact.mockResolvedValueOnce(UNAVAILABLE);
    const { result } = contactView();

    await press(() => result.current.cta.onCall());

    expect(haptics()).toEqual(["medium", "error"]);
    expect(opened()).toEqual([]);
    expect(dialled).toEqual([]);
    expect(events()).toEqual([]);
    // Legacy shows no text for a contact failure, also since `index-CIa0Ldj2.js`.
    expect(currentToast()).toBeNull();
  });

  it("a call page the link list refuses: the error haptic and no event", async () => {
    state.getContact.mockResolvedValueOnce(reply({ call_url: "https://calls.example/stub-token" }));
    const { result } = contactView();

    await press(() => result.current.cta.onCall());

    expect(haptics()).toEqual(["medium", "error"]);
    expect(opened()).toEqual([]);
    expect(events()).toEqual([]);
    // Legacy shows no text for a contact failure, also since `index-CIa0Ldj2.js`.
    expect(currentToast()).toBeNull();
  });

  it("Android: tel: first, and leaving the app logs via tel without opening the call page", async () => {
    install("android");
    state.getContact.mockResolvedValueOnce(reply());
    const { result } = contactView();

    await press(() => result.current.cta.onCall());
    expect(dialled).toEqual([`tel:${PHONE}`]);
    expect(events()).toEqual([]);

    await wait(300);
    await act(async () => {
      setHidden(true);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(opened()).toEqual([]);
    expect(events()).toStrictEqual([{ name: "contact_call", props: { listing_id: 100001, via: "tel" } }]);
  });

  it("Android: staying in the app for 1.2 s opens the call page and logs via browser", async () => {
    install("android");
    state.getContact.mockResolvedValueOnce(reply());
    const { result } = contactView();

    await press(() => result.current.cta.onCall());
    await wait(TEL_DETECTION_MS);

    expect(dialled).toEqual([`tel:${PHONE}`]);
    expect(opened()).toEqual([callUrl]);
    expect(events()).toStrictEqual([{ name: "contact_call", props: { listing_id: 100001, via: "browser" } }]);
  });

  it("Android: an answer without a number never tries tel: and opens the call page at once", async () => {
    install("android");
    state.getContact.mockResolvedValueOnce(reply({ phone: null, phone_display: null }));
    const { result } = contactView();

    await press(() => result.current.cta.onCall());

    expect(dialled).toEqual([]);
    expect(opened()).toEqual([callUrl]);
    expect(events()).toStrictEqual([{ name: "contact_call", props: { listing_id: 100001, via: "browser" } }]);
  });

  it("after eight minutes on the screen a second tap fetches a fresh link and opens it", async () => {
    const fresh = `${callUrl}-fresh`;
    state.getContact.mockResolvedValueOnce(reply()).mockResolvedValueOnce(reply({ call_url: fresh }));
    const { result } = contactView();
    await press(() => result.current.cta.onCall());

    await wait(8 * MINUTE);
    await press(() => result.current.cta.onCall());

    expect(state.getContact).toHaveBeenCalledTimes(2);
    expect(opened()).toEqual([callUrl, fresh]);
    expect(haptics()).toEqual(["medium", "medium"]);
  });

  it("a failed refetch calls with the old contact", async () => {
    state.getContact.mockResolvedValueOnce(reply()).mockResolvedValueOnce(DOWN);
    const { result } = contactView();
    await press(() => result.current.cta.onCall());

    await wait(9 * MINUTE);
    await press(() => result.current.cta.onCall());

    expect(state.getContact).toHaveBeenCalledTimes(2);
    expect(opened()).toEqual([callUrl, callUrl]);
    expect(haptics()).toEqual(["medium", "medium"]);
    expect(events()).toHaveLength(2);
  });

  it("taps on two controls while the request runs share it", async () => {
    const pending = deferred<ActionResult<ContactData>>();
    state.getContact.mockReturnValueOnce(pending.promise);
    const { result } = contactView();

    await press(() => {
      result.current.cta.onCall();
      result.current.phone!.onReveal("author");
    });
    expect(state.getContact).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(reply());
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(opened()).toEqual([callUrl]);
    expect(result.current.phone).toMatchObject({ display: DISPLAY });
  });

  it("logs the hook's number and never a phone, a text or a link", async () => {
    state.getContact.mockResolvedValueOnce(reply());
    const { result } = contactView(listing(), 100016);

    await press(() => result.current.cta.onCall());
    await press(() => result.current.cta.onWrite());

    expect(state.getContact.mock.calls[0][0]).toEqual({ number: 100016 });
    expect(events().map((entry) => entry.props)).toStrictEqual([{ listing_id: 100016, via: "browser" }, { listing_id: 100016 }]);
    const logged = JSON.stringify(events());
    for (const leak of [PHONE, "000000067", DISPLAY, callUrl, writeUrl, "https:"]) {
      expect(logged).not.toContain(leak);
    }
  });
});

describe("useListingContact: «Написать» and «Открыть пост»", () => {
  it("«Написать»: medium haptic, the chat link, contact_write with the number only", async () => {
    const { result } = contactView(listing(NO_PHONE));

    await press(() => result.current.cta.onWrite());

    expect(haptics()).toEqual(["medium"]);
    expect(fake!.calls.filter((entry) => entry.member === "openTelegramLink").map((entry) => entry.args[0])).toEqual([writeUrl]);
    expect(events()).toStrictEqual([{ name: "contact_write", props: { listing_id: 100001 } }]);
    expect(state.getContact).not.toHaveBeenCalled();
  });

  it("a chat link the link list refuses: the error haptic and no contact_write (D-23)", async () => {
    const { result } = contactView(listing({ has_phone: false, contact_url: "https://chat.example/stub_author" }));

    await press(() => result.current.cta.onWrite());

    expect(haptics()).toEqual(["medium", "error"]);
    expect(opened()).toEqual([]);
    expect(events()).toEqual([]);
    // Legacy shows no text for a contact failure, also since `index-CIa0Ldj2.js`.
    expect(currentToast()).toBeNull();
  });

  it("«Открыть пост»: medium haptic and the post, logged as original_opened from the button", async () => {
    const { result } = contactView(listing(NO_CONTACT));

    await press(() => result.current.cta.onOpenPost());

    expect(haptics()).toEqual(["medium"]);
    expect(opened()).toEqual([postUrl]);
    expect(events()).toStrictEqual([{ name: "original_opened", props: { listing_id: 100001, src: "button" } }]);
  });

  it("without the details neither does anything", async () => {
    const { result } = contactView(null);

    await press(() => result.current.cta.onWrite());
    await press(() => result.current.cta.onOpenPost());

    expect(haptics()).toEqual([]);
    expect(opened()).toEqual([]);
  });
});

describe("useListingContact: a second tap within LINK_DEBOUNCE_MS", () => {
  type Tap = (view: ListingContactView) => void;
  /** The details are made inside the test: the addresses are the test's own. */
  const cases: [string, Tap, () => ListingDetails][] = [
    ["«Позвонить»", (view) => view.cta.onCall(), () => listing()],
    ["«Показать номер»", (view) => view.phone!.onReveal("author"), () => listing()],
    ["the revealed number", (view) => view.phone!.onCall("author"), () => listing()],
    ["a masked number in the text", (view) => view.phone!.onReveal("text"), () => listing()],
    ["«Написать»", (view) => view.cta.onWrite(), () => listing(NO_PHONE)],
    ["«Открыть пост»", (view) => view.cta.onOpenPost(), () => listing(NO_CONTACT)],
  ];

  it.each(cases)("%s: does nothing — no haptic, no request, no event — and one after it works", async (_name, tap, details) => {
    state.getContact.mockResolvedValue(reply());
    const { result } = contactView(details());

    await press(() => tap(result.current));
    const after = { haptics: haptics().length, requests: state.getContact.mock.calls.length, opened: opened().length, events: events().length };
    expect(after.haptics).toBe(1);

    await wait(LINK_DEBOUNCE_MS - 1);
    await press(() => tap(result.current));
    expect({ haptics: haptics().length, requests: state.getContact.mock.calls.length, opened: opened().length, events: events().length }).toEqual(after);

    await wait(1);
    await press(() => tap(result.current));
    expect(haptics()).toEqual(["medium", "medium"]);
    expect(opened()).toHaveLength(after.opened * 2);
    expect(events()).toHaveLength(after.events * 2);
  });

  it("a tap while the previous one still waits for its answer is ignored too", async () => {
    const pending = deferred<ActionResult<ContactData>>();
    state.getContact.mockReturnValueOnce(pending.promise);
    const { result } = contactView();

    await press(() => result.current.cta.onCall());
    await wait(LINK_DEBOUNCE_MS * 2);
    await press(() => result.current.cta.onCall());
    expect(haptics()).toEqual(["medium"]);
    expect(state.getContact).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(reply());
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(opened()).toEqual([callUrl]);
    expect(events()).toHaveLength(1);
  });

  it("the lock runs from the end of the previous tap, so a slow answer never makes openLink refuse the repeat", async () => {
    const pending = deferred<ActionResult<ContactData>>();
    state.getContact.mockReturnValueOnce(pending.promise);
    const { result } = contactView();
    await press(() => result.current.cta.onCall());
    await wait(1000);
    await act(async () => {
      pending.resolve(reply());
      await vi.advanceTimersByTimeAsync(0);
    });

    await wait(1000);
    await press(() => result.current.cta.onCall());
    expect(haptics()).toEqual(["medium"]);

    await wait(LINK_DEBOUNCE_MS - 1000);
    await press(() => result.current.cta.onCall());
    expect(haptics()).toEqual(["medium", "medium"]);
    expect(opened()).toEqual([callUrl, callUrl]);
  });

  it("each control has its own lock", async () => {
    state.getContact.mockResolvedValue(reply());
    const { result } = contactView();

    await press(() => result.current.phone!.onReveal("author"));
    await press(() => result.current.phone!.onCall("author"));

    expect(haptics()).toEqual(["medium", "medium"]);
    expect(opened()).toEqual([callUrl]);
  });
});

describe("useListingContact with the sections it fills", () => {
  function Screen({ details }: { details: ListingDetails }) {
    const { phone, cta } = useListingContact(details.number, details);
    return (
      <>
        <AuthorSection number={details.number} ownerLabel={details.owner_label} offers={details.offers} posted={details.posted} phone={phone} />
        <OriginalText number={details.number} text={details.original.text ?? ""} phone={phone} translation={null} />
        <ListingCtaBar item={details} details={details} cta={cta} />
      </>
    );
  }

  const click = async (selector: string) => {
    await act(async () => {
      fireEvent.click(document.querySelector(selector)!);
      await vi.advanceTimersByTimeAsync(0);
    });
  };

  it("a masked number reveals the own number in the text and the author row; each caller logs its src", async () => {
    state.getContact.mockResolvedValue(reply());
    render(<Screen details={listing()} />, { wrapper });
    expect(document.body.textContent).not.toContain(DISPLAY);

    await click('button[data-masked-phone="67"]');
    expect(state.getContact).toHaveBeenCalledTimes(1);
    expect(document.querySelector("button[data-own-phone]")?.textContent).toBe(DISPLAY);
    expect(document.querySelector('button[data-phone="number"]')?.textContent).toBe(DISPLAY);

    // The two numbers share one control's lock and every call opens the same page: one tap per debounce window.
    await click("button[data-own-phone]");
    await wait(LINK_DEBOUNCE_MS);
    await click('button[data-phone="number"]');
    await wait(LINK_DEBOUNCE_MS);
    await click('[data-cta] button[data-cta-action="call"]');

    expect(state.getContact).toHaveBeenCalledTimes(1);
    expect(events()).toStrictEqual([
      { name: "contact_call", props: { listing_id: 100001, via: "browser", src: "text" } },
      { name: "contact_call", props: { listing_id: 100001, via: "browser", src: "author" } },
      { name: "contact_call", props: { listing_id: 100001, via: "browser" } },
    ]);
  });
});
