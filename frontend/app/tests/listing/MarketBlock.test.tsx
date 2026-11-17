import { getMessages } from "@homi/i18n";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** `useMoney` without a profile currency or a rate prints dollars. */
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ me: null }) }));
vi.mock("@/lib/reference/useReference", () => ({ useReference: () => ({ usdUzs: 0 }) }));
const state = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: state.push, replace: vi.fn() }) }));

import { marketVerdict } from "@/features/feed/verdict";
import type { ListingComparison, ListingDetails } from "@/features/listing/listingData";
import { markerPosition } from "@/features/listing/market/marketText";
import { MarketBlock, resetMarkerShows } from "@/features/listing/sections/MarketBlock";

import { detailsOf } from "../helpers/details";
import { translator } from "../helpers/listing";

const t = translator("ru");
const BASE = detailsOf();
const COMPARISON = BASE.comparison!;

/** The stub listing with `market` and `comparison` fields changed on top of its own. */
function withMarket(market: Partial<ListingDetails["market"]> = {}, comparison: Partial<ListingComparison> | null = {}, rest: Partial<ListingDetails> = {}): ListingDetails {
  return detailsOf({
    market: { ...BASE.market, ...market },
    comparison: comparison === null ? null : { ...COMPARISON, ...comparison },
    ...rest,
  });
}

function block(details: ListingDetails = BASE, number = 100001, verdict = marketVerdict(details, "ru", t)) {
  return (
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      <MarketBlock number={number} details={details} verdict={verdict} />
    </NextIntlClientProvider>
  );
}

const section = () => document.querySelector<HTMLElement>('[data-section="market"]');
const marker = () => document.querySelector<HTMLElement>("[data-market-marker]");
const verdictText = () => document.querySelector<HTMLElement>("[data-market-verdict]")!;
/** Two animation frames: the marker moves after the second (legacy). */
function twoFrames() {
  act(() => {
    vi.advanceTimersToNextFrame();
  });
  act(() => {
    vi.advanceTimersToNextFrame();
  });
}

let fake: FakeTelegram;
const haptics = () =>
  fake.calls.filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);

beforeEach(() => {
  state.push.mockReset();
  fake = fakeTelegram({ version: "8.0" });
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
});

afterEach(() => {
  cleanup();
  resetMarkerShows();
  fake.uninstall();
  vi.useRealTimers();
  document.documentElement.classList.remove("lite");
});

describe("MarketBlock (WP-26, BR-APP-028)", () => {
  it("shows the title, the verdict in its tone, the scale with «обычно» and the context line", () => {
    render(block());

    expect(section()).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(t("market.title"));
    expect(verdictText().textContent).toBe(t("fmt.marketCheaper", { pct: 12 }));
    expect(verdictText().getAttribute("data-tone")).toBe("good");
    expect(section()?.textContent).toContain(t("market.cheaper"));
    expect(section()?.textContent).toContain(t("market.median", { value: "$672", unit: t("unit.month") }));
    expect(section()?.textContent).toContain(t("market.pricier"));
    expect(document.querySelector("[data-market-context]")?.textContent).toBe(
      t("market.ctxDistrict", { rooms: "2", district: "Юнусабад", n: "14" }),
    );
    expect(document.querySelector("[data-market-note]")).toBeNull();
  });

  it("the title follows the scope: near and city", () => {
    const { rerender } = render(block(withMarket({}, { scope: "near", radius_km: 0.34, near_class: "jk" })));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(t("market.titleNear"));

    rerender(block(withMarket({}, { scope: "city" })));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(t("market.titleCity"));
  });

  it("is not rendered without a verdict, without a comparison or without a delta (D-4)", () => {
    const { rerender } = render(block(BASE, 100001, null));
    expect(section()).toBeNull();

    rerender(block(withMarket({}, null)));
    expect(section()).toBeNull();

    // A delta of null gives no verdict either: the block's own gate is checked with a verdict handed in anyway.
    rerender(block(withMarket({ median_delta: null }), 100001, marketVerdict(BASE, "ru", t)));
    expect(section()).toBeNull();
  });

  it("ⓘ «Откуда эта цифра» plays the light haptic and opens the market sheet", () => {
    render(block());

    fireEvent.click(screen.getByRole("button", { name: t("market.how") }));
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
    expect(state.push).toHaveBeenCalledWith("/listing/100001/market");
    expect(document.querySelector('button[data-action="market-info"]')).not.toBeNull();
  });

  it("the marker carries the own price without a unit and sits at the delta's place", () => {
    render(block());
    twoFrames();

    expect(marker()?.textContent).toBe("$600");
    expect(marker()?.textContent).not.toContain(t("unit.month"));
    expect(marker()?.style.left).toBe(`${markerPosition(-0.12)}%`);
    expect(marker()?.style.left).toBe("35%");
  });

  it("the own value falls back to the price of the metric; no marker without one (never «$NaN»)", () => {
    const { rerender } = render(block(withMarket({}, { own: null, price_usd: 640 })));
    expect(marker()?.textContent).toBe("$640");

    rerender(block(withMarket({}, { own: null, price_usd: null })));
    expect(marker()).toBeNull();
    expect(section()?.textContent).not.toContain("NaN");

    rerender(block(withMarket({}, { own: null, metric: "m2", price_usd: 600, price_per_m2: null, value: 12 })));
    expect(marker()).toBeNull();
  });

  it("a per-m² comparison writes its unit after «обычно»; with a reason the monthly one and the m² context", () => {
    const { rerender } = render(block(withMarket({}, { metric: "m2", value: 12, own: 11, has_reason: false })));
    expect(section()?.textContent).toContain(t("market.median", { value: "$12", unit: t("unit.m2") }));

    rerender(block(withMarket({}, { metric: "m2", value: 12, own: 11, has_reason: true })));
    expect(section()?.textContent).toContain(t("market.median", { value: "$12", unit: t("unit.m2Month") }));
    expect(document.querySelector("[data-market-context]")?.textContent).toBe(t("market.ctxM2", { district: "Юнусабад" }));
  });

  it("the warnings: «suspicious» its text, «check» the server's note, «check» without a note nothing", () => {
    const { rerender } = render(block(withMarket({ tone: "suspicious", median_delta: -0.45 })));
    expect(document.querySelector("[data-market-note]")?.textContent).toBe(t("market.noteSuspicious"));

    rerender(block(withMarket({ tone: "check", median_delta: 0.11 }, { note: "Цена выше похожих рядом — уточните условия" })));
    expect(document.querySelector("[data-market-note]")?.textContent).toBe("Цена выше похожих рядом — уточните условия");

    rerender(block(withMarket({ tone: "check", median_delta: 0.11 }, { note: null })));
    expect(document.querySelector("[data-market-note]")).toBeNull();
  });

  it("the first show of a number starts the marker at the centre and moves it after two frames; the verdict fades in", () => {
    render(block());

    expect(marker()?.style.left).toBe("50%");
    expect(verdictText().className).toContain("opacity-0");
    act(() => {
      vi.advanceTimersToNextFrame();
    });
    expect(marker()?.style.left).toBe("50%");
    act(() => {
      vi.advanceTimersToNextFrame();
    });
    expect(marker()?.style.left).toBe("35%");
    expect(verdictText().className).toContain("opacity-100");
    expect(marker()?.className).toContain("transition-[left]");
    expect(marker()?.className).toContain("duration-700");
    expect(verdictText().className).toContain("delay-450");
  });

  it("animates once per number in a launch: shown again it starts in place; another number animates", () => {
    const { unmount } = render(block());
    twoFrames();
    unmount();

    render(block());
    expect(marker()?.style.left).toBe("35%");
    expect(verdictText().className).toContain("opacity-100");
    cleanup();

    render(block(BASE, 100002));
    expect(marker()?.style.left).toBe("50%");
  });

  it("only a render with a median counts as the first show", () => {
    const { unmount } = render(block(BASE, 100001, null));
    twoFrames();
    unmount();

    render(block());
    expect(marker()?.style.left).toBe("50%");
    twoFrames();
    expect(marker()?.style.left).toBe("35%");
  });

  it("lite graphics: no transitions on the marker or the verdict", () => {
    document.documentElement.classList.add("lite");
    render(block());

    expect(marker()?.className).not.toContain("transition");
    expect(verdictText().className).not.toContain("transition");
    twoFrames();
    expect(marker()?.style.left).toBe("35%");
  });
});
