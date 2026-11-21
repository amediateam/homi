import { getMessages } from "@homi/i18n";
import {
  DEALS,
  DEFAULT_RULES,
  defaultFilters,
  normalizeFilters,
  resolveRules,
  type SearchFilters,
  type SearchMode,
  sectionsFor,
  switchRentTerm,
} from "@homi/search";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { type ComponentType, useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppliancesSection } from "@/features/filters/sections/AppliancesSection";
import { AreaSection } from "@/features/filters/sections/AreaSection";
import { FloorSection } from "@/features/filters/sections/FloorSection";
import { FurnitureSection } from "@/features/filters/sections/FurnitureSection";
import { MarketSection } from "@/features/filters/sections/MarketSection";
import { OwnerSection } from "@/features/filters/sections/OwnerSection";
import { PetsSection } from "@/features/filters/sections/PetsSection";
import { PostedSection } from "@/features/filters/sections/PostedSection";
import { RenovationSection } from "@/features/filters/sections/RenovationSection";
import { TenantSection } from "@/features/filters/sections/TenantSection";
import type { SectionProps } from "@/features/filters/sections/types";
import { resetReference } from "@/lib/reference/useReference";
import { currentToast, dismissToast } from "@/lib/ui/toast";

import { cityOf, feedReference } from "../helpers/reference";

const CITY = cityOf();
const MODES: readonly SearchMode[] = ["search", "radar-new", "radar-edit"];

let latest: SearchFilters = defaultFilters();

/** One section over a draft kept as `useDraft` keeps it: every patch goes through `normalizeFilters`. */
function Harness({ Section, initial, mode }: { Section: ComponentType<SectionProps>; initial: SearchFilters; mode: SearchMode }) {
  const [draft, setDraft] = useState(initial);
  useEffect(() => {
    latest = draft;
  }, [draft]);
  return (
    <Section
      filters={draft}
      update={(patch) => setDraft((current) => normalizeFilters({ ...current, ...patch }))}
      city={CITY}
      stats={null}
      mode={mode}
      rules={DEFAULT_RULES}
      sections={sectionsFor(draft, CITY, mode, DEFAULT_RULES)}
    />
  );
}

function show(Section: ComponentType<SectionProps>, filters: Partial<SearchFilters> = {}, mode: SearchMode = "search") {
  const initial = normalizeFilters({ ...defaultFilters("rent_long", "tashkent"), ...filters });
  latest = initial;
  return render(
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      <Harness Section={Section} initial={initial} mode={mode} />
    </NextIntlClientProvider>,
  );
}

const chip = (name: string) => screen.getByRole("button", { name });
const radio = (name: string) => screen.getByRole("radio", { name });
const pressed = (name: string) => chip(name).getAttribute("aria-pressed") === "true";
const checked = () =>
  screen
    .getAllByRole("radio")
    .filter((item) => item.getAttribute("aria-checked") === "true")
    .map((item) => item.textContent);
const tap = (name: string) => fireEvent.click(chip(name));
const pick = (name: string) => fireEvent.click(radio(name));
const toastKey = () => {
  const message = currentToast("sheet")?.message;
  return typeof message === "object" && "key" in message ? message.key : null;
};

beforeEach(() => {
  window.localStorage.clear();
  feedReference({});
});

afterEach(() => {
  cleanup();
  dismissToast("sheet");
  dismissToast("app");
  resetReference();
  window.localStorage.clear();
});

describe("visibility of sections 9–16 per deal and mode (sectionsFor, BR-APP-019 … BR-APP-021)", () => {
  type Visible = Pick<ReturnType<typeof sectionsFor>, "tenant" | "pets" | "area" | "market" | "appliances">;
  const expected = (petsLongOnly: boolean, tenantDaily: boolean): Record<(typeof DEALS)[number], Visible> => ({
    rent_long: { tenant: true, pets: true, area: true, market: false, appliances: true },
    rent_daily: { tenant: !tenantDaily, pets: !petsLongOnly, area: true, market: false, appliances: true },
    sale: { tenant: false, pets: false, area: true, market: true, appliances: false },
  });

  for (const petsLongOnly of [true, false]) {
    for (const tenantDaily of [false, true]) {
      for (const deal of DEALS) {
        for (const mode of MODES) {
          it(`${deal}, ${mode}, dev017PetsLongRentOnly ${petsLongOnly ? "on" : "off"}, dev017TenantPetsDailyRule ${tenantDaily ? "on" : "off"}`, () => {
            const sections = sectionsFor(
              defaultFilters(deal, "tashkent"),
              CITY,
              mode,
              resolveRules({ dev017PetsLongRentOnly: petsLongOnly, dev017TenantPetsDailyRule: tenantDaily }),
            );

            expect({
              tenant: sections.tenant,
              pets: sections.pets,
              area: sections.area,
              market: sections.market,
              appliances: sections.appliances,
            }).toEqual(expected(petsLongOnly, tenantDaily)[deal]);
            expect(sections.posted).toBe(mode === "search");
          });
        }
      }
    }
  }

  it("default rules: the tenant section stays offered for daily rent although the term switch cleared it, the pets one goes (LB-APP-029, DEC-58)", () => {
    const daily = switchRentTerm(normalizeFilters({ ...defaultFilters(), tenant: "family", pets_only: true }), "rent_daily");

    expect(daily).toMatchObject({ tenant: null, pets: false, pets_only: false });
    expect(sectionsFor(daily, CITY, "search", DEFAULT_RULES)).toMatchObject({ tenant: true, pets: false });
  });
});

describe("TenantSection", () => {
  it("picks one tenant, moves to another, and clears on a second tap", () => {
    show(TenantSection);

    tap("Семья");
    expect(latest.tenant).toBe("family");
    expect(pressed("Семья")).toBe(true);

    tap("Парни");
    expect(latest.tenant).toBe("men");
    expect(pressed("Семья")).toBe(false);
    expect(pressed("Парни")).toBe(true);

    tap("Парни");
    expect(latest.tenant).toBeNull();
    expect(["Семья", "Парни", "Девушки"].map(pressed)).toEqual([false, false, false]);
  });
});

describe("PetsSection", () => {
  it("is the focus target of the pets launch", () => {
    const { container } = show(PetsSection);

    expect(container.querySelector('[data-focus="pets"]')?.getAttribute("data-section")).toBe("pets");
  });

  it.each([
    ["Не запрещены", { pets: true, pets_only: false }],
    ["Разрешены", { pets: false, pets_only: true }],
  ] as const)("«%s» sets %o, «Не важно» clears both", (label, filters) => {
    show(PetsSection);

    pick(label);
    expect(latest).toMatchObject(filters);
    expect(checked()).toEqual([label]);

    pick("Не важно");
    expect(latest).toMatchObject({ pets: false, pets_only: false });
    expect(checked()).toEqual(["Не важно"]);
  });

  it("reads the stored state: pets_only as «Разрешены», pets as «Не запрещены»", () => {
    show(PetsSection, { pets_only: true });
    expect(checked()).toEqual(["Разрешены"]);
    cleanup();

    show(PetsSection, { pets: true });
    expect(checked()).toEqual(["Не запрещены"]);
  });

  it("explains a new non-neutral choice in the sheet's toast, replaces it with the next and drops it on «Не важно»", () => {
    show(PetsSection);

    pick("Не запрещены");
    expect(toastKey()).toBe("sheet.petsTip");
    const first = currentToast("sheet")?.id;

    pick("Не запрещены");
    expect(currentToast("sheet")?.id).toBe(first);

    pick("Разрешены");
    expect(toastKey()).toBe("sheet.petsOnlyTip");
    expect(currentToast("sheet")?.id).not.toBe(first);

    pick("Не важно");
    expect(currentToast("sheet")).toBeNull();
    expect(currentToast("app")).toBeNull();
  });

  it("shows «Новое» while the server announces pets and the marker is unset; any tap marks it", () => {
    feedReference({ reference: { features: ["pets"] } });
    const { container } = show(PetsSection);
    const pill = () => container.querySelector('[data-slot="new-pill"]');

    expect(pill()?.textContent).toBe("Новое");

    pick("Не важно");
    expect(window.localStorage.getItem("homi-new-pets")).toBe("1");
    expect(pill()).toBeNull();
    expect(currentToast("sheet")).toBeNull();
  });

  it("marks the feature on a change too", () => {
    feedReference({ reference: { features: ["pets"] } });
    show(PetsSection);

    pick("Разрешены");
    expect(window.localStorage.getItem("homi-new-pets")).toBe("1");
  });

  it("has no pill once the marker is set, or when the server does not announce pets", () => {
    feedReference({ reference: { features: ["pets"] } });
    window.localStorage.setItem("homi-new-pets", "1");
    const { container } = show(PetsSection);
    expect(container.querySelector('[data-slot="new-pill"]')).toBeNull();
    cleanup();

    window.localStorage.clear();
    feedReference({ reference: { features: [] } });
    const second = show(PetsSection);
    expect(second.container.querySelector('[data-slot="new-pill"]')).toBeNull();
  });
});

describe("FurnitureSection", () => {
  it("is three-state: «Не важно» null, «С мебелью» true, «Без мебели» false", () => {
    show(FurnitureSection);
    expect(checked()).toEqual(["Не важно"]);

    pick("С мебелью");
    expect(latest.furnished).toBe(true);
    expect(checked()).toEqual(["С мебелью"]);

    pick("Без мебели");
    expect(latest.furnished).toBe(false);
    expect(checked()).toEqual(["Без мебели"]);

    pick("Не важно");
    expect(latest.furnished).toBeNull();
  });
});

describe("PostedSection", () => {
  const HINT = "Только для ленты: в чат и так приходят лишь новые.";

  it("picks one period, clears on a second tap, and shows the hint only while set", () => {
    const { container } = show(PostedSection);
    expect(container.textContent).not.toContain(HINT);

    tap("За 3 дня");
    expect(latest.posted_days).toBe(3);
    expect(container.textContent).toContain(HINT);

    tap("За неделю");
    expect(latest.posted_days).toBe(7);
    expect(pressed("За 3 дня")).toBe(false);
    expect(pressed("За неделю")).toBe(true);

    tap("За неделю");
    expect(latest.posted_days).toBeNull();
    expect(container.textContent).not.toContain(HINT);
  });
});

describe("the other sections", () => {
  it("OwnerSection: «Все» / «Без риелторов» / «Только хозяева»", () => {
    show(OwnerSection);
    expect(checked()).toEqual(["Все"]);

    pick("Только хозяева");
    expect(latest.owner).toBe("owners");
    pick("Без риелторов");
    expect(latest.owner).toBe("no_agents");
    pick("Все");
    expect(latest.owner).toBe("any");
  });

  it("FloorSection: two independent toggles", () => {
    show(FloorSection);

    tap("Не первый");
    tap("Не последний");
    expect(latest).toMatchObject({ floor_not_first: true, floor_not_last: true });

    tap("Не первый");
    expect(latest).toMatchObject({ floor_not_first: false, floor_not_last: true });
  });

  it("RenovationSection: the list of the draft's deal, multi-select, server names as text", () => {
    feedReference({
      reference: {
        renovations: {
          rent_long: [
            { code: "euro", name: "Евроремонт" },
            { code: "<i>", name: "<i>Свежий</i>" },
          ],
          rent_daily: [],
          sale: [{ code: "none", name: "Без ремонта" }],
          owner: [],
        },
      },
    });
    const { container } = show(RenovationSection);

    expect(screen.queryByRole("button", { name: "Без ремонта" })).toBeNull();
    tap("Евроремонт");
    tap("<i>Свежий</i>");
    expect(latest.renovation).toEqual(["euro"]);
    expect(container.querySelector("i")).toBeNull();

    tap("Евроремонт");
    expect(latest.renovation).toEqual([]);
  });

  it("RenovationSection: a deal without a list shows the heading over an empty row", () => {
    feedReference({ reference: { renovations: { rent_long: [{ code: "euro", name: "Евроремонт" }], rent_daily: [], sale: [], owner: [] } } });
    const { container } = show(RenovationSection, { deal: "rent_daily" });

    expect(container.querySelector("h2")?.textContent).toBe("Ремонт");
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("AppliancesSection: the one reference list, multi-select", () => {
    feedReference({
      reference: {
        appliances: [
          { code: "ac", name: "Кондиционер" },
          { code: "washer", name: "Стиральная машина" },
        ],
      },
    });
    show(AppliancesSection, { deal: "rent_daily" });

    tap("Стиральная машина");
    tap("Кондиционер");
    expect(latest.appliances).toEqual(["washer", "ac"]);
    expect(pressed("Кондиционер")).toBe(true);

    tap("Стиральная машина");
    expect(latest.appliances).toEqual(["ac"]);
  });

  it.each([
    ["the reference data not loaded", null],
    ["an answer without the lists", { appliances: undefined, renovations: undefined }],
  ] as const)("RenovationSection and AppliancesSection with %s: headings only", (_case, reference) => {
    feedReference({ reference });
    const { container } = show(AppliancesSection);
    expect(container.querySelector("h2")?.textContent).toBe("Техника");
    expect(container.querySelectorAll("button")).toHaveLength(0);
    cleanup();

    const second = show(RenovationSection);
    expect(second.container.querySelector("h2")?.textContent).toBe("Ремонт");
    expect(second.container.querySelectorAll("button")).toHaveLength(0);
  });

  it("AreaSection: digits only, 0 is no bound, capped at 10 000; an inverted range stays as typed", () => {
    show(AreaSection, { deal: "sale" });
    const from = screen.getByRole("textbox", { name: "от" });
    const to = screen.getByRole("textbox", { name: "до" });
    expect(from.getAttribute("placeholder")).toBe("0");
    expect(to.getAttribute("placeholder")).toBe("любая");

    fireEvent.change(from, { target: { value: "12a3" } });
    expect(latest.area_min).toBe(123);
    fireEvent.change(to, { target: { value: "20000" } });
    expect(latest.area_max).toBe(10000);
    expect((to as HTMLInputElement).value).toBe("10000");
    fireEvent.change(to, { target: { value: "50" } });
    expect(latest).toMatchObject({ area_min: 123, area_max: 50 });

    fireEvent.change(from, { target: { value: "0" } });
    expect(latest.area_min).toBeNull();
    expect((from as HTMLInputElement).value).toBe("");
  });

  it("MarketSection: «Не важно» / «Новостройка» / «Вторичка» under «Дом»", () => {
    const { container } = show(MarketSection, { deal: "sale" });
    expect(container.querySelector("h2")?.textContent).toBe("Дом");
    expect(checked()).toEqual(["Не важно"]);

    pick("Новостройка");
    expect(latest.market).toBe("new");
    pick("Вторичка");
    expect(latest.market).toBe("secondary");
    pick("Не важно");
    expect(latest.market).toBeNull();
  });
});
