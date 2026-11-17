import { getMessages } from "@homi/i18n";
import { defaultFilters, normalizeFilters, type SearchFilters, type SearchRules, sectionsFor } from "@homi/search";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ me: { currency: "USD" } as { currency: string } | null }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ me: session.me }) }));

import { PriceSection } from "@/features/filters/sections/PriceSection";
import type { SectionProps } from "@/features/filters/sections/types";
import type { City, CityStats, Reference } from "@/lib/reference/types";
import { resetReference } from "@/lib/reference/useReference";
import { searchRules } from "@/lib/search/rules";

import { withDevFlags } from "../helpers/flags";
import { cityOf, feedReference } from "../helpers/reference";

const RATE = 12_650;
const TASHKENT = cityOf();
const NBSP = " ";
const REFERENCE_PRESETS: Reference["price_presets"] = { rent_long: [400, 600, 800], rent_daily: [30, 50], sale: [50_000, 90_000] };
const defaultRules = withDevFlags({}, searchRules);

function statsOf(overrides: Partial<CityStats> = {}): CityStats {
  return {
    code: "tashkent",
    counts: { rent_long: 120, rent_daily: 4, sale: 80 },
    price_presets: { rent_long: [300, 500] },
    typical_price: { rent_long: 450, rent_daily: 35, sale: 60_000 },
    ...overrides,
  };
}

/** The drafts the section handed over, as the form would hold them; the first is the initial one. */
const drafts: SearchFilters[] = [];
const latest = () => drafts[drafts.length - 1];

interface Setup {
  city?: City | null;
  stats?: CityStats | null;
  rules?: SearchRules;
  titleHidden?: boolean;
}

/** The section as `FiltersForm` mounts it: `sections` from `sectionsFor` of the current draft, updates normalised. */
function Host({ initial, city, stats, rules, titleHidden }: Required<Omit<Setup, "titleHidden">> & { initial: SearchFilters; titleHidden: boolean }) {
  const [filters, setFilters] = useState(initial);
  const props: SectionProps = {
    filters,
    update: (patch) => {
      const next = normalizeFilters({ ...filters, ...patch });
      drafts.push(next);
      setFilters(next);
    },
    city,
    stats,
    mode: "search",
    rules,
    sections: sectionsFor(filters, city, "search", rules, stats),
  };
  return <PriceSection {...props} titleHidden={titleHidden} />;
}

function price(initial: Partial<SearchFilters> = {}, { city = TASHKENT, stats = statsOf(), rules = defaultRules, titleHidden = false }: Setup = {}) {
  const filters = normalizeFilters({ ...defaultFilters(), ...initial });
  drafts.splice(0, drafts.length, filters);
  const view = render(
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      <Host initial={filters} city={city} stats={stats} rules={rules} titleHidden={titleHidden} />
    </NextIntlClientProvider>,
  );
  return { ...view, section: view.container.querySelector<HTMLElement>('[data-section="price"]')! };
}

/** The display in сум at 12 650 сум per dollar, or dollars. */
function currency(uzs: boolean) {
  session.me = { currency: uzs ? "UZS" : "USD" };
  feedReference({ cities: [TASHKENT], reference: { rates: { usd_uzs: RATE }, price_presets: REFERENCE_PRESETS } });
}

const heading = (section: HTMLElement) => within(section).getByRole("heading").textContent;
const presets = (section: HTMLElement) => [...section.querySelectorAll("[data-preset]")].map((chip) => chip.textContent);
const pressedPresets = (section: HTMLElement) =>
  [...section.querySelectorAll("[data-preset]")].filter((chip) => chip.getAttribute("aria-pressed") === "true").map((chip) => chip.textContent);
const preset = (label: string) => screen.getByRole("button", { name: label });
const field = (label: "от" | "до") => screen.getByRole<HTMLInputElement>("textbox", { name: label });
const type = (label: "от" | "до", text: string) => fireEvent.change(field(label), { target: { value: text } });
const belowMedian = (section: HTMLElement) => section.querySelector<HTMLButtonElement>('[data-chip="below-median"]');
const typical = (section: HTMLElement) => section.querySelector('[data-slot="typical-price"]')?.textContent ?? null;

let fake: FakeTelegram | null = null;
const impacts = () => (fake?.calls ?? []).filter((entry) => entry.member === "HapticFeedback.impactOccurred").map((entry) => entry.args[0]);

beforeEach(() => {
  fake = fakeTelegram({ version: "8.0" });
  currency(false);
});

afterEach(() => {
  cleanup();
  resetReference();
  fake?.uninstall();
  fake = null;
});

describe("PriceSection title", () => {
  it.each([
    [false, "rent_long", "Цена в месяц, $"],
    [false, "rent_daily", "Цена за сутки, $"],
    [false, "sale", "Цена, $"],
    [true, "rent_long", "Цена в месяц, млн сум"],
    [true, "rent_daily", "Цена за сутки, млн сум"],
    [true, "sale", "Цена, млн сум"],
  ] as const)("сум %s, %s: «%s»", (uzs, deal, title) => {
    currency(uzs);
    const { section } = price({ deal });

    expect(heading(section)).toBe(title);
    expect(section.className).not.toContain("[&>h2]:sr-only");
  });

  it("is read but not shown in the price quick sheet", () => {
    const { section } = price({}, { titleHidden: true });

    expect(heading(section)).toBe("Цена в месяц, $");
    expect(section.className).toContain("[&>h2]:sr-only");
  });
});

describe("PriceSection inputs (`03` §3.5)", () => {
  it("«от» with the placeholder «0» and «до» with «любая»; numeric for dollars, decimal for сум; Enter is «done»", () => {
    price();
    expect(field("от").placeholder).toBe("0");
    expect(field("до").placeholder).toBe("любая");
    expect(field("от").inputMode).toBe("numeric");
    expect(field("до").getAttribute("enterkeyhint")).toBe("done");
    cleanup();

    currency(true);
    price();
    expect(field("от").inputMode).toBe("decimal");
    expect(field("до").inputMode).toBe("decimal");
  });

  it("dollars: the typed text becomes whole USD; unreadable text is no bound and stays as typed", () => {
    price();

    type("от", "300");
    expect(latest().price_min).toBe(300);
    type("до", "1.000.000");
    expect(latest().price_max).toBe(1_000_000);
    expect(field("до").value).toBe("1.000.000");
    type("от", "abc");
    expect(latest().price_min).toBeNull();
    expect(field("от").value).toBe("abc");
  });

  it("сум at 12 650: «1,2» is 95 USD and «1.000.000» is accepted, both kept as typed", () => {
    currency(true);
    price();

    type("до", "1,2");
    expect(latest().price_max).toBe(95);
    expect(field("до").value).toBe("1,2");

    type("от", "1.000.000");
    expect(latest().price_min).toBe(Math.round((1_000_000 * 1_000_000) / RATE));
    expect(field("от").value).toBe("1.000.000");
  });

  it("shows a stored bound in the display currency", () => {
    currency(true);
    price({ price_min: 95, price_max: 400 });

    expect(field("от").value).toBe("1,2");
    expect(field("до").value).toBe("5,1");
  });
});

describe("PriceSection presets (BR-APP-014, BR-APP-015)", () => {
  it("the city's presets win over the reference presets", () => {
    const { section } = price();

    expect(presets(section)).toEqual(["до $300", "до $500"]);
  });

  it("the reference presets without city presets, and while the statistics are missing", () => {
    expect(presets(price({}, { stats: statsOf({ price_presets: { rent_long: [] } }) }).section)).toEqual(["до $400", "до $600", "до $800"]);
    cleanup();
    expect(presets(price({}, { stats: null }).section)).toEqual(["до $400", "до $600", "до $800"]);
    cleanup();
    expect(presets(price({ deal: "sale" }, { stats: null }).section)).toEqual([`до $50${NBSP}000`, `до $90${NBSP}000`]);
  });

  it("сум: city presets converted and rounded to 0.5 млн, else the fixed list", () => {
    currency(true);
    expect(presets(price().section)).toEqual(["до 4 млн сум", "до 6,5 млн сум"]);
    cleanup();
    expect(presets(price({ deal: "rent_daily" }, { stats: null }).section)).toEqual([
      `до 300${NBSP}000 сум`,
      `до 500${NBSP}000 сум`,
      `до 700${NBSP}000 сум`,
      "до 1 млн сум",
      "до 1,5 млн сум",
    ]);
  });

  it("a chip is on only as the maximum without a minimum", () => {
    expect(pressedPresets(price({ price_max: 500 }).section)).toEqual(["до $500"]);
    cleanup();
    expect(pressedPresets(price({ price_min: 100, price_max: 500 }).section)).toEqual([]);
    cleanup();
    expect(pressedPresets(price({ price_max: 450 }).section)).toEqual([]);
  });

  it("a tap sets the maximum and clears the minimum; a tap on the chip that is on clears the maximum", () => {
    const { section } = price({ price_min: 100, price_max: 900 });

    fireEvent.click(preset("до $300"));
    expect([latest().price_min, latest().price_max]).toEqual([null, 300]);
    expect(pressedPresets(section)).toEqual(["до $300"]);
    expect(field("до").value).toBe("300");
    expect(field("от").value).toBe("");

    fireEvent.click(preset("до $300"));
    expect([latest().price_min, latest().price_max]).toEqual([null, null]);
    expect(field("до").value).toBe("");
    // Legacy plays no haptic in the price section.
    expect(impacts()).toEqual([]);
  });

  it("сум: a preset writes its text into «до»", () => {
    currency(true);
    price({}, { stats: null });

    act(() => fireEvent.click(preset("до 3 млн сум")));
    expect(latest().price_max).toBe(Math.round(3_000_000 / RATE));
    expect(field("до").value).toBe("3");
  });

  it("the strip scrolls sideways without starting the sheet drag", () => {
    const strip = price().section.querySelector<HTMLElement>('[data-slot="price-presets"]');

    expect(strip?.hasAttribute("data-scroll-x")).toBe(true);
    expect(strip?.classList).toContain("overflow-x-auto");
    expect(strip?.classList).not.toContain("flex-wrap");
  });

  it("no strip without presets", () => {
    feedReference({ cities: [TASHKENT], reference: { rates: { usd_uzs: RATE }, price_presets: { rent_long: [], rent_daily: [], sale: [] } } });
    const { section } = price({}, { stats: null });

    expect(section.querySelector('[data-slot="price-presets"]')).toBeNull();
  });
});

describe("PriceSection hints (BR-APP-016, BR-APP-018)", () => {
  const UNIT_HINT = "Цена за сотку или м² — умножаем на площадь из объявления";

  it.each([
    ["sale with land", { deal: "sale", types: ["apartment", "land"] }, true],
    ["sale with a house", { deal: "sale", types: ["house"] }, true],
    ["sale of apartments", { deal: "sale", types: ["apartment"] }, false],
    ["rent of a house", { deal: "rent_long", types: ["house"] }, false],
  ] as const)("the unit hint for %s: %s", (_, initial, shown) => {
    const { section } = price(initial);

    expect(section.textContent?.includes(UNIT_HINT)).toBe(shown);
  });

  it.each([
    ["rent_long", "Ташкент: половина квартир — до $450 в месяц"],
    ["rent_daily", "Ташкент: половина квартир — до $35 за сутки"],
    ["sale", `Ташкент: половина квартир — до $60${NBSP}000`],
  ] as const)("the typical line of %s apartments: «%s»", (deal, line) => {
    expect(typical(price({ deal }).section)).toBe(line);
  });

  it("the typical line in сум", () => {
    currency(true);

    expect(typical(price().section)).toBe("Ташкент: половина квартир — до 5,7 млн сум в месяц");
  });

  it.each([
    ["statistics loading or failed", {}, { stats: null }],
    ["no typical price for the deal", {}, { stats: statsOf({ typical_price: { sale: 60_000 } }) }],
    ["not apartments only", { types: ["apartment", "house"] }, {}],
    ["a city without a name", {}, { city: cityOf({ name: "" }) }],
    ["an unknown city", {}, { city: null }],
  ] as const)("no typical line with %s", (_, initial, setup) => {
    expect(typical(price(initial as Partial<SearchFilters>, setup as Setup).section)).toBeNull();
  });
});

describe("PriceSection «Не дороже рынка» (BR-APP-017)", () => {
  const RENT_HINT = getMessages("ru").sheet.belowMedianHintRent;
  const SALE_HINT = getMessages("ru").sheet.belowMedianHintSale;

  /**
   * Availability with `dev052UnifiedBelowMedianRule` off and on. `belowMedianAvailable` ignores the flag until DEV-052
   * is approved, so both branches give the legacy rule; the section renders only what `sections.belowMedian` says.
   */
  describe.each([false, true])("dev052UnifiedBelowMedianRule %s", (dev052) => {
    const rules = withDevFlags({ dev052UnifiedBelowMedianRule: dev052 }, searchRules);

    it.each([
      ["long-rent apartments in a city with medians", { deal: "rent_long" }, TASHKENT, true],
      ["sale apartments in a city with medians", { deal: "sale" }, TASHKENT, true],
      ["daily rent", { deal: "rent_daily" }, TASHKENT, false],
      ["apartments and houses", { types: ["apartment", "house"] }, TASHKENT, false],
      ["a city without medians", {}, cityOf({ has_median: false }), false],
      ["an unknown city", {}, null, false],
    ] as const)("%s: %s", (_, initial, city, offered) => {
      const draft = normalizeFilters({ ...defaultFilters(), ...initial });
      expect(sectionsFor(draft, city, "search", rules, statsOf()).belowMedian).toBe(offered);

      const { section } = price(initial as Partial<SearchFilters>, { city, rules });
      expect(belowMedian(section) !== null).toBe(offered);
    });
  });

  it("toggles `below_median` without a haptic; its hint shows while on", () => {
    const { section } = price();
    const chip = belowMedian(section)!;
    expect(chip.textContent).toBe("📊 Не дороже рынка");
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    expect(section.textContent?.includes(RENT_HINT)).toBe(false);

    fireEvent.click(chip);
    expect(latest().below_median).toBe(true);
    expect(belowMedian(section)?.getAttribute("aria-pressed")).toBe("true");
    expect(section.textContent?.includes(RENT_HINT)).toBe(true);

    fireEvent.click(belowMedian(section)!);
    expect(latest().below_median).toBe(false);
    expect(section.textContent?.includes(RENT_HINT)).toBe(false);
    expect(impacts()).toEqual([]);
  });

  it("the sale hint for a sale", () => {
    const { section } = price({ deal: "sale", below_median: true });

    expect(section.textContent?.includes(SALE_HINT)).toBe(true);
    expect(section.textContent?.includes(RENT_HINT)).toBe(false);
  });
});
