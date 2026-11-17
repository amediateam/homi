import { getMessages } from "@homi/i18n";
import {
  BedDouble,
  Building,
  Building2,
  Calculator,
  FileText,
  House,
  LandPlot,
  Layers,
  type LucideIcon,
  PaintRoller,
  Percent,
  Ruler,
  Sofa,
  WashingMachine,
} from "@homi/ui";
import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";

import type { ListingFact } from "@/features/listing/listingData";
import { FactsSection } from "@/features/listing/sections/FactsSection";

function facts(list: readonly ListingFact[]) {
  return render(
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      <FactsSection facts={list} />
    </NextIntlClientProvider>,
  );
}

/** The drawing of an icon, to tell which one a cell shows without relying on lucide's class names. */
function drawing(Icon: LucideIcon): string {
  const { container, unmount } = render(<Icon aria-hidden />);
  const markup = container.querySelector("svg")!.innerHTML;
  unmount();
  return markup;
}

const cells = () => [...document.querySelectorAll<HTMLElement>("[data-fact-key]")];
const iconOf = (cell: HTMLElement) => cell.querySelector("svg")!.innerHTML;
const fact = (key: string, value = "Да", label = key): ListingFact => ({ key, label, value });

afterEach(cleanup);

describe("FactsSection (03 SCR-018, block 6)", () => {
  it("shows «Факты» and the facts in the server's order, with label and value", () => {
    facts([fact("type", "Квартира", "Тип"), fact("area", "54 м²", "Площадь")]);

    expect(document.querySelector('[data-section="facts"] h2')?.textContent).toBe("Факты");
    expect(cells().map((cell) => cell.dataset.factKey)).toEqual(["type", "area"]);
    expect(cells()[0].textContent).toBe("ТипКвартира");
    expect(cells()[1].textContent).toBe("Площадь54 м²");
  });

  it.each<[string, LucideIcon]>([
    ["type", Building2],
    ["rooms", BedDouble],
    ["area", Ruler],
    ["land", LandPlot],
    ["floor", Layers],
    ["building", Building],
    ["renovation", PaintRoller],
    ["furniture", Sofa],
    ["appliances", WashingMachine],
    ["per_m2", Calculator],
    ["commission", Percent],
    ["conditions", FileText],
  ])("draws the icon of %s", (key, Icon) => {
    const expected = drawing(Icon);
    facts([fact(key)]);

    expect(iconOf(cells()[0])).toBe(expected);
    expect(cells()[0].querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("draws the house for an unknown key, also for an inherited property name", () => {
    const house = drawing(House);
    facts([fact("parking"), fact("toString")]);

    expect(cells().map(iconOf)).toEqual([house, house]);
  });

  it("renders repeated keys once each, in order, without a key warning", () => {
    const errors: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      facts([fact("conditions", "Без залога"), fact("conditions", "Оплата помесячно")]);
    } finally {
      console.error = original;
    }

    expect(cells().map((cell) => cell.textContent)).toEqual(["conditionsБез залога", "conditionsОплата помесячно"]);
    expect(errors).toEqual([]);
  });

  it("spans both columns only with a value longer than 18 characters", () => {
    facts([fact("conditions", "x".repeat(18)), fact("conditions", "x".repeat(19))]);

    expect(cells()[0].className).not.toContain("col-span-2");
    expect(cells()[1].className).toContain("col-span-2");
  });

  it("renders nothing without facts", () => {
    const { container } = facts([]);

    expect(container.innerHTML).toBe("");
  });
});
