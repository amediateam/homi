import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { freezeClock } from "@homi/testing";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps, ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  setFavorite: vi.fn(),
  links: [] as { href: string; prefetch?: boolean; scroll?: boolean }[],
}));
vi.mock("@/lib/actions/favorites", () => ({ setFavorite: state.setFavorite }));
/** The counted `Link` needs the App Router: a plain anchor that records what it was given and never navigates. */
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, prefetch, scroll, onClick, ...props }: ComponentProps<"a"> & { href: string; prefetch?: boolean; scroll?: boolean }) => {
    state.links.push({ href, prefetch, scroll });
    return (
      <a
        {...props}
        href={href}
        onClick={(event) => {
          onClick?.(event);
          event.preventDefault();
        }}
      />
    );
  },
}));
/** `factsLine` runs once per render of the card's body: the count tells a re-rendered card from a re-rendered age. */
vi.mock("@/features/feed/cardText", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/feed/cardText")>();
  return { ...actual, factsLine: vi.fn(actual.factsLine) };
});

import { factsLine } from "@/features/feed/cardText";
import { resetPendingFavorites } from "@/features/feed/FavButton";
import { ListingCard, type ListingCardProps } from "@/features/feed/ListingCard";
import { ListingCardSkeleton } from "@/features/feed/ListingCardSkeleton";
import { getPreview, resetPreviews } from "@/lib/data/previewCache";
import { isFavorite, isSeen, resetSessionMaps } from "@/lib/data/sessionMaps";

import { previewOf } from "../helpers/listing";

const PHOTOS = [1, 2, 3].map((index) => `https://cdn.homi.loc/stub/100001/${index}.jpg?e=0&s=stub`);
const BELOW = { label: "Вторичка", median_delta: -0.12, tone: "good" };

function withIntl(children: ReactNode, locale: Locale = "ru") {
  return (
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
      {children}
    </NextIntlClientProvider>
  );
}

function card(props: Partial<ListingCardProps> = {}, locale: Locale = "ru") {
  const item = props.item ?? previewOf({ photos: { preview: PHOTOS, count: 8, cover: null }, is_owner: true, market: BELOW });
  return render(withIntl(<ListingCard {...props} item={item} />, locale));
}

const article = () => document.querySelector("article")!;
const anchor = () => document.querySelector("a")!;
const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
const lastLink = () => state.links.at(-1);

beforeEach(() => {
  state.setFavorite.mockReset();
  state.setFavorite.mockResolvedValue({ ok: true, data: { favorite: true }, meta: { source: "stub" } });
  state.links = [];
});

afterEach(() => {
  cleanup();
  resetSessionMaps();
  resetPreviews();
  resetPendingFavorites();
});

describe("ListingCard: the full card (SCR-007)", () => {
  it("shows the badge, the heart, the price with its period, the market chip, the facts, the age and the location", () => {
    card();

    expect(text("[data-badge]")).toBe("Хозяин");
    expect(document.querySelector("[data-badge]")?.getAttribute("data-badge")).toBe("owner");
    expect(document.querySelector("[data-badge]")?.getAttribute("data-badge-tone")).toBe("quiet");
    expect(document.querySelector("button[data-fav]")?.getAttribute("aria-label")).toBe("В избранное");
    expect(text("[data-price] b")).toBe("$600");
    expect(text("[data-price]")).toBe("$600/мес−12% к рынку");
    expect(document.querySelector("[data-tone]")?.getAttribute("data-tone")).toBe("good");
    expect(text("[data-facts] span:first-child")).toBe("2-комн. квартира, 54 м² · 54 м² · 3/9 эт. · Вторичка");
    expect(text("[data-age]")).toBe("сегодня");
    expect(text("[data-location]")).toBe("Юнусабад · Мегапланет · Минор · 700 м");
  });

  it("strips every photo of the preview and dots them by `preview.length`, not `photos.count`", () => {
    card();

    expect(document.querySelectorAll("[data-slide]")).toHaveLength(3);
    expect(document.querySelectorAll("[data-dots] > span")).toHaveLength(3);
    expect(document.querySelector("img")?.getAttribute("sizes")).toBe("(min-width: 640px) 608px, calc(100vw - 32px)");
  });

  it("is a link to the listing without prefetch and without a scroll to the top", () => {
    card();

    expect(anchor().getAttribute("href")).toBe("/listing/100001");
    expect(lastLink()).toEqual({ href: "/listing/100001", prefetch: false, scroll: false });
  });

  it("takes another address through `href`", () => {
    card({ href: "/listing/100001?from=map" });

    expect(lastLink()?.href).toBe("/listing/100001?from=map");
  });

  it("a tap records `seen` and the preview, then calls onOpen; the router push is the link's", () => {
    const onOpen = vi.fn();
    const item = previewOf({ number: 100005 });
    card({ item, onOpen });

    fireEvent.click(anchor());

    expect(isSeen(100005, false)).toBe(true);
    expect(getPreview(100005)).toBe(item);
    expect(onOpen).toHaveBeenCalledWith(100005, item);
  });

  it("the heart sits beside the link, not inside it; the link's name carries the listing, not the overlays' labels", () => {
    card({ viewed: true, item: previewOf({ has_video: true, is_owner: true, market: BELOW }) });

    expect(anchor().querySelector("button")).toBeNull();
    expect(article().querySelector(":scope > button[data-fav]")).not.toBeNull();
    let name = "";
    screen.getByRole("link", {
      name: (value) => {
        name = value;
        return true;
      },
    });
    expect(name).toContain("$600");
    expect(name).not.toContain("В избранное");
    expect(name).not.toContain("Смотреть видео");
  });

  it("the focus ring is the article's: containment would clip an outset ring of the link", () => {
    card();

    const classes = article().className.split(" ");
    expect(classes).toContain("[content-visibility:auto]");
    expect(classes).toContain("has-[a:focus-visible]:ring-2");
    expect(classes).toContain("has-[a:focus-visible]:ring-ring");
    expect(classes).toContain("rounded-photo");
    expect(anchor().className).not.toContain("ring");
  });

  it("a tap on the heart neither opens the listing nor records it, and reports the new state", () => {
    const onOpen = vi.fn();
    const onFavorite = vi.fn();
    card({ item: previewOf({ number: 100005 }), onOpen, onFavorite });

    fireEvent.click(document.querySelector("button[data-fav]")!);

    expect(onOpen).not.toHaveBeenCalled();
    expect(isSeen(100005, false)).toBe(false);
    expect(getPreview(100005)).toBeNull();
    expect(onFavorite).toHaveBeenCalledWith(100005, true);
    expect(isFavorite(100005, false)).toBe(true);
  });

  it("the heart starts from `favorite`, else from the card's flag", () => {
    card({ favorite: true });
    expect(document.querySelector("button[data-fav]")?.getAttribute("aria-pressed")).toBe("true");
    cleanup();

    card({ item: previewOf({ favorite: true }) });
    expect(document.querySelector("button[data-fav]")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("negotiable: «Цена договорная» without a period or a kind", () => {
    card({ item: previewOf({ price: null }) });

    expect(text("[data-price]")).toBe("Цена договорная");
  });

  it.each([
    ["ru", "down_payment", "$18 000· первый взнос"],
    ["ru", "business", "$18 000· цена за бизнес, помещение в аренде"],
    ["uz", "business", "$18 000· biznes narxi, joy ijarada"],
    ["en", "business", "$18 000· business price, premises rented"],
  ] as const)("%s: the price kind %s adds its label", (locale, kind, expected) => {
    const price = { display: "$18 000", period: null, alt: null, notes: [], usd: 18000, kind };
    card({ item: previewOf({ price }) }, locale);

    expect(text("[data-price]")).toBe(expected);
  });

  it("a video listing shows ▶ as a hidden mark and frames each photo on a blurred copy; no referrer leaves with either", () => {
    card({ item: previewOf({ has_video: true, photos: { preview: PHOTOS, count: 3, cover: null } }) });

    expect(document.querySelector("[data-video]")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("img", { name: "Смотреть видео в Telegram" })).toBeNull();
    expect(document.querySelectorAll('[data-slide="0"] img')).toHaveLength(2);
    const backdrop = document.querySelector('[data-slide="0"] img[aria-hidden]')!;
    const photo = document.querySelector('[data-slide="0"] img:not([aria-hidden])')!;
    expect(backdrop.getAttribute("src")).toBe("https://cdn.homi.loc/stub/100001/1.s.jpg?e=0&s=stub");
    for (const img of [backdrop, photo]) {
      expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
      expect(img.getAttribute("decoding")).toBe("async");
    }
    expect(photo.className).toContain("object-contain");
  });

  it("without a video there is no ▶", () => {
    card();

    expect(document.querySelector("[data-video]")).toBeNull();
  });

  it("without photos: the placeholder, no image and no dots", () => {
    card({ item: previewOf({ photos: { preview: [], count: 0, cover: null } }) });

    expect(document.querySelector('[data-photo="placeholder"]')).not.toBeNull();
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("[data-dots]")).toBeNull();
  });

  it("the eye shows only when viewed (BR-APP-040), with its label", () => {
    card();
    expect(screen.queryByRole("img", { name: "Вы открывали это объявление" })).toBeNull();
    cleanup();

    card({ viewed: true });
    const eye = screen.getByRole("img", { name: "Вы открывали это объявление" });
    expect(eye.getAttribute("title")).toBe("Вы открывали это объявление");
    cleanup();

    card({ item: previewOf({ viewed: true }) });
    expect(document.querySelector("[data-viewed]")).not.toBeNull();
  });

  it("the status text of the listing is a warning tag, rendered as text", () => {
    card({ item: previewOf({ status_text: "<b>Снято</b> с публикации" }) });

    expect(text("[data-status]")).toBe("<b>Снято</b> с публикации");
    expect(document.querySelector("[data-status] b")).toBeNull();
    const tag = document.querySelector("[data-status]")!.className.split(" ");
    expect(tag).toContain("bg-[#fff4e6f5]");
    expect(tag).not.toContain("bg-[#ffffffb8]");
  });

  it("every server string renders as text", () => {
    card({ item: previewOf({ title: "<i>2-комн.</i>", landmark: "<script>x</script>", metro: null, center_km: null }) });

    expect(text("[data-facts] span:first-child")?.startsWith("<i>2-комн.</i>")).toBe(true);
    expect(text("[data-location]")).toBe("Юнусабад · <script>x</script>");
    expect(document.querySelector("article i, article script")).toBeNull();
  });

  it("an unknown tone is drawn neutral and keeps the real sign (LB-APP-039)", () => {
    card({ item: previewOf({ market: { label: null, median_delta: -0.12, tone: "brand_new" } }) });

    expect(document.querySelector("[data-tone]")?.getAttribute("data-tone")).toBe("neutral");
    expect(text("[data-tone]")).toBe("−12% к рынку");
  });

  it("`same` and `mixed` show their word; no verdict, no chip", () => {
    card({ item: previewOf({ market: { label: null, median_delta: 0.01, tone: "same" } }) });
    expect(text("[data-tone]")).toBe("≈ обычная");
    const chip = document.querySelector("[data-tone]")!.className.split(" ");
    expect(chip).toContain("font-medium");
    expect(chip).not.toContain("font-semibold");
    cleanup();

    card({ item: previewOf({ market: { label: null, median_delta: 0.3, tone: "mixed" } }) });
    expect(text("[data-tone]")).toBe("≈ спорно");
    cleanup();

    card({ item: previewOf({ market: { label: null, median_delta: null, tone: "good" } }) });
    expect(document.querySelector("[data-tone]")).toBeNull();
    expect(document.querySelector("[data-badge]")).toBeNull();
  });

  it("an eager card loads its first photo at once with high priority and renders on screen", () => {
    card({ eager: true });

    const img = document.querySelector("img")!;
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBe("high");
    expect(article().className).not.toContain("content-visibility");
    expect(article().hasAttribute("data-card")).toBe(true);
  });

  it("a server-rendered card takes the server's network hint: its HTML asks for the small variant only", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(withIntl(<ListingCard item={previewOf({ photos: { preview: PHOTOS, count: 3, cover: null } })} eager serverSmallOnly />));

    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("https://cdn.homi.loc/stub/100001/1.s.jpg?e=0&s=stub");
    expect(img.hasAttribute("srcset")).toBe(false);
    expect(img.className).toContain("opacity-100");
  });

  it("a later card is lazy and skips rendering off screen (content-visibility, 420 px)", () => {
    card();

    const img = document.querySelector("img")!;
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.hasAttribute("fetchpriority")).toBe(false);
    expect(article().className).toContain("[content-visibility:auto]");
    expect(article().className).toContain("[contain-intrinsic-size:auto_420px]");
  });
});

describe("ListingCard: the badge kinds (BR-APP-026, since index-CBlEKxdL.js)", () => {
  const badge = () => document.querySelector("[data-badge]")!;
  const classes = () => badge().className.split(" ");

  it("«Проверенный хозяин» carries the green shield before its text", () => {
    card({ item: previewOf({ owner_verified: true, is_owner: true, market: BELOW }) });

    expect(badge().getAttribute("data-badge-tone")).toBe("verified");
    expect(badge().textContent).toBe("Проверенный хозяин");
    const shield = badge().querySelector("svg")!;
    expect(shield.getAttribute("aria-hidden")).toBe("true");
    expect(shield.getAttribute("width")).toBe("15");
    expect(shield.getAttribute("stroke-width")).toBe("2.4");
    expect(shield.getAttribute("class")).toContain("text-[#16a34a]");
    expect(classes()).toEqual(expect.arrayContaining(["inline-flex", "items-center", "gap-[5px]", "pl-[8px]"]));
  });

  it("«Хозяин» is the quiet tag: grey and lighter, without an icon", () => {
    card({ item: previewOf({ is_owner: true, market: BELOW }) });

    expect(badge().getAttribute("data-badge-tone")).toBe("quiet");
    expect(classes()).toEqual(expect.arrayContaining(["font-medium", "text-[#4b4f57]"]));
    expect(badge().querySelector("svg")).toBeNull();
  });

  it("the price warnings are orange and «Ниже рынка» is the plain tag", () => {
    card({ item: previewOf({ is_owner: false, market: { label: null, median_delta: -0.55, tone: "check" } }) });
    expect(badge().getAttribute("data-badge-tone")).toBe("warn");
    expect(classes()).toEqual(expect.arrayContaining(["bg-[#fff4e6f5]", "text-[#9a4a00]"]));
    cleanup();

    card({ item: previewOf({ is_owner: false, market: BELOW }) });
    expect(badge().getAttribute("data-badge-tone")).toBe("plain");
    expect(classes()).toEqual(expect.arrayContaining(["font-semibold", "text-[#111]"]));
    expect(badge().querySelector("svg")).toBeNull();
  });
});

describe("ListingCard: the age (BR-APP-109, since index-CIa0Ldj2.js)", () => {
  const AT = "2026-11-14T06:40:00+00:00";
  const posted = { label: "Опубликовано", when: "сегодня", at: AT };
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("the server render prints the server's string; after hydration the card shows the computed label", async () => {
    restore = freezeClock("2026-11-14T06:45:00Z");
    const element = withIntl(<ListingCard item={previewOf({ posted })} />);
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    expect(container.querySelector("[data-age]")?.textContent).toBe("сегодня");

    document.body.appendChild(container);
    const root = await act(async () => hydrateRoot(container, element));
    expect(container.querySelector("[data-age]")?.textContent).toBe("5 мин назад");
    act(() => root.unmount());
    container.remove();
  });

  it("follows the minute clock: a new minute changes the label and does not re-render the card", () => {
    restore = freezeClock("2026-11-14T06:45:50Z");
    card({ item: previewOf({ posted }) });
    expect(text("[data-age]")).toBe("5 мин назад");
    const bodyRenders = vi.mocked(factsLine).mock.calls.length;

    act(() => vi.advanceTimersByTime(15_000));

    expect(text("[data-age]")).toBe("6 мин назад");
    expect(vi.mocked(factsLine).mock.calls.length).toBe(bodyRenders);
  });

  it("without a `posted.at` it keeps the server's string", () => {
    restore = freezeClock("2026-11-14T06:45:00Z");
    card({ item: previewOf({ posted: { ...posted, at: null } }) });

    expect(text("[data-age]")).toBe("сегодня");
  });
});

describe("ListingCard: the compact card (WP-27)", () => {
  it("one photo, no dots, no badge, no eye, no age; the short verdict only", () => {
    card({
      compact: true,
      viewed: true,
      item: previewOf({ photos: { preview: PHOTOS, count: 8, cover: null }, is_owner: true, market: BELOW }),
    });

    expect(document.querySelectorAll("[data-slide]")).toHaveLength(1);
    expect(document.querySelector("img")?.getAttribute("sizes")).toBe("112px");
    expect(document.querySelector("[data-dots]")).toBeNull();
    expect(document.querySelector("[data-badge]")).toBeNull();
    expect(document.querySelector("[data-viewed]")).toBeNull();
    expect(text("[data-tone]")).toBe("−12%");
    expect(document.querySelectorAll("[data-facts] span")).toHaveLength(1);
    expect(text("[data-location]")).toBe("Юнусабад · Мегапланет · Минор · 700 м");
    expect(article().hasAttribute("data-card")).toBe(false);
    expect(article().className).not.toContain("content-visibility");
  });

  it("the heart sits beside the link over the photo's top-right corner, the focus ring on the article", () => {
    card({ compact: true });

    const heart = article().querySelector(":scope > button[data-fav]")!;
    const classes = heart.className.split(" ");
    expect(classes).toEqual(expect.arrayContaining(["size-[32px]", "top-[calc(50%-52px)]", "left-[76px]", "right-auto"]));
    expect(classes).not.toContain("top-[4px]");
    expect(classes).not.toContain("right-[4px]");
    expect(article().className.split(" ")).toEqual(expect.arrayContaining(["relative", "rounded-small", "has-[a:focus-visible]:ring-2"]));
  });

  it("shows a shield after the price and the short verdict for a verified owner, and only then", () => {
    card({ compact: true, item: previewOf({ owner_verified: true, is_owner: true, market: BELOW }) });

    const shield = screen.getByRole("img", { name: "Проверенный хозяин" });
    expect(shield.getAttribute("title")).toBe("Проверенный хозяин");
    expect(shield.closest("[data-price]")?.lastElementChild).toBe(shield);
    expect(shield.previousElementSibling?.getAttribute("data-tone")).toBe("good");
    expect(shield.className.split(" ")).toEqual(expect.arrayContaining(["text-good", "ml-[4px]"]));
    expect(shield.querySelector("svg")?.getAttribute("width")).toBe("16");
    expect(document.querySelector("[data-badge]")).toBeNull();
    cleanup();

    card({ compact: true, item: previewOf({ owner_verified: false, is_owner: true, market: BELOW }) });
    expect(document.querySelector("[data-verified]")).toBeNull();
    cleanup();

    card({ item: previewOf({ owner_verified: true, market: BELOW }) });
    expect(document.querySelector("[data-verified]")).toBeNull();
  });

  it("keeps the price-kind label, the status text, the heart and the link", () => {
    const price = { display: "$18 000", period: null, alt: null, notes: [], usd: 18000, kind: "down_payment" as const };
    card({ compact: true, item: previewOf({ price, status_text: "Снято с публикации" }) });

    expect(text("[data-price]")).toBe("$18 000· первый взнос");
    expect(text("[data-status]")).toBe("Снято с публикации");
    expect(document.querySelector("button[data-fav]")).not.toBeNull();
    expect(lastLink()).toEqual({ href: "/listing/100001", prefetch: false, scroll: false });
  });
});

describe("ListingCardSkeleton (SCR-008)", () => {
  it("a shimmer photo box and three bars of 62 %, 80 % and 35 %, hidden from assistive technology", () => {
    render(<ListingCardSkeleton />);

    const skeleton = document.querySelector("[data-card-skeleton]")!;
    expect(skeleton.getAttribute("aria-hidden")).toBe("true");
    const shimmers = skeleton.querySelectorAll("[data-shimmer]");
    expect(shimmers).toHaveLength(4);
    expect(shimmers[0].className).toContain("aspect-[4/3]");
    expect([...shimmers].slice(1).map((bar) => bar.className.match(/w-\[(\d+)%\]/)?.[1])).toEqual(["62", "80", "35"]);
  });
});
