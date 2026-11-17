import { getMessages } from "@homi/i18n";
import { defaultFilters, normalizeFilters, type SearchFilters, sectionsFor } from "@homi/search";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CitySection } from "@/features/filters/sections/CitySection";
import { DealSection } from "@/features/filters/sections/DealSection";
import { RentTermSection } from "@/features/filters/sections/RentTermSection";
import { TypeSection } from "@/features/filters/sections/TypeSection";
import type { SectionProps } from "@/features/filters/sections/types";
import type { City, CityStats } from "@/lib/reference/types";
import { resetReference } from "@/lib/reference/useReference";
import { searchRules } from "@/lib/search/rules";

import { withDevFlags } from "../helpers/flags";
import { cityOf, feedReference } from "../helpers/reference";

const TASHKENT = cityOf();
const SAMARKAND = cityOf({ code: "samarkand", name: "Самарканд", has_metro: false, zones: [] });
const POLYGON = [
  [41.3, 69.2],
  [41.32, 69.24],
  [41.28, 69.26],
] as const;
const rules = withDevFlags({}, searchRules);

function statsOf(counts: Partial<CityStats["counts"]> = {}): CityStats {
  return {
    code: "tashkent",
    counts: { rent_long: 120, rent_daily: 0, sale: 80, ...counts },
    price_presets: {},
    typical_price: {},
  };
}

/** The drafts the sections handed over, as the form would hold them; the first is the initial one. */
const drafts: SearchFilters[] = [];
const latest = () => drafts[drafts.length - 1];
const openCity = vi.fn();

/** The first four sections as `FiltersForm` mounts them: visibility from `sectionsFor`, every update normalised. */
function Host({ initial, city, stats }: { initial: SearchFilters; city: City | null; stats: CityStats | null }) {
  const [filters, setFilters] = useState(initial);
  const sections = sectionsFor(filters, city, "search", rules, stats);
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
    sections,
  };
  return (
    <>
      <DealSection {...props} />
      <CitySection {...props} onOpenCity={openCity} />
      <TypeSection {...props} />
      {sections.rentTerm ? <RentTermSection {...props} /> : null}
    </>
  );
}

function sheet(initial: Partial<SearchFilters> = {}, { city = TASHKENT as City | null, stats = statsOf() as CityStats | null } = {}) {
  const filters = normalizeFilters({ ...defaultFilters(), ...initial });
  drafts.splice(0, drafts.length, filters);
  return render(
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      <Host initial={filters} city={city} stats={stats} />
    </NextIntlClientProvider>,
  );
}

const section = (container: HTMLElement, name: string) => container.querySelector<HTMLElement>(`[data-section="${name}"]`);
const radio = (container: HTMLElement, name: string, label: string) =>
  within(section(container, name)!).getByRole("radio", { name: label });
const typeChip = (label: string) => screen.getByRole("button", { name: label });
const pressedTypes = (container: HTMLElement) =>
  [...section(container, "housing")!.querySelectorAll("button")].filter((chip) => chip.getAttribute("aria-pressed") === "true").map((chip) => chip.textContent);

let fake: FakeTelegram | null = null;
const impacts = () => (fake?.calls ?? []).filter((entry) => entry.member === "HapticFeedback.impactOccurred").map((entry) => entry.args[0]);

beforeEach(() => {
  fake = fakeTelegram({ version: "8.0" });
  openCity.mockReset();
  feedReference({ cities: [TASHKENT, SAMARKAND] });
});

afterEach(() => {
  cleanup();
  resetReference();
  fake?.uninstall();
  fake = null;
});

describe("DealSection (BR-APP-002)", () => {
  it("switches to sale with the sale defaults and keeps districts, zones and the polygon, without a haptic", () => {
    const { container } = sheet({
      districts: ["yunusabad"],
      zones: ["center"],
      polygon: POLYGON,
      rooms_min: 2,
      rooms_max: 2,
      price_max: 500,
      owner: "owners",
      types: ["apartment", "house"],
    });

    fireEvent.click(radio(container, "deal", "Продажа"));

    expect(latest()).toEqual({
      ...defaultFilters("sale", "tashkent"),
      districts: ["yunusabad"],
      zones: ["center"],
      polygon: POLYGON,
    });
    expect(radio(container, "deal", "Продажа").getAttribute("aria-checked")).toBe("true");
    // Legacy plays no haptic on the deal switch, the type chips or the rent term.
    expect(impacts()).toEqual([]);
  });

  it("daily rent shows «Аренда» active, and a tap on it changes nothing", () => {
    const { container } = sheet({ deal: "rent_daily" });

    expect(radio(container, "deal", "Аренда").getAttribute("aria-checked")).toBe("true");
    fireEvent.click(radio(container, "deal", "Аренда"));
    expect(drafts).toHaveLength(1);
    expect(impacts()).toEqual([]);
  });

  it("names the group by its two options without a visible heading", () => {
    const { container } = sheet();

    expect(screen.getByRole("group", { name: "Аренда / Продажа" })).toBe(section(container, "deal"));
    expect(section(container, "deal")?.className).toContain("[&>h2]:sr-only");
  });
});

describe("TypeSection (BR-APP-005)", () => {
  it("offers the types of the draft's deal", () => {
    const chips = (container: HTMLElement) => [...section(container, "housing")!.querySelectorAll("button")].map((chip) => chip.textContent);

    expect(chips(sheet().container)).toEqual(["Квартира", "Дом", "Комната", "Помещение"]);
    cleanup();
    expect(chips(sheet({ deal: "rent_daily" }).container)).toEqual(["Квартира", "Дом", "Комната"]);
    cleanup();
    expect(chips(sheet({ deal: "sale" }).container)).toEqual(["Квартира", "Дом", "Помещение", "Участок"]);
  });

  it("the last selected type cannot be removed", () => {
    const { container } = sheet();

    fireEvent.click(typeChip("Квартира"));
    expect(latest().types).toEqual(["apartment"]);
    expect(pressedTypes(container)).toEqual(["Квартира"]);

    fireEvent.click(typeChip("Дом"));
    fireEvent.click(typeChip("Квартира"));
    expect(latest().types).toEqual(["house"]);
    expect(pressedTypes(container)).toEqual(["Дом"]);
    expect(impacts()).toEqual([]);
  });

  it("adding «Дом» clears «Не дороже рынка»", () => {
    sheet({ below_median: true });
    expect(latest().below_median).toBe(true);

    fireEvent.click(typeChip("Дом"));
    expect(latest().types).toEqual(["apartment", "house"]);
    expect(latest().below_median).toBe(false);
  });
});

describe("RentTermSection (BR-APP-003, BR-APP-004)", () => {
  it("long → daily with [apartment, commercial] keeps [apartment] and clears the price, below-median, tenant and pets", () => {
    const { container } = sheet(
      {
        types: ["apartment", "commercial"],
        price_min: 100,
        price_max: 500,
        below_median: true,
        tenant: "family",
        pets: true,
        pets_only: true,
        rooms_min: 2,
        rooms_max: 3,
      },
      { stats: statsOf({ rent_daily: 15 }) },
    );

    fireEvent.click(radio(container, "rentTerm", "Посуточно"));

    expect(latest()).toEqual({
      ...defaultFilters("rent_daily", "tashkent"),
      rooms_min: 2,
      rooms_max: 3,
    });
    expect(radio(container, "rentTerm", "Посуточно").getAttribute("aria-checked")).toBe("true");
    expect(radio(container, "deal", "Аренда").getAttribute("aria-checked")).toBe("true");
    expect(impacts()).toEqual([]);
  });

  it("daily → long keeps the tenant-free draft and clears the price", () => {
    const { container } = sheet({ deal: "rent_daily", price_max: 40 }, { stats: null });

    fireEvent.click(radio(container, "rentTerm", "Надолго"));
    expect(latest()).toEqual(defaultFilters("rent_long", "tashkent"));
  });

  it.each([
    ["long rent, the city has daily listings", { deal: "rent_long" }, statsOf({ rent_daily: 3 }), true],
    ["long rent, no daily listings", { deal: "rent_long" }, statsOf({ rent_daily: 0 }), false],
    ["long rent, statistics missing", { deal: "rent_long" }, null, false],
    ["daily rent, statistics missing", { deal: "rent_daily" }, null, true],
    ["daily rent, no daily listings", { deal: "rent_daily" }, statsOf({ rent_daily: 0 }), true],
    ["sale, the city has daily listings", { deal: "sale" }, statsOf({ rent_daily: 3 }), false],
  ] as const)("is offered for %s: %s", (_, initial, stats, offered) => {
    const draft = normalizeFilters({ ...defaultFilters(), ...initial });
    expect(sectionsFor(draft, TASHKENT, "search", rules, stats).rentTerm).toBe(offered);

    const { container } = sheet(initial, { stats });
    expect(section(container, "rentTerm") !== null).toBe(offered);
  });
});

describe("CitySection", () => {
  it("is the field «Город» with the draft's city; a tap opens the nested picker with a light impact", () => {
    const { container } = sheet();

    const field = within(section(container, "city")!).getByRole("button");
    expect(field.textContent).toBe("Город Ташкент");
    expect(field.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(field);
    expect(openCity).toHaveBeenCalledTimes(1);
    expect(impacts()).toEqual(["light"]);
    expect(drafts).toHaveLength(1);
  });

  it("renders nothing with one city in the reference data", () => {
    feedReference({ cities: [TASHKENT] });
    const { container } = sheet();

    expect(section(container, "city")).toBeNull();
  });

  it("an unknown city leaves the name empty", () => {
    const { container } = sheet({ city: "bukhara" }, { city: null });

    expect(within(section(container, "city")!).getByRole("button").textContent).toBe("Город ");
  });
});
