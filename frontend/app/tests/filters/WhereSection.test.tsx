import { getMessages } from "@homi/i18n";
import {
  DEFAULT_RULES,
  defaultFilters,
  normalizeFilters,
  type Polygon,
  type SearchFilters,
  type SearchMode,
  sectionsFor,
} from "@homi/search";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WhereSection } from "@/features/filters/sections/WhereSection";
import type { City } from "@/lib/reference/types";

import { cityOf } from "../helpers/reference";

const POLYGON: Polygon = [
  [41.3, 69.2],
  [41.32, 69.24],
  [41.28, 69.26],
];

/** Zones listed against the canonical order, so the chips and the stored list prove the order is the model's. */
const TASHKENT = cityOf({
  zones: [
    { code: "near_center", name: "Near" },
    { code: "center", name: "Centre" },
  ],
  districts: [
    { code: "yunusabad", name: "Юнусабад" },
    { code: "chilanzar", name: "Чиланзар" },
  ],
  has_metro: true,
});

const CHIP = {
  draw: "Обвести на карте",
  area: "Своя область на карте",
  center: "🏛 Центр",
  nearCenter: "🏙 Ближе к центру",
  metro: "🚇 Рядом с метро",
  yunusabad: "Юнусабад",
  chilanzar: "Чиланзар",
} as const;

let latest: SearchFilters = defaultFilters();

/** The section over a draft kept as `useDraft` keeps it: every patch goes through `normalizeFilters`. */
function Harness({
  initial,
  city,
  mode,
  onDraw,
}: {
  initial: SearchFilters;
  city: City | null;
  mode: SearchMode;
  onDraw?: (filters: SearchFilters) => void;
}) {
  const [draft, setDraft] = useState(initial);
  useEffect(() => {
    latest = draft;
  }, [draft]);
  return (
    <WhereSection
      filters={draft}
      update={(patch) => setDraft((current) => normalizeFilters({ ...current, ...patch }))}
      city={city}
      stats={null}
      mode={mode}
      rules={DEFAULT_RULES}
      sections={sectionsFor(draft, city, mode, DEFAULT_RULES)}
      onDraw={onDraw}
    />
  );
}

function where({
  filters = {},
  city = TASHKENT,
  mode = "search",
  onDraw = vi.fn(),
}: {
  filters?: Partial<SearchFilters>;
  city?: City | null;
  mode?: SearchMode;
  /** `null`: the caller passes no draw hand-off. */
  onDraw?: ((filters: SearchFilters) => void) | null;
} = {}) {
  const initial = normalizeFilters({ ...defaultFilters("rent_long", "tashkent"), ...filters });
  latest = initial;
  return render(
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      <Harness initial={initial} city={city} mode={mode} onDraw={onDraw ?? undefined} />
    </NextIntlClientProvider>,
  );
}

const chip = (name: string) => screen.getByRole("button", { name });
const chipOrNull = (name: string) => screen.queryByRole("button", { name });
const pressed = (name: string) => chip(name).getAttribute("aria-pressed") === "true";
const tap = (name: string) => fireEvent.click(chip(name));
const geography = () => ({ polygon: latest.polygon, zones: latest.zones, districts: latest.districts });
/** The chip labels in the order the section shows them. */
const labels = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLButtonElement>('[data-slot="filter-chip"]')].map((button) => button.textContent);

afterEach(cleanup);

describe("WhereSection: one geography mode (BR-APP-008)", () => {
  const starts = {
    polygon: { polygon: POLYGON },
    zones: { zones: ["near_center"] },
    districts: { districts: ["yunusabad"] },
  } as const satisfies Record<string, Partial<SearchFilters>>;

  it.each([
    ["polygon", "zone", { polygon: null, zones: ["center"], districts: [] }],
    ["polygon", "district", { polygon: null, zones: [], districts: ["yunusabad"] }],
    ["polygon", "area", { polygon: null, zones: [], districts: [] }],
    ["zones", "zone", { polygon: null, zones: ["center", "near_center"], districts: [] }],
    ["zones", "district", { polygon: null, zones: [], districts: ["yunusabad"] }],
    ["districts", "zone", { polygon: null, zones: ["center"], districts: [] }],
    ["districts", "district", { polygon: null, zones: [], districts: ["yunusabad", "chilanzar"] }],
  ] as const)("from %s, a %s tap leaves %o", (start, action, expected) => {
    where({ filters: starts[start] });

    tap({ zone: CHIP.center, district: start === "districts" ? CHIP.chilanzar : CHIP.yunusabad, area: CHIP.area }[action]);

    expect(geography()).toEqual(expected);
  });

  it("turns the last zone or district off without setting another mode", () => {
    where({ filters: starts.zones });
    tap(CHIP.nearCenter);
    expect(geography()).toEqual({ polygon: null, zones: [], districts: [] });
    cleanup();

    where({ filters: starts.districts });
    tap(CHIP.yunusabad);
    expect(geography()).toEqual({ polygon: null, zones: [], districts: [] });
  });

  it("toggles «Рядом с метро» without touching the geography", () => {
    where({ filters: starts.zones });

    tap(CHIP.metro);
    expect(latest.near_metro).toBe(true);
    expect(pressed(CHIP.metro)).toBe(true);
    expect(geography()).toEqual({ polygon: null, zones: ["near_center"], districts: [] });

    tap(CHIP.yunusabad);
    expect(latest.near_metro).toBe(true);
    tap(CHIP.metro);
    expect(latest.near_metro).toBe(false);
  });
});

describe("WhereSection: zones", () => {
  it("shows the city's zones in the order center, near_center and stores them so", () => {
    const { container } = where();

    expect(labels(container)).toEqual([CHIP.draw, CHIP.center, CHIP.nearCenter, CHIP.metro, CHIP.yunusabad, CHIP.chilanzar]);

    tap(CHIP.nearCenter);
    tap(CHIP.center);
    expect(latest.zones).toEqual(["center", "near_center"]);
    expect(pressed(CHIP.center)).toBe(true);
    expect(pressed(CHIP.nearCenter)).toBe(true);
  });

  it("offers only the zones the city has, and no metro chip without a metro", () => {
    const { container } = where({ city: cityOf({ zones: [{ code: "center", name: "Centre" }], has_metro: false, districts: [] }) });

    expect(labels(container)).toEqual([CHIP.draw, CHIP.center]);
  });
});

describe("WhereSection: the districts caption", () => {
  it.each([
    ["a city with zones", cityOf(), "Или районы:"],
    ["a city without zones", cityOf({ zones: [] }), "Районы:"],
    ["a region", cityOf({ code: "tashkent", is_region: true, zones: [] }), "Районы области (необязательно):"],
  ])("%s: «%s»", (_kind, city, caption) => {
    const { container } = where({ city });

    const captions = ["Или районы:", "Районы:", "Районы области (необязательно):"].filter((text) => container.textContent?.includes(text));
    expect(captions).toEqual([caption]);
  });

  it("shows neither caption nor district chips for a city without districts", () => {
    const { container } = where({ city: cityOf({ districts: [] }) });

    expect(container.textContent).not.toContain("районы");
    expect(container.textContent).not.toContain("Районы");
    expect(chipOrNull(CHIP.yunusabad)).toBeNull();
  });

  it("renders server names as text", () => {
    const { container } = where({ city: cityOf({ districts: [{ code: "x", name: "<b>Юнусабад</b>" }] }) });

    expect(chip("<b>Юнусабад</b>")).toBeTruthy();
    expect(container.querySelector("b")).toBeNull();
  });

  it("without a city (reference not loaded) shows only the area row", () => {
    const { container } = where({ city: null });

    expect(labels(container)).toEqual([CHIP.draw]);
    expect(container.textContent).not.toContain("Районы");
  });
});

describe("WhereSection: the area row per mode", () => {
  it("search mode without an area: «Обвести на карте», not highlighted", () => {
    where();

    expect(pressed(CHIP.draw)).toBe(false);
    expect(chipOrNull(CHIP.area)).toBeNull();
  });

  it("search mode with an area: the highlighted «Своя область на карте» removes it", () => {
    const onDraw = vi.fn();
    where({ filters: { polygon: POLYGON }, onDraw });

    expect(pressed(CHIP.area)).toBe(true);
    expect(chipOrNull(CHIP.draw)).toBeNull();

    tap(CHIP.area);
    expect(latest.polygon).toBeNull();
    expect(onDraw).not.toHaveBeenCalled();
    expect(chip(CHIP.draw)).toBeTruthy();
  });

  it.each(["radar-new", "radar-edit"] as const)("%s without an area: no area row", (mode) => {
    const { container } = where({ mode });

    expect(chipOrNull(CHIP.draw)).toBeNull();
    expect(chipOrNull(CHIP.area)).toBeNull();
    expect(labels(container)[0]).toBe(CHIP.center);
  });

  it.each(["radar-new", "radar-edit"] as const)("%s with an area: the chip only removes it", (mode) => {
    where({ mode, filters: { polygon: POLYGON } });

    expect(pressed(CHIP.area)).toBe(true);
    tap(CHIP.area);
    expect(latest.polygon).toBeNull();
    expect(chipOrNull(CHIP.area)).toBeNull();
    expect(chipOrNull(CHIP.draw)).toBeNull();
  });

  it("offers no draw chip when the caller has no draw hand-off", () => {
    where({ onDraw: null });

    expect(chipOrNull(CHIP.draw)).toBeNull();
  });
});

describe("WhereSection: the draw hand-off", () => {
  it.each([
    ["zones", { zones: ["center"] }],
    ["districts", { districts: ["yunusabad", "chilanzar"] }],
  ] as const)("with %s: the draft without districts and zones, the rest kept, the draft itself untouched", (_mode, start) => {
    const onDraw = vi.fn();
    where({ filters: { ...start, near_metro: true, price_max: 500, owner: "owners" }, onDraw });

    tap(CHIP.draw);

    expect(onDraw).toHaveBeenCalledTimes(1);
    const payload = onDraw.mock.calls[0][0] as SearchFilters;
    expect(payload.zones).toEqual([]);
    expect(payload.districts).toEqual([]);
    expect(payload.polygon).toBeNull();
    expect(payload).toMatchObject({ city: "tashkent", deal: "rent_long", near_metro: true, price_max: 500, owner: "owners" });
    expect(latest).toMatchObject(start);
  });
});
