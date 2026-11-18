import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { formatDecimal } from "@homi/i18n/format";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** `useMoney` without a profile currency or a rate prints dollars. */
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ me: null }) }));
vi.mock("@/lib/reference/useReference", () => ({ useReference: () => ({ usdUzs: 0 }) }));
const state = vi.hoisted(() => ({
  back: vi.fn(),
  methodology: { ru: null, uz: null, en: null } as Record<Locale, string | null>,
}));
vi.mock("@/lib/navigation/useBack", () => ({ useBack: () => ({ canGoBack: true, back: state.back }) }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("next/navigation", () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
/** The brand layer with a methodology address per test (`null` in Wave 1); the link hosts read the same object. */
vi.mock("@/lib/brand", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/brand")>();
  return {
    brand: {
      ...actual.brand,
      links: {
        ...actual.brand.links,
        get methodology() {
          return state.methodology;
        },
      },
    },
  };
});

import { type ListingComparison, type ListingDetails, listingKey } from "@/features/listing/listingData";
import { MarketSheet } from "@/features/listing/market/MarketSheet";
import { MarketSheetRoute } from "@/features/listing/market/MarketSheetRoute";
import { ListingLayerContext } from "@/features/listing/useListing";
import { resetResources, seedResource } from "@/lib/data/useResource";

import { detailsOf } from "../helpers/details";
import { translator } from "../helpers/listing";

const t = translator("ru");
const BASE = detailsOf();
const COMPARISON = BASE.comparison!;
/** The comparison was updated on 12 November; the sheet opens three hours later. */
const OPENED = new Date("2026-11-12T03:00:00Z");

function withMarket(market: Partial<ListingDetails["market"]> = {}, comparison: Partial<ListingComparison> | null = {}): ListingDetails {
  return detailsOf({
    market: { ...BASE.market, ...market },
    comparison: comparison === null ? null : { ...COMPARISON, ...comparison },
  });
}

function intl(children: ReactNode) {
  return (
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      {children}
    </NextIntlClientProvider>
  );
}

const sheet = (details: ListingDetails | null = BASE) => intl(<MarketSheet details={details} />);
const root = () => document.querySelector<HTMLElement>('[data-slot="bottom-sheet"] [data-route="listing/market"]');
const paragraph = (name: "sample" | "median" | "own") => document.querySelector(`[data-market-paragraph="${name}"]`)?.textContent ?? null;
const footer = () => document.querySelector("[data-market-footer]")?.textContent ?? null;
const dot = () => document.querySelector<HTMLElement>("[data-market-demo-dot]");
const tag = () => document.querySelector<HTMLElement>("[data-market-demo-tag]");
const own = (value: string, conclusion: string) => `${t("market.v3.own", { value })} — ${conclusion}`;
const cheaper = (pct: number) => t("market.v3.cheaper", { how: t("market.v3.pct", { pct: String(pct) }) });
const pricier = (pct: number) => t("market.v3.pricier", { how: t("market.v3.pct", { pct: String(pct) }) });
const updated = t("market.v3.updated", { ago: t("market.info.agoHour", { n: 3 }) });

function twoFrames() {
  act(() => {
    vi.advanceTimersToNextFrame();
  });
  act(() => {
    vi.advanceTimersToNextFrame();
  });
}

let fake: FakeTelegram;

beforeEach(() => {
  state.back.mockReset();
  state.methodology = { ru: null, uz: null, en: null };
  fake = fakeTelegram({ version: "8.0" });
  vi.useFakeTimers({ toFake: ["Date", "requestAnimationFrame", "cancelAnimationFrame"] });
  vi.setSystemTime(OPENED);
  window.history.replaceState(null, "", "/ru/listing/100001/market");
});

afterEach(() => {
  cleanup();
  resetResources();
  fake.uninstall();
  vi.useRealTimers();
  document.documentElement.classList.remove("lite");
});

describe("MarketSheet (WP-26, SCR-022)", () => {
  it("is a compact sheet «Откуда эта цифра» without ×", () => {
    render(sheet());

    const dialog = screen.getByRole("dialog", { name: t("market.how") });
    expect(dialog.getAttribute("data-variant")).toBe("compact");
    expect(root()).not.toBeNull();
    expect(document.querySelector('[data-slot="bottom-sheet-close"]')).toBeNull();
    expect(screen.queryByRole("button", { name: t("common.close") })).toBeNull();
  });

  it("while the listing's answer is pending: a section skeleton of four lines", () => {
    render(sheet(null));

    expect(root()?.querySelector('[data-section-skeleton="4"]')).not.toBeNull();
    expect(document.querySelector("[data-market-paragraph]")).toBeNull();
    expect(footer()).toBeNull();
  });

  it("the sample, the median and the own price as separate paragraphs, then the footer «asking · updated»", () => {
    render(sheet());

    const blocks = [...root()!.children].filter((child) => child.matches("p")).map((child) => child.getAttribute("data-market-paragraph") ?? "footer");
    expect(blocks).toEqual(["sample", "median", "own", "footer"]);
    expect(paragraph("sample")).toBe(t("market.v3.district", { n: 14, place: "Юнусабад" }));
    expect(paragraph("median")).toBe(t("market.v3.half", { value: "$672" }));
    expect(paragraph("own")).toBe(own("$600", cheaper(12)));
    expect(footer()).toBe(`${t("market.v3.asking")} · ${updated}`);
  });

  it("the near sample joins the rooms, class and radius phrases; the city sample names the city", () => {
    const { rerender } = render(sheet(withMarket({}, { scope: "near", n: 9, rooms: 2, near_class: "jk", radius_km: 0.34 })));
    const alike = [t("market.v3.rooms2"), t("market.v3.jk"), t("market.v3.within", { dist: t("market.v3.m", { m: "300" }) })].join(", ");
    expect(paragraph("sample")).toBe(t("market.v3.found", { n: 9, alike }));

    rerender(sheet(withMarket({}, { scope: "city", n: 31, district: "Чирчик" })));
    expect(paragraph("sample")).toBe(t("market.v3.city", { n: 31, place: "Чирчик" }));
  });

  it("a per-m² comparison wraps the median and the own value, with the monthly wording for a reason", () => {
    const { rerender } = render(sheet(withMarket({}, { metric: "m2", value: 12, own: 11, has_reason: false })));
    expect(paragraph("median")).toBe(t("market.v3.halfM2", { value: t("market.v3.perM2", { value: "$12" }) }));
    expect(paragraph("own")).toBe(`${t("market.v3.ownM2", { value: t("market.v3.perM2", { value: "$11" }) })} — ${cheaper(12)}`);

    rerender(sheet(withMarket({}, { metric: "m2", value: 12, own: 11, has_reason: true })));
    expect(paragraph("median")).toBe(t("market.v3.halfM2", { value: t("market.v3.perM2Month", { value: "$12" }) }));
  });

  it.each<[string, Partial<ListingDetails["market"]>, Partial<ListingComparison>, string]>([
    ["good, cheaper", { tone: "good", median_delta: -0.12 }, {}, cheaper(12)],
    ["good at a zero delta reads cheaper", { tone: "good", median_delta: 0 }, {}, cheaper(0)],
    ["high, pricier", { tone: "high", median_delta: 0.25 }, {}, pricier(25)],
    [
      "high from +90 %: «в N раза»",
      { tone: "high", median_delta: 1 },
      {},
      t("market.v3.pricier", { how: t("market.v3.times", { x: formatDecimal(2, "ru") }) }),
    ],
    ["same", { tone: "same", median_delta: 0.01 }, {}, t("market.v3.same")],
    ["mixed with a place value", { tone: "mixed", median_delta: -0.12 }, { place_value: 700 }, t("market.v3.mixed", { place: "$700" })],
    ["mixed without a place value concludes by the sign", { tone: "mixed", median_delta: -0.12 }, { place_value: null }, cheaper(12)],
    ["suspicious", { tone: "suspicious", median_delta: -0.45 }, {}, t("market.v3.suspicious")],
    ["check with the server's note", { tone: "check", median_delta: 0.11 }, { note: "Уточните условия" }, `${t("market.v3.check")} Уточните условия`],
    ["check without a note", { tone: "check", median_delta: 0.11 }, { note: null }, t("market.v3.check")],
    ["no_repair", { tone: "no_repair", median_delta: -0.2 }, {}, t("market.v3.noRepair")],
    ["an unknown tone concludes by the sign", { tone: "weird", median_delta: 0.2 }, {}, pricier(20)],
  ])("conclusion: %s", (_, market, comparison, conclusion) => {
    render(sheet(withMarket(market, comparison)));
    expect(paragraph("own")).toBe(own("$600", conclusion));
  });

  it("without an own value the own paragraph is left out", () => {
    render(sheet(withMarket({}, { own: null, price_usd: null })));

    expect(paragraph("sample")).not.toBeNull();
    expect(paragraph("median")).not.toBeNull();
    expect(document.querySelector('[data-market-paragraph="own"]')).toBeNull();
    expect(tag()).toBeNull();
    expect(footer()).toBe(`${t("market.v3.asking")} · ${updated}`);
  });

  it("without a verdict, a comparison or a delta: only the asking line", () => {
    const { rerender } = render(sheet(withMarket({ tone: null })));
    const onlyAsking = () => {
      expect(footer()).toBe(t("market.v3.asking"));
      expect(document.querySelector("[data-market-paragraph]")).toBeNull();
      expect(document.querySelector("[data-market-demo]")).toBeNull();
      expect(document.querySelector("[data-market-more]")).toBeNull();
    };
    onlyAsking();

    rerender(sheet(withMarket({}, null)));
    onlyAsking();

    rerender(sheet(withMarket({ median_delta: null })));
    onlyAsking();
  });

  it("the footer leaves «updated» out without a valid time", () => {
    render(sheet(withMarket({}, { updated: null })));
    expect(footer()).toBe(t("market.v3.asking"));
  });

  it("«Подробнее» is not rendered while the brand layer has no methodology address", () => {
    render(sheet());

    expect(document.querySelector("[data-market-more]")).toBeNull();
    expect(footer()).not.toContain(t("market.info.more"));
  });

  it("«Подробнее» opens the methodology address of the locale when there is one", () => {
    state.methodology = { ru: "https://homi.uz/ru/metodika", uz: null, en: null };
    render(sheet());

    expect(footer()).toBe(`${t("market.v3.asking")} · ${updated} · ${t("market.info.more")}`);
    fireEvent.click(screen.getByRole("button", { name: t("market.info.more") }));
    expect(fake.calls.filter((entry) => entry.member === "openLink").map((entry) => entry.args[0])).toEqual(["https://homi.uz/ru/metodika"]);
  });

  it("the demo dot slides from the centre to the listing's place after two frames; the own price fades in", () => {
    render(sheet());

    expect(dot()?.style.left).toBe("50%");
    expect(tag()?.textContent).toBe("$600");
    expect(tag()?.className).toContain("opacity-0");
    twoFrames();
    expect(dot()?.style.left).toBe("35%");
    expect(tag()?.className).toContain("opacity-100");
    expect(dot()?.className).toContain("duration-1000");
    expect(dot()?.className).toContain("delay-200");
    expect(tag()?.className).toContain("delay-1000");
  });

  it("the demo scale waits for the answer: it plays when the paragraphs arrive", () => {
    const { rerender } = render(sheet(null));
    twoFrames();

    rerender(sheet());
    expect(dot()?.style.left).toBe("50%");
    twoFrames();
    expect(dot()?.style.left).toBe("35%");
  });

  it("lite graphics: no transitions on the demo scale", () => {
    document.documentElement.classList.add("lite");
    render(sheet());

    expect(dot()?.className).not.toContain("transition");
    expect(tag()?.className).not.toContain("transition");
  });
});

describe("MarketSheetRoute (WP-26)", () => {
  function route(number: number | null = 100001) {
    return render(
      intl(
        <ListingLayerContext value={{ number, scrollToTop: () => {}, reportView: () => {}, view: null }}>
          <MarketSheetRoute />
        </ListingLayerContext>,
      ),
    );
  }

  it("shows the listing's resource", async () => {
    seedResource(listingKey(100001), { listing: BASE, source: "stub" });
    route();

    await act(() => vi.dynamicImportSettled());
    expect(await screen.findByRole("dialog", { name: t("market.how") })).toBeTruthy();
    expect(paragraph("median")).toBe(t("market.v3.half", { value: "$672" }));
  });

  it("a skeleton while the resource is empty (listing 1 of the foundation spec)", async () => {
    route(1);

    await act(() => vi.dynamicImportSettled());
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(root()?.querySelector('[data-section-skeleton="4"]')).not.toBeNull();
  });
});
