import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as ui from "../src/index";
import {
  ChoiceList,
  EmptyState,
  RadarIcon,
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentedOption,
} from "../src/index";

afterEach(cleanup);

type Deal = "rent_long" | "sale";

const DEALS: readonly SegmentedOption<Deal>[] = [
  { value: "rent_long", label: "Аренда" },
  { value: "sale", label: "Продажа" },
];

function renderDeals(props: Partial<SegmentedControlProps<Deal>> = {}) {
  return render(
    <SegmentedControl aria-label="Сделка" options={DEALS} value="rent_long" onValueChange={() => {}} {...props} />,
  );
}

function checkedRadios() {
  return screen.getAllByRole("radio").filter((radio) => radio.getAttribute("aria-checked") === "true");
}

describe("SegmentedControl", () => {
  it("renders two options with exactly the given one selected", () => {
    renderDeals({ value: "sale" });

    const group = screen.getByRole("radiogroup", { name: "Сделка" });
    expect(group.getAttribute("data-slot")).toBe("segmented-control");
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(checkedRadios().map((radio) => radio.textContent)).toEqual(["Продажа"]);
  });

  it("reports another option and never the selected one", () => {
    const onValueChange = vi.fn();
    renderDeals({ onValueChange });

    fireEvent.click(screen.getByRole("radio", { name: "Аренда" }));
    expect(onValueChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("radio", { name: "Продажа" }));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith("sale");
  });

  it("keeps one option selected through every tap", () => {
    function Deals() {
      const [deal, setDeal] = useState<Deal>("rent_long");
      return <SegmentedControl aria-label="Сделка" options={DEALS} value={deal} onValueChange={setDeal} />;
    }
    render(<Deals />);

    for (const name of ["Продажа", "Продажа", "Аренда", "Аренда"]) {
      fireEvent.click(screen.getByRole("radio", { name }));
      expect(checkedRadios().map((radio) => radio.textContent)).toEqual([name]);
    }
  });

  it("follows the value it is given, not the tap, while the caller does not change it", () => {
    renderDeals();

    fireEvent.click(screen.getByRole("radio", { name: "Продажа" }));
    expect(checkedRadios().map((radio) => radio.textContent)).toEqual(["Аренда"]);
  });

  it("moves the selection with the arrow keys", async () => {
    const onValueChange = vi.fn();
    renderDeals({ onValueChange });

    const rent = screen.getByRole("radio", { name: "Аренда" });
    act(() => rent.focus());
    fireEvent.keyDown(rent, { key: "ArrowRight" });

    // Radix moves the focus in a timeout; the focused radio then selects itself.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Продажа" })));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith("sale");
  });

  it("uses the smaller text for three options", () => {
    render(
      <SegmentedControl
        aria-label="Кто"
        options={[
          { value: "any", label: "Все" },
          { value: "owner", label: "Собственники" },
          { value: "agent", label: "Риелторы" },
        ]}
        value="any"
        onValueChange={() => {}}
      />,
    );

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(radios.every((radio) => /text-\[13px\]/.test(radio.className))).toBe(true);
  });

  it("has a compact glass size for the map top bar", () => {
    renderDeals({ size: "compact" });

    const group = screen.getByRole("radiogroup", { name: "Сделка" });
    expect(group.getAttribute("data-size")).toBe("compact");
    expect(group.className).toMatch(/\bglass\b/);
    expect(group.className).not.toMatch(/\bbg-fill\b/);
    expect(screen.getByRole("radio", { name: "Аренда" }).className).toMatch(/data-\[state=checked\]:bg-text/);
  });

  it("skips a disabled option", () => {
    const onValueChange = vi.fn();
    renderDeals({ options: [DEALS[0], { ...DEALS[1], disabled: true }], onValueChange });

    fireEvent.click(screen.getByRole("radio", { name: "Продажа" }));
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe("ChoiceList", () => {
  const THEMES = [
    { value: "auto", label: "Как в Telegram" },
    { value: "light", label: "Светлая" },
    { value: "dark", label: "Тёмная" },
  ] as const;

  it("marks the chosen row with a check", () => {
    render(<ChoiceList aria-label="Тема" options={THEMES} value="light" onValueChange={() => {}} />);

    const list = screen.getByRole("radiogroup", { name: "Тема" });
    expect(list.getAttribute("data-slot")).toBe("choice-list");
    expect(checkedRadios().map((radio) => radio.textContent)).toEqual(["Светлая"]);
    expect(list.querySelectorAll(".lucide-check")).toHaveLength(1);
    expect(screen.getByRole("radio", { name: "Светлая" }).querySelector(".lucide-check")).not.toBeNull();
  });

  it("shows no check while nothing is chosen", () => {
    render(<ChoiceList aria-label="Язык" options={THEMES} value={null} onValueChange={() => {}} />);

    expect(checkedRadios()).toEqual([]);
    expect(document.querySelectorAll(".lucide-check")).toHaveLength(0);
  });

  it("reports a newly chosen row, and nothing for the chosen one", () => {
    const onValueChange = vi.fn();
    render(<ChoiceList aria-label="Тема" options={THEMES} value="auto" onValueChange={onValueChange} />);

    fireEvent.click(screen.getByRole("radio", { name: "Как в Telegram" }));
    expect(onValueChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("radio", { name: "Тёмная" }));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith("dark");
  });

  it("turns every row off while disabled", () => {
    const onValueChange = vi.fn();
    render(<ChoiceList aria-label="Тема" options={THEMES} value="auto" onValueChange={onValueChange} disabled />);

    expect(screen.getAllByRole("radio").every((radio) => radio.hasAttribute("disabled"))).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Тёмная" }));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("separates the rows with an inset line, none above the first", () => {
    render(<ChoiceList aria-label="Тема" options={THEMES} value="auto" onValueChange={() => {}} />);

    const [first] = screen.getAllByRole("radio");
    expect(first.getAttribute("data-slot")).toBe("choice-list-item");
    expect(first.className).toMatch(/not-first:before:left-4/);
    expect(first.className).toMatch(/min-h-\[52px\]/);
  });
});

describe("EmptyState", () => {
  it("renders the image as decoration with the texts and the action", () => {
    render(
      <EmptyState
        image="/brand/empty-magnifier.svg"
        title="Ничего не нашлось"
        hint="Попробуйте ослабить фильтры"
        action={<ui.Button variant="secondary">Сбросить фильтры</ui.Button>}
      />,
    );

    const image = document.querySelector('[data-slot="empty-state-image"]');
    expect(image?.getAttribute("src")).toBe("/brand/empty-magnifier.svg");
    expect(image?.getAttribute("alt")).toBe("");
    expect(screen.queryByRole("img")).toBeNull();
    expect(document.querySelector('[data-slot="empty-state-title"]')?.textContent).toBe("Ничего не нашлось");
    expect(document.querySelector('[data-slot="empty-state-hint"]')?.textContent).toBe("Попробуйте ослабить фильтры");
    expect(screen.getByRole("button", { name: "Сбросить фильтры" })).toBeTruthy();
  });

  it("keeps the 120 px box without an asset", () => {
    render(<EmptyState title="Здесь пока пусто" />);

    const media = document.querySelector('[data-slot="empty-state-media"]');
    expect(media?.className).toMatch(/size-\[120px\]/);
    expect(media?.className).toMatch(/\bshrink-0\b/);
    expect(media?.querySelector("img")).toBeNull();
    expect(document.querySelector('[data-slot="empty-state-hint"]')).toBeNull();
    expect(document.querySelector('[data-slot="empty-state-action"]')).toBeNull();
  });

  it("renders the title as a paragraph, or as the heading of a whole screen", () => {
    const { rerender } = render(<EmptyState title="Здесь пока пусто" />);
    expect(document.querySelector('[data-slot="empty-state-title"]')?.tagName).toBe("P");
    expect(screen.queryByRole("heading")).toBeNull();

    rerender(<EmptyState tall titleAs="h1" title="Такой страницы нет" />);
    const heading = screen.getByRole("heading", { level: 1, name: "Такой страницы нет" });
    expect(heading.getAttribute("data-slot")).toBe("empty-state-title");
  });
});

describe("icons", () => {
  it("RadarIcon draws with currentColor, is hidden from assistive technology and takes size and stroke", () => {
    const { container } = render(<RadarIcon size={24} strokeWidth={1.7} className="text-hint" />);

    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("stroke")).toBe("currentColor");
    expect(svg?.getAttribute("fill")).toBe("none");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("width")).toBe("24");
    expect(svg?.getAttribute("stroke-width")).toBe("1.7");
    expect(svg?.getAttribute("class")).toMatch(/\blucide-radar-icon\b/);
    expect(svg?.getAttribute("class")).toMatch(/\btext-hint\b/);
    expect(svg?.querySelectorAll("circle")).toHaveLength(2);
  });

  it("RadarIcon can carry a label", () => {
    render(<RadarIcon aria-label="Радар" role="img" />);

    expect(screen.getByRole("img", { name: "Радар" }).hasAttribute("aria-hidden")).toBe(false);
  });

  it("the package re-exports the lucide icons the app uses (D-UI-1)", () => {
    const names = [
      "ArrowDown",
      "Check",
      "ChevronDown",
      "ChevronLeft",
      "CloudOff",
      "Eye",
      "Globe",
      "Handshake",
      "Heart",
      "ImageOff",
      "Lasso",
      "LassoSelect",
      "List",
      "LocateFixed",
      "Lock",
      "Map",
      "MapIcon",
      "Maximize2",
      "Megaphone",
      "PartyPopper",
      "Play",
      "Plus",
      "RotateCw",
      "Search",
      "SearchX",
      "Settings",
      "ShieldCheck",
      "ShoppingBag",
      "Signpost",
      "SlidersHorizontal",
      "Trash",
      "Users",
      "WifiOff",
      "X",
    ] as const;
    const exported: Record<string, unknown> = ui;

    expect(names.filter((name) => exported[name] === undefined)).toEqual([]);
    expect(ui.MapIcon).toBe(ui.Map);
  });
});
