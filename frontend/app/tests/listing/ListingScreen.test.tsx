import { getMessages } from "@homi/i18n";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ListingDetails, ListingInitial, ListingShowData } from "@/features/listing/listingData";
import type { ActionResult } from "@/lib/actions/run";
import type { ApiFailure, UiError } from "@/lib/api/errors";
import type { ApiResult } from "@/lib/api/types";

type Answer = ApiResult<ListingShowData>;

const state = vi.hoisted(() => ({
  sent: [] as { path: string; resolve: (answer: Answer) => void }[],
  push: vi.fn(),
  replace: vi.fn(),
  reportView: vi.fn(),
  scrollToTop: vi.fn(),
  /** The listing screen's Server Actions (contact, translation, share): none is called by these cases. */
  getContact: vi.fn<(input: { number: number }) => Promise<ActionResult<unknown>>>(() => new Promise(() => {})),
  translate: vi.fn<(input: { number: number }) => Promise<ActionResult<unknown>>>(() => new Promise(() => {})),
  prepareShare: vi.fn<(input: { number: number }) => Promise<ActionResult<unknown>>>(() => new Promise(() => {})),
}));
vi.mock("@/lib/api/browser", () => ({
  bffFetch: (path: string) =>
    new Promise<Answer>((resolve) => {
      state.sent.push({ path, resolve });
    }),
}));
/** `useMoney` (history prices, the market block) without a profile currency prints dollars. */
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: "ready", me: null }) }));
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: vi.fn(), reauthenticate: vi.fn() }));
vi.mock("@/lib/actions/favorites", () => ({ setFavorite: vi.fn(() => new Promise(() => {})) }));
vi.mock("@/lib/actions/listing", () => ({ getContact: state.getContact, translate: state.translate, prepareShare: state.prepareShare }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: state.push, replace: state.replace }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/ru/listing/100001" }));

import { resetPendingFavorites } from "@/features/feed/FavButton";
import { ListingScreen, type ListingScreenProps } from "@/features/listing/ListingScreen";
import { resetMarkerShows } from "@/features/listing/sections/MarketBlock";
import { resetTranslations } from "@/features/listing/translation/translationCache";
import { ListingLayerContext } from "@/features/listing/useListing";
import { heroIndexOf, rememberHeroIndex, resetViewStates } from "@/features/listing/viewState";
import { clearTracked, recentTracked } from "@/lib/analytics/events";
import { resetPreviews, setPreview } from "@/lib/data/previewCache";
import { resetSessionMaps } from "@/lib/data/sessionMaps";
import { resetSources } from "@/lib/data/sources";
import { resetResources } from "@/lib/data/useResource";

import { detailsOf } from "../helpers/details";
import { previewOf } from "../helpers/listing";

const PREVIEW_PHOTOS = [1, 2, 3].map((index) => `https://cdn.homi.loc/stub/100001/${index}.jpg?e=0&s=stub`);

const initialOk = (details: ListingDetails = detailsOf()): ListingInitial => ({
  ok: true,
  data: { listing: details, source: "stub" },
  meta: { source: "stub" },
});
const failure = (error: UiError, status = 500): ApiFailure => ({ ok: false, error, status, method: "GET", path: "listings/:number" });

function screen(props: Partial<ListingScreenProps> = {}) {
  return render(
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      <ListingLayerContext value={{ number: 100001, scrollToTop: state.scrollToTop, reportView: state.reportView }}>
        <ListingScreen number={100001} {...props} />
      </ListingLayerContext>
    </NextIntlClientProvider>,
  );
}

const root = () => document.querySelector<HTMLElement>("[data-listing-state]")!;
const counter = () => document.querySelector("[data-hero-counter]")?.textContent ?? null;

let fake: FakeTelegram | null = null;
const haptics = () =>
  (fake?.calls ?? []).filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);
const opened = () => (fake?.calls ?? []).filter((entry) => entry.member === "openTelegramLink").map((entry) => entry.args[0]);

beforeEach(() => {
  state.sent = [];
  state.push.mockReset();
  state.replace.mockReset();
  state.reportView.mockReset();
  state.scrollToTop.mockReset();
  fake = fakeTelegram({ version: "8.0" });
});

afterEach(() => {
  cleanup();
  resetResources();
  resetPreviews();
  resetSessionMaps();
  resetSources();
  resetViewStates();
  resetPendingFavorites();
  resetTranslations();
  resetMarkerShows();
  clearTracked();
  fake?.uninstall();
  fake = null;
});

describe("ListingScreen (WP-26, SCR-018, SCR-019)", () => {
  it("skeleton: no preview and no answer; the layer hears the state", () => {
    screen();

    expect(root().getAttribute("data-listing-state")).toBe("skeleton");
    expect(document.querySelector("[data-listing-skeleton]")?.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector("[data-hero]")).toBeNull();
    expect(state.reportView).toHaveBeenLastCalledWith("skeleton");
  });

  it("an address without a valid number: the skeleton only", () => {
    screen({ number: null, initial: null });

    expect(root().getAttribute("data-listing-state")).toBe("skeleton");
    expect(state.sent).toEqual([]);
    expect(state.reportView).toHaveBeenLastCalledWith("skeleton");
  });

  it("preview: hero, banner, title, facts without the building, section skeletons of 3 and 4 lines, the pending CTA", () => {
    setPreview(100001, previewOf({ photos: { preview: PREVIEW_PHOTOS, count: 8, cover: null }, status_text: "Снято с публикации" }));
    screen();

    expect(root().getAttribute("data-listing-state")).toBe("preview");
    expect(document.querySelectorAll("[data-hero] [data-slide]")).toHaveLength(3);
    expect(counter()).toBe("1 / 8");
    expect(document.querySelector("[data-status-banner]")?.textContent).toBe("Снято с публикации");
    expect(document.querySelector("h1[data-listing-title]")?.textContent).toBe("2-комн. квартира, 54 м²");
    expect(document.querySelector("[data-listing-place]")?.textContent).toBe("Юнусабад · Мегапланет");
    expect([...document.querySelectorAll("[data-key-facts] [data-fact]")].map((tile) => tile.getAttribute("data-fact"))).toEqual(["rooms", "area", "floor"]);
    expect([...document.querySelectorAll("[data-section-skeleton]")].map((block) => block.getAttribute("data-section-skeleton"))).toEqual(["3", "4"]);
    expect(document.querySelector('[data-cta] [data-cta-action="pending"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="listing-sections"]')).toBeNull();
    expect(state.reportView).toHaveBeenLastCalledWith("preview");
  });

  it("the counter shows for more than one photo of the given array: a one-photo preview with count 5 has none", () => {
    setPreview(100001, previewOf({ photos: { preview: PREVIEW_PHOTOS.slice(0, 1), count: 5, cover: null } }));
    screen();

    expect(document.querySelectorAll("[data-hero] [data-slide]")).toHaveLength(1);
    expect(counter()).toBeNull();
  });

  it("loaded: the full set of photos, the building tile, the sections and the CTA's action", () => {
    screen({ initial: initialOk() });

    expect(root().getAttribute("data-listing-state")).toBe("loaded");
    expect(document.querySelectorAll("[data-hero] [data-slide]")).toHaveLength(8);
    expect(counter()).toBe("1 / 8");
    expect(document.querySelector('[data-fact="building"]')?.textContent).toBe("Вторичкадом");
    expect(document.querySelector('[data-slot="listing-sections"] [data-section]')).not.toBeNull();
    expect(document.querySelector("[data-section-skeleton]")).toBeNull();
    expect(document.querySelector('[data-cta-action="pending"]')).toBeNull();
    expect(document.querySelector('[data-cta] button[data-cta-action="call"]')).not.toBeNull();
    expect(state.sent).toEqual([]);
    expect(state.getContact).not.toHaveBeenCalled();
    expect(state.reportView).toHaveBeenLastCalledWith("loaded");
  });

  it("no digit of the author's number before a tap (DEC-52): only the masked forms reach the document", () => {
    screen({ initial: initialOk() });

    const html = document.body.innerHTML;
    for (const form of ["+998000000067", "000000067", "000 00 67", "000-00-67", "+998 00 000-00-67"]) {
      expect(html).not.toContain(form);
    }
    expect(document.body.textContent).toContain("+998 ** *** ** 67");
    expect(state.getContact).not.toHaveBeenCalled();
  });

  it("the details replace the preview in the same hero: the photo shown stays", async () => {
    setPreview(100001, previewOf({ photos: { preview: PREVIEW_PHOTOS, count: 8, cover: null } }));
    screen({ initial: null });
    const strip = document.querySelector<HTMLElement>("[data-hero] [data-scroll-x]")!;
    Object.defineProperty(strip, "clientWidth", { configurable: true, value: 300 });
    Object.defineProperty(strip, "scrollLeft", { configurable: true, value: 600 });
    fireEvent.scroll(strip);
    expect(counter()).toBe("3 / 8");

    await act(async () => state.sent[0].resolve({ ok: true, data: detailsOf(), meta: { source: "stub" } }));

    expect(root().getAttribute("data-listing-state")).toBe("loaded");
    expect(document.querySelector("[data-hero] [data-scroll-x]")).toBe(strip);
    expect(counter()).toBe("3 / 8");
    expect(heroIndexOf(100001)).toBe(2);
  });

  it("starts the hero at the remembered photo of this opening (the fallback → resolved swap)", () => {
    rememberHeroIndex(100001, 4);
    screen({ initial: initialOk() });

    expect(counter()).toBe("5 / 8");
  });

  it("no h1 for an empty title", () => {
    screen({ initial: initialOk(detailsOf({ title: "" })) });

    expect(document.querySelector("h1")).toBeNull();
  });

  it("a photo tap: light haptic, then the viewer at that photo", () => {
    screen({ initial: initialOk() });

    fireEvent.click(document.querySelector('[data-hero] [data-slide="0"]')!);

    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
    expect(state.push).toHaveBeenCalledWith("/listing/100001/photos?i=0");
  });

  it("«⋯» opens the actions sheet", () => {
    screen({ initial: initialOk() });

    fireEvent.click(document.querySelector('button[data-action="menu"]')!);

    expect(state.push).toHaveBeenCalledWith("/listing/100001/actions");
  });

  describe("a video", () => {
    const url = (n: number) => `https://t.me/stub_channel_c/${5100 + n}`;

    it("loaded with the post: the label and a slide open the post, after the light haptic", () => {
      screen({ initial: initialOk(detailsOf({ has_video: true, original: { text: "Видео", url: url(1), deleted: false } })) });

      fireEvent.click(document.querySelector("button[data-hero-video]")!);

      expect(document.querySelector("[data-hero-video]")?.textContent).toBe("Смотреть видео в Telegram");
      expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
      expect(opened()).toEqual([url(1)]);
      expect(recentTracked()).toEqual([{ name: "original_opened", props: { listing_id: 100001, src: "video" } }]);
      expect(state.push).not.toHaveBeenCalled();
    });

    it("a slide of a loaded video opens the post too", () => {
      screen({ initial: initialOk(detailsOf({ has_video: true, original: { text: "Видео", url: url(2), deleted: false } })) });

      fireEvent.click(document.querySelector('[data-hero] [data-slide="0"]')!);

      expect(opened()).toEqual([url(2)]);
      expect(state.push).not.toHaveBeenCalled();
    });

    it("of a deleted post: the viewer", () => {
      screen({ initial: initialOk(detailsOf({ has_video: true, original: { text: "Видео", url: url(3), deleted: true } })) });

      fireEvent.click(document.querySelector("button[data-hero-video]")!);

      expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
      expect(opened()).toEqual([]);
      expect(state.push).toHaveBeenCalledWith("/listing/100001/photos?i=0");
    });

    it("without the post's address: the viewer", () => {
      screen({ initial: initialOk(detailsOf({ has_video: true, original: { text: "Видео", url: null, deleted: false } })) });

      fireEvent.click(document.querySelector("button[data-hero-video]")!);

      expect(opened()).toEqual([]);
      expect(state.push).toHaveBeenCalledWith("/listing/100001/photos?i=0");
    });

    it("before the answer: the viewer over the preview photos", () => {
      setPreview(100001, previewOf({ has_video: true }));
      screen({ initial: null });

      fireEvent.click(document.querySelector("button[data-hero-video]")!);

      expect(opened()).toEqual([]);
      expect(state.push).toHaveBeenCalledWith("/listing/100001/photos?i=0");
    });
  });

  it("not found: the text only, clear of Telegram's header", () => {
    setPreview(100001, previewOf());
    screen({ initial: failure("not_found", 404) });

    expect(root().getAttribute("data-listing-state")).toBe("not_found");
    const text = root().querySelector("p")!;
    expect(text.textContent).toBe("Объявление не загрузилось");
    expect(text.className).toMatch(/(?:^|\s)pt-\[calc\(16px\+var\(--top-inset\)\)\](?:\s|$)/);
    expect(root().querySelector("button")).toBeNull();
    expect(document.querySelector("[data-hero]")).toBeNull();
  });

  it.each([
    ["offline", 0, "Нет связи", "Проверьте интернет и попробуйте ещё раз."],
    ["timeout", 0, "Нет связи", "Проверьте интернет и попробуйте ещё раз."],
    ["server", 500, "Не загрузилось", "Сервер не ответил. Попробуйте ещё раз через минуту."],
    ["source_unavailable", 503, "Не загрузилось", "Сервер не ответил. Попробуйте ещё раз через минуту."],
  ] as const)("%s: the tall error state alone, clear of Telegram's header", (error, status, title, text) => {
    setPreview(100001, previewOf());
    screen({ initial: failure(error, status) });

    const errorState = document.querySelector<HTMLElement>('[data-slot="error-state"]')!;
    expect(errorState.querySelector('[data-slot="error-state-title"]')?.textContent).toBe(title);
    expect(errorState.querySelector('[data-slot="error-state-text"]')?.textContent).toBe(text);
    expect(errorState.parentElement?.className).toMatch(/(?:^|\s)pt-\[calc\(16px\+var\(--top-inset\)\)\](?:\s|$)/);
    expect(document.querySelector("[data-hero]")).toBeNull();
    expect(document.querySelector("h1")).toBeNull();
    expect(document.querySelector("[data-cta]")).toBeNull();
  });

  it("«Повторить» reads through /bff and shows the preview meanwhile", async () => {
    setPreview(100001, previewOf());
    screen({ initial: failure("server") });

    fireEvent.click(document.querySelector('[data-slot="error-state"] button')!);

    expect(state.sent.map((sent) => sent.path)).toEqual(["listings/100001"]);
    expect(state.scrollToTop).toHaveBeenCalledTimes(1);
    expect(root().getAttribute("data-listing-state")).toBe("preview");
    await act(async () => state.sent[0].resolve({ ok: true, data: detailsOf(), meta: { source: "stub" } }));
    expect(root().getAttribute("data-listing-state")).toBe("loaded");
  });
});
