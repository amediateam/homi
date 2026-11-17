import { getMessages } from "@homi/i18n";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { type ReactNode, Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ContactData, ListingDetails, ListingInitial } from "@/features/listing/listingData";
import type { ActionResult } from "@/lib/actions/run";

type Call = (input: { number: number }, auth?: unknown, locale?: string) => Promise<ActionResult<unknown>>;

const state = vi.hoisted(() => ({
  /** The bot's username of the brand layer: empty hides the share button. */
  bot: "",
  pathname: "/listing/100001",
  push: vi.fn(),
  back: vi.fn(),
  getContact: vi.fn<(input: { number: number }, auth?: unknown, locale?: string) => Promise<ActionResult<ContactData>>>(),
  translate: vi.fn<Call>(),
  prepareShare: vi.fn<Call>(),
}));
vi.mock("@/lib/api/browser", () => ({ bffFetch: () => new Promise(() => {}) }));
/** `useMoney` (history prices, the market block and sheet) without a profile currency prints dollars. */
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: "ready", me: null }) }));
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: vi.fn(), reauthenticate: vi.fn() }));
vi.mock("@/lib/actions/favorites", () => ({ setFavorite: vi.fn(() => new Promise(() => {})) }));
vi.mock("@/lib/actions/listing", () => ({ getContact: state.getContact, translate: state.translate, prepareShare: state.prepareShare }));
vi.mock("@/lib/actions/hidden", () => ({ hideListing: vi.fn(), unhideListing: vi.fn(), blockAuthor: vi.fn(), unblockAuthor: vi.fn() }));
vi.mock("@/lib/actions/reports", () => ({ reportListing: vi.fn() }));
vi.mock("@/lib/navigation/useBack", () => ({ useBack: () => ({ canGoBack: true, back: state.back }) }));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => state.pathname, useRouter: () => ({ push: state.push, replace: vi.fn() }) }));
/** The child routes read the document's address (`?i=`, `?step=`). */
vi.mock("next/navigation", () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
/** The brand layer with a bot name per test; the link hosts read the same object. */
vi.mock("@/lib/brand", async (importOriginal) => {
  const { brand } = await importOriginal<typeof import("@/lib/brand")>();
  return {
    brand: {
      ...brand,
      get botUsername() {
        return state.bot;
      },
    },
  };
});

import { resetPendingFavorites } from "@/features/feed/FavButton";
import { ListingActionsRoute } from "@/features/listing/actions/ListingActionsRoute";
import { ListingLayer } from "@/features/listing/ListingLayer";
import { ListingScreen } from "@/features/listing/ListingScreen";
import { MarketSheetRoute } from "@/features/listing/market/MarketSheetRoute";
import { resetMarkerShows } from "@/features/listing/sections/MarketBlock";
import { resetTranslations } from "@/features/listing/translation/translationCache";
import { useListingRecord } from "@/features/listing/useListing";
import { resetViewStates } from "@/features/listing/viewState";
import { PhotoViewerRoute } from "@/features/listing/viewer/PhotoViewerRoute";
import { clearTracked, recentTracked } from "@/lib/analytics/events";
import { getPreview, resetPreviews, setPreview } from "@/lib/data/previewCache";
import { resetSessionMaps } from "@/lib/data/sessionMaps";
import { resetSources } from "@/lib/data/sources";
import { resetResources } from "@/lib/data/useResource";
import { clearRecentErrors, recentErrors } from "@/lib/errors/report";
import { dismissToast } from "@/lib/ui/toast";

import { contactOf, detailsOf } from "../helpers/details";
import { previewOf } from "../helpers/listing";

/** The concrete forms of the stub number +998 00 000 00 67 (D-10): none may be in the document before a tap. */
const DIGIT_FORMS = ["+998000000067", "000000067", "000 00 67", "000-00-67", "+998 00 000-00-67", "+998 00 000 00 67"];
const DISPLAY = "+998 00 000-00-67";
/** The post's text as the API answers it: the author's number and another one, both masked by the server. */
const TWO_NUMBERS = "Сдаётся квартира. Звоните: +998 ** *** ** 67, запасной: +998 ** *** ** 99";

const initialOk = (details: ListingDetails = detailsOf()): ListingInitial => ({
  ok: true,
  data: { listing: details, source: "stub" },
  meta: { source: "stub" },
});

/** The layout's `params`, already settled the way React marks a promise it has read (as `ListingLayer.test.tsx`). */
const PARAMS = Object.assign(Promise.resolve({ number: "100001" }), { status: "fulfilled", value: { number: "100001" } });

/** The listing layer of the `@overlay` tree with the resolved screen and one child route, as the layout renders them. */
async function mount({ initial = initialOk(), child = null }: { initial?: ListingInitial | null; child?: ReactNode } = {}) {
  const view = render(
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      <Suspense fallback={null}>
        <ListingLayer params={PARAMS} presentation="layer" screen={<ListingScreen key={100001} number={100001} initial={initial} />}>
          {child}
        </ListingLayer>
      </Suspense>
    </NextIntlClientProvider>,
  );
  await act(async () => {});
  return view;
}

/** Lets the `next/dynamic` chunk of a child route load and render. */
async function settleChild() {
  await act(() => vi.dynamicImportSettled());
}

const layer = () => document.querySelector<HTMLElement>('[data-route="listing"][data-layer="overlay"]')!;
const overlay = () => document.querySelector<HTMLElement>('[data-slot="route-overlay"]')!;
const classes = (element: Element | null) => (element?.className ?? "").split(/\s+/);
const openOriginal = () => fireEvent.click(document.querySelector("button[data-original-toggle]")!);

/** The blocks of the screen in document order, by their test ids. */
function blockOrder(): string[] {
  const names: [string, string][] = [
    ["[data-hero]", "hero"],
    ["[data-status-banner]", "banner"],
    ["[data-title-row]", "title"],
    ["[data-key-facts]", "keyFacts"],
    ["[data-section-skeleton]", "skeleton"],
    ["[data-cta]", "cta"],
  ];
  const selector = [...names.map(([css]) => css), "[data-section]"].join(", ");
  return [...layer().querySelectorAll(selector)].map((element) => {
    const known = names.find(([css]) => element.matches(css));
    return known ? known[1] : element.getAttribute("data-section")!;
  });
}

let fake: FakeTelegram | null = null;
const haptics = () =>
  (fake?.calls ?? []).filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);

beforeEach(() => {
  state.bot = "";
  state.pathname = "/listing/100001";
  state.push.mockReset();
  state.back.mockReset();
  state.getContact.mockReset();
  state.getContact.mockImplementation(() => new Promise(() => {}));
  state.translate.mockReset();
  state.prepareShare.mockReset();
  state.prepareShare.mockImplementation(() => new Promise(() => {}));
  window.history.replaceState(null, "", "/ru/listing/100001");
  fake = fakeTelegram({ version: "8.0" });
});

afterEach(() => {
  cleanup();
  dismissToast();
  resetResources();
  resetPreviews();
  resetSessionMaps();
  resetSources();
  resetViewStates();
  resetPendingFavorites();
  resetTranslations();
  resetMarkerShows();
  clearTracked();
  clearRecentErrors();
  window.history.replaceState(null, "", "/");
  fake?.uninstall();
  fake = null;
});

describe("ListingScreen wiring (WP-26, SCR-018)", () => {
  it("the blocks in legacy's order, the CTA last; «Рядом» inside the location and the original text inside the source", async () => {
    await mount({ initial: initialOk(detailsOf({ status_text: "Снято с публикации" })) });

    expect(blockOrder()).toEqual([
      "hero",
      "banner",
      "title",
      "keyFacts",
      "market",
      "facts",
      "stats",
      "history",
      "location",
      "nearby",
      "author",
      "description",
      "sources",
      "cta",
    ]);
    expect(document.querySelector('[data-section="location"] [data-section="nearby"]')).not.toBeNull();
    expect(document.querySelector('[data-section="history"]')?.getAttribute("data-history")).toBe("timeline");
    expect(document.querySelector("[data-original]")).toBeNull();

    openOriginal();

    expect(document.querySelector('[data-section="sources"] [data-original] pre[data-original-text]')?.textContent).toBe(detailsOf().original.text);
    // ru: no translation is offered (BR-APP-034).
    expect(document.querySelector("button[data-translate]")).toBeNull();
  });

  it("the sections bring their own gutter: their container adds none", async () => {
    await mount();

    const sections = document.querySelector<HTMLElement>('[data-slot="listing-sections"]')!;
    expect(classes(sections).some((name) => /^p[xlr]?-/.test(name))).toBe(false);
    expect(classes(sections.parentElement).some((name) => /^p[xlr]?-/.test(name))).toBe(false);
    expect(classes(document.querySelector('[data-section="facts"]'))).toContain("px-(--gutter)");
  });

  it("preview: the section skeletons of 3 and 4 lines and the pending CTA with the card's price", async () => {
    setPreview(100001, previewOf({ photos: { preview: detailsOf().photos.preview, count: 8, cover: null } }));
    await mount({ initial: null });

    expect(layer().querySelector("[data-listing-state]")?.getAttribute("data-listing-state")).toBe("preview");
    expect(blockOrder()).toEqual(["hero", "title", "keyFacts", "skeleton", "skeleton", "cta"]);
    expect([...document.querySelectorAll("[data-section-skeleton]")].map((block) => block.getAttribute("data-section-skeleton"))).toEqual(["3", "4"]);
    expect(document.querySelector('[data-cta] [data-cta-action="pending"]')).not.toBeNull();
    expect(document.querySelector("[data-cta] button[data-cta-action]")).toBeNull();
    expect(document.querySelector("[data-cta] [data-cta-price]")?.textContent).toBe("$600/мес");
    expect(document.querySelector("[data-section]")).toBeNull();
  });

  describe("share", () => {
    it("is hidden without a bot name", async () => {
      await mount();

      expect(document.querySelector('button[data-action="share"]')).toBeNull();
      expect(document.querySelector('button[data-action="menu"]')).not.toBeNull();
    });

    it("is shown with one, before the heart: a tap plays the light haptic, logs the share and prepares the message", async () => {
      state.bot = "homi_test_bot";
      await mount();

      const buttons = [...document.querySelectorAll("[data-title-row] button")];
      expect(buttons.map((button) => button.getAttribute("data-action") ?? button.getAttribute("data-fav"))).toEqual(["share", "plain", "menu"]);
      expect(buttons[0].getAttribute("aria-label")).toBe("Поделиться");

      fireEvent.click(buttons[0]);

      expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
      expect(recentTracked()).toEqual([{ name: "listing_shared", props: { listing_id: 100001 } }]);
      await act(async () => {});
      expect(state.prepareShare).toHaveBeenCalledWith({ number: 100001 }, undefined, "ru");
    });

    it("is offered in the preview too", async () => {
      state.bot = "homi_test_bot";
      setPreview(100001, previewOf());
      await mount({ initial: null });

      expect(document.querySelector('button[data-action="share"]')).not.toBeNull();
    });
  });

  describe("layers and the z ladder (`03` §3.6)", () => {
    it("the CTA bar stays inside the listing layer at --z-cta; the layer is at --z-overlay", async () => {
      await mount();

      const cta = document.querySelector<HTMLElement>("[data-cta]")!;
      expect(layer().contains(cta)).toBe(true);
      expect(classes(cta)).toEqual(expect.arrayContaining(["fixed", "bottom-0", "z-(--z-cta)"]));
      expect(classes(overlay())).toContain("z-(--z-overlay)");
      expect(document.body.classList.contains("listing-open")).toBe(true);
    });

    it("the viewer is portalled to the body at --z-viewer, over the listing that stays mounted, and locks the body", async () => {
      window.history.replaceState(null, "", "/ru/listing/100001/photos?i=2");
      state.pathname = "/listing/100001/photos";
      await mount({ child: <PhotoViewerRoute /> });
      await settleChild();

      const viewer = await screen.findByRole("dialog", { name: "Фото" });
      expect(viewer.getAttribute("data-route")).toBe("listing/photos");
      expect(viewer.parentElement).toBe(document.body);
      expect(layer().contains(viewer)).toBe(false);
      expect(classes(viewer)).toEqual(expect.arrayContaining(["fixed", "inset-0", "z-(--z-viewer)"]));
      expect(viewer.querySelector("[data-viewer-counter]")?.textContent).toBe("3 / 8");
      expect(layer().querySelector('[data-listing-state="loaded"]')).not.toBeNull();
      expect(document.body.classList.contains("locked")).toBe(true);
    });

    it("the market sheet is portalled to the body at the backdrop level and reads the layer's listing", async () => {
      window.history.replaceState(null, "", "/ru/listing/100001/market");
      state.pathname = "/listing/100001/market";
      await mount({ child: <MarketSheetRoute /> });
      await settleChild();

      await screen.findByRole("dialog", { name: "Откуда эта цифра" });
      const sheet = document.querySelector<HTMLElement>('[data-slot="bottom-sheet"]')!;
      expect(sheet.querySelector('[data-route="listing/market"]')).not.toBeNull();
      expect(sheet.querySelector('[data-route="listing/market"]')?.hasAttribute("data-layer")).toBe(false);
      expect(overlay().contains(sheet)).toBe(false);
      expect(document.body.contains(sheet)).toBe(true);
      expect(classes(sheet)).toContain("z-(--z-backdrop)");
      expect(classes(document.querySelector('[data-slot="bottom-sheet-overlay"]'))).toContain("z-(--z-backdrop)");
      expect(sheet.querySelector('[data-market-paragraph="median"]')).not.toBeNull();
    });

    it("the actions sheet is portalled to the body at the backdrop level with the listing's masked block hint", async () => {
      window.history.replaceState(null, "", "/ru/listing/100001/actions");
      state.pathname = "/listing/100001/actions";
      await mount({ child: <ListingActionsRoute /> });
      await settleChild();

      await screen.findByRole("dialog", { name: "Объявление" });
      const sheet = document.querySelector<HTMLElement>('[data-slot="bottom-sheet"]')!;
      const menu = sheet.querySelector('[data-route="listing/actions"]');
      expect(menu?.getAttribute("data-step")).toBe("menu");
      expect(menu?.hasAttribute("data-layer")).toBe(false);
      expect(overlay().contains(sheet)).toBe(false);
      expect(classes(sheet)).toContain("z-(--z-backdrop)");
      expect(sheet.querySelector('button[data-action-row="block"]')?.textContent).toContain("+998 ** *** ** 67");
    });
  });

  describe("the author's number (DEC-52)", () => {
    it("no digit of it anywhere in the document before a tap, the original text open, and no request", async () => {
      await mount({ initial: initialOk(detailsOf({ original: { ...detailsOf().original, text: TWO_NUMBERS } })) });
      openOriginal();

      const html = document.documentElement.outerHTML;
      for (const form of DIGIT_FORMS) {
        expect(html).not.toContain(form);
      }
      expect(document.querySelector('button[data-phone="reveal"]')?.textContent).toBe("Показать номер");
      expect([...document.querySelectorAll("button[data-masked-phone]")].map((button) => button.getAttribute("data-masked-phone"))).toEqual(["67", "99"]);
      expect(document.querySelector("button[data-own-phone]")).toBeNull();
      expect(document.querySelector('[data-cta] button[data-cta-action="call"]')).not.toBeNull();
      expect(state.getContact).not.toHaveBeenCalled();
      expect(recentTracked()).toEqual([]);
    });

    it("«Показать номер» → one request; the digits show in the author row and on the matching number of the text only", async () => {
      state.getContact.mockImplementation(async () => ({ ok: true, data: contactOf(), meta: { source: "stub" } }));
      let record: ReturnType<typeof useListingRecord> | null = null;
      function RecordProbe() {
        record = useListingRecord(100001);
        return null;
      }
      setPreview(100001, previewOf());
      await mount({ initial: initialOk(detailsOf({ original: { ...detailsOf().original, text: TWO_NUMBERS } })), child: <RecordProbe /> });
      openOriginal();

      await act(async () => {
        fireEvent.click(document.querySelector('button[data-phone="reveal"]')!);
      });

      expect(state.getContact).toHaveBeenCalledTimes(1);
      expect(state.getContact).toHaveBeenCalledWith({ number: 100001 }, undefined, "ru");
      expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)", "HapticFeedback.impactOccurred(medium)"]);
      const number = document.querySelector('[data-section="author"] button[data-phone="number"]');
      expect(number?.textContent).toBe(DISPLAY);
      expect(classes(number)).toContain("ph-mask");
      expect(document.querySelector('button[data-phone="reveal"]')).toBeNull();
      expect(document.querySelector("[data-original] button[data-own-phone]")?.textContent).toBe(DISPLAY);
      expect(document.querySelector("button[data-masked-phone]")).toBeNull();
      expect([...document.querySelectorAll("[data-masked-phone-text]")].map((part) => part.textContent)).toEqual(["+998 ** *** ** 99"]);
      expect(document.querySelector("pre[data-original-text]")?.textContent).toBe(`Сдаётся квартира. Звоните: ${DISPLAY}, запасной: +998 ** *** ** 99`);

      // The digits live in the screen's contact only: not in the resource, the preview, the events or the errors.
      const elsewhere = JSON.stringify([record, getPreview(100001), recentTracked(), recentErrors().map((entry) => entry.context)]);
      for (const form of DIGIT_FORMS) {
        expect(elsewhere).not.toContain(form);
      }
    });
  });
});
