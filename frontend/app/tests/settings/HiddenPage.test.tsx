import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/actions/run";

const state = vi.hoisted(() => ({
  unblockAuthorById: vi.fn<(input: unknown) => Promise<ActionResult<null>>>(),
  unhideListing: vi.fn<(input: unknown) => Promise<ActionResult<null>>>(),
  unhideAll: vi.fn<(input: unknown) => Promise<ActionResult<null>>>(),
  push: vi.fn<(href: string) => void>(),
}));
vi.mock("@/lib/api/browser", () => ({ bffFetch: () => new Promise(() => undefined) }));
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: vi.fn(), reauthenticate: vi.fn(), patchMe: vi.fn() }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: "ready", me: null }) }));
vi.mock("@/lib/actions/hidden", () => ({
  unblockAuthorById: (input: unknown) => state.unblockAuthorById(input),
  unhideListing: (input: unknown) => state.unhideListing(input),
  unhideAll: (input: unknown) => state.unhideAll(input),
}));
vi.mock("@/lib/actions/useAction", () => ({ useAction: (action: (input: unknown) => unknown) => (input: unknown) => action(input) }));
vi.mock("@/lib/navigation/nav", () => ({ nav: { push: (href: string) => state.push(href) } }));

import { feedEpoch } from "@/features/feed/feedQuery";
import { HiddenPage } from "@/features/settings/HiddenPage";
import { HIDDEN_KEY } from "@/features/settings/useHidden";
import { hide, isHidden, resetSessionMaps } from "@/lib/data/sessionMaps";
import { getPreview } from "@/lib/data/previewCache";
import { resetResources, seedResource } from "@/lib/data/useResource";
import { currentToast, dismissToast } from "@/lib/ui/toast";

import { previewOf } from "../helpers/listing";
import { deferred, withIntl } from "./harness";

let fake: FakeTelegram | null = null;
const OK: ActionResult<null> = { ok: true, data: null, meta: {} };
const FAILED: ActionResult<null> = { ok: false, error: "server", status: 500, method: "DELETE", path: "hidden" } as ActionResult<null>;
const PHONE = { id: "01JD0000000000000000000011", kind: "phone", label: "+998 ** *** ** 41", count: 1 };
const CHANNEL = { id: "01JD0000000000000000000012", kind: "source", label: "@stub_channel_b", count: 3 };
const settle = () => act(async () => undefined);
const authors = () => [...document.querySelectorAll("[data-hidden-author]")].map((node) => node.getAttribute("data-hidden-author"));
const listings = () => [...document.querySelectorAll("[data-hidden-listing]")].map((node) => Number(node.getAttribute("data-hidden-listing")));
const returnOf = (selector: string) => document.querySelector<HTMLButtonElement>(`${selector} [data-hidden-return]`)!;
const notified = (kind: string) => (fake?.calls ?? []).filter((call) => call.member === "HapticFeedback.notificationOccurred" && call.args[0] === kind).length;

function page(hidden: { listings?: unknown[]; authors?: unknown[] }) {
  seedResource(HIDDEN_KEY, { listings: hidden.listings ?? [], authors: hidden.authors ?? [] });
  return render(withIntl(<HiddenPage />));
}

beforeEach(() => {
  for (const spy of [state.unblockAuthorById, state.unhideListing, state.unhideAll, state.push]) {
    spy.mockReset();
  }
  resetResources();
  resetSessionMaps();
  fake = fakeTelegram({ version: "8.0", answers: { confirm: true } });
});

afterEach(() => {
  cleanup();
  dismissToast("app");
  fake?.uninstall();
  fake = null;
});

describe("HiddenPage (WP-31, SCR-039): what it shows", () => {
  it("authors only: the intro, a phone with its mask class and a channel, their plurals or «сейчас нет объявлений»", () => {
    page({ authors: [PHONE, CHANNEL, { ...PHONE, id: "01JD0000000000000000000013", count: 0 }, { ...PHONE, id: "01JD0000000000000000000014", count: 5 }] });

    expect(screen.getByText("Эти объявления и авторы не приходят ни в ленту, ни в радар.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Заблокированные авторы" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Скрытые объявления" })).toBeNull();
    const rows = [...document.querySelectorAll("[data-hidden-author]")].map((node) => node.textContent);
    expect(rows).toEqual([
      "+998 ** *** ** 41Номер · 1 объявлениеВернуть",
      "@stub_channel_bКанал · 3 объявленияВернуть",
      "+998 ** *** ** 41Номер · сейчас нет объявленийВернуть",
      "+998 ** *** ** 41Номер · 5 объявленийВернуть",
    ]);
    expect(document.querySelector("[data-hidden-author] b")?.className).toContain("ph-mask");
    expect(document.querySelectorAll("[data-hidden-author] b")[1]?.className).not.toContain("ph-mask");
  });

  it("an unknown author kind: the generic icon and the server's label, without «Номер» or «Канал»", () => {
    page({ authors: [{ ...CHANNEL, kind: "website", label: "example.uz" }] });

    expect(document.querySelector("[data-hidden-author]")?.textContent).toBe("example.uz3 объявленияВернуть");
    expect(document.querySelector("[data-hidden-kind]")?.getAttribute("data-hidden-kind")).toBe("other");
  });

  it("listings only: price or «Цена договорная», title · district, a thumbnail; a tap opens the listing over the list", () => {
    const one = previewOf({ number: 100013, title: "2-комн. квартира", district: { code: "yunusobod", name: "Юнусабад" } });
    const two = previewOf({ number: 101020, price: null, photos: { preview: [], count: 0, cover: null } });
    page({ listings: [one, two] });

    expect(listings()).toEqual([100013, 101020]);
    expect(document.querySelector('[data-hidden-listing="100013"]')?.textContent).toContain("2-комн. квартира · Юнусабад");
    expect(document.querySelector('[data-hidden-listing="101020"] b')?.textContent).toBe("Цена договорная");

    fireEvent.click(document.querySelector('[data-hidden-open="100013"]')!);
    expect(state.push).toHaveBeenCalledExactlyOnceWith("/listing/100013");
    expect(getPreview(100013)?.number).toBe(100013);
  });

  it("empty: «Ничего не скрыто», no groups and no «Показать всё снова»", () => {
    page({});

    expect(screen.getByText("Ничего не скрыто")).toBeTruthy();
    expect(document.querySelector("[data-hidden-all]")).toBeNull();
  });
});

describe("HiddenPage: returning", () => {
  it("an author: the row leaves at once; success plays the success haptic and makes the hidden items read again", async () => {
    const save = deferred<ActionResult<null>>();
    state.unblockAuthorById.mockReturnValueOnce(save.promise);
    hide([100013]);
    page({ authors: [PHONE, CHANNEL] });
    const epoch = feedEpoch();

    fireEvent.click(returnOf(`[data-hidden-author="${PHONE.id}"]`));
    expect(authors()).toEqual([CHANNEL.id]);
    expect(state.unblockAuthorById).toHaveBeenCalledWith({ id: PHONE.id });

    await act(async () => save.resolve(OK));
    expect(notified("success")).toBe(1);
    expect(feedEpoch()).toBe(epoch + 1);
    expect(isHidden(100013)).toBe(false);
  });

  it("a listing: DELETE /hidden/listings/{number}; a failure brings back only that row, with failed()", async () => {
    state.unhideListing.mockResolvedValueOnce(FAILED);
    page({ listings: [previewOf({ number: 100013 }), previewOf({ number: 101020 })] });

    fireEvent.click(returnOf('[data-hidden-listing="100013"]'));
    expect(listings()).toEqual([101020]);
    await settle();

    expect(state.unhideListing).toHaveBeenCalledWith({ number: 100013 });
    expect(listings()).toEqual([100013, 101020]);
    expect(currentToast("app")?.message).toEqual({ key: "common.saveFailed" });
  });

  it("«Показать всё снова» asks first; Cancel sends nothing", async () => {
    fake?.uninstall();
    fake = fakeTelegram({ version: "8.0", answers: { confirm: false } });
    page({ authors: [PHONE], listings: [previewOf({ number: 100013 })] });

    fireEvent.click(document.querySelector("[data-hidden-all]")!);
    await settle();

    expect(fake.calls.some((call) => call.member === "showConfirm" && call.args[0] === "Снова показывать все скрытые объявления и заблокированных авторов?")).toBe(true);
    expect(state.unhideAll).not.toHaveBeenCalled();
    expect(authors()).toEqual([PHONE.id]);
  });

  it("OK empties the page, which stays open; a failure restores only what it removed, not a row returned meanwhile", async () => {
    const all = deferred<ActionResult<null>>();
    state.unhideAll.mockReturnValueOnce(all.promise);
    state.unblockAuthorById.mockResolvedValueOnce(OK);
    page({ authors: [PHONE, CHANNEL], listings: [previewOf({ number: 100013 })] });

    // A row returned first, then all; the single return succeeds, the whole one fails.
    fireEvent.click(returnOf(`[data-hidden-author="${PHONE.id}"]`));
    await settle();
    fireEvent.click(document.querySelector("[data-hidden-all]")!);
    await settle();
    expect(state.unhideAll).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Ничего не скрыто")).toBeTruthy();

    await act(async () => all.resolve(FAILED));
    expect(authors()).toEqual([CHANNEL.id]);
    expect(listings()).toEqual([100013]);
  });

  it("a failed «Показать всё снова» brings back every row it removed, whatever the list shows meanwhile", async () => {
    const all = deferred<ActionResult<null>>();
    state.unhideAll.mockReturnValueOnce(all.promise);
    page({ authors: [PHONE, CHANNEL] });

    fireEvent.click(document.querySelector("[data-hidden-all]")!);
    await settle();
    seedResource(HIDDEN_KEY, { listings: [], authors: [] });
    await act(async () => all.resolve(FAILED));

    expect(authors()).toEqual([PHONE.id, CHANNEL.id]);
  });
});

describe("HiddenPage: two returns that fail one after the other (review of WP-31)", () => {
  it("each failure puts back its own row, and the other's row, put back first, stays", async () => {
    const first = deferred<ActionResult<null>>();
    const second = deferred<ActionResult<null>>();
    state.unblockAuthorById.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const third = { ...CHANNEL, id: "01JD0000000000000000000013", label: "@third" };
    page({ authors: [PHONE, CHANNEL, third] });

    fireEvent.click(returnOf(`[data-hidden-author="${PHONE.id}"]`));
    fireEvent.click(returnOf(`[data-hidden-author="${CHANNEL.id}"]`));
    expect(authors()).toEqual([third.id]);

    await act(async () => first.resolve(FAILED));
    expect(authors()).toEqual([PHONE.id, third.id]);
    await act(async () => second.resolve(FAILED));
    // The order is the list's as it was read.
    expect(authors()).toEqual([PHONE.id, CHANNEL.id, third.id]);
  });

  it("the focus moves to the next row's «Вернуть», not to the body", async () => {
    state.unblockAuthorById.mockReturnValue(new Promise(() => undefined));
    page({ authors: [PHONE, CHANNEL] });

    const button = returnOf(`[data-hidden-author="${PHONE.id}"]`);
    button.focus();
    fireEvent.click(button);
    await settle();

    expect(document.activeElement).toBe(returnOf(`[data-hidden-author="${CHANNEL.id}"]`));
  });

  it("the last row's «Вернуть» gives the focus to the page: «Показать всё снова» leaves with it", async () => {
    state.unblockAuthorById.mockReturnValue(new Promise(() => undefined));
    page({ authors: [PHONE] });

    const button = returnOf(`[data-hidden-author="${PHONE.id}"]`);
    button.focus();
    fireEvent.click(button);
    await settle();

    expect(document.querySelector("[data-hidden-all]")).toBeNull();
    expect(document.activeElement).toBe(document.querySelector("[data-hidden-page]"));
  });

  it("a return that fails after «Показать всё снова» succeeded puts nothing back: the server returned that row too", async () => {
    const single = deferred<ActionResult<null>>();
    state.unblockAuthorById.mockReturnValueOnce(single.promise);
    state.unhideAll.mockResolvedValueOnce(OK);
    page({ authors: [PHONE, CHANNEL] });

    fireEvent.click(returnOf(`[data-hidden-author="${PHONE.id}"]`));
    fireEvent.click(document.querySelector("[data-hidden-all]")!);
    await settle();
    expect(authors()).toEqual([]);

    await act(async () => single.resolve(FAILED));
    expect(authors()).toEqual([]);
    expect(notified("error")).toBe(0);
  });
});
