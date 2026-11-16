import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FilterChip, HeaderChip, SlidersHorizontal } from "../src/index";

afterEach(cleanup);

const LONG_LABEL = "Mulkdorlardan, vositachilarsiz, faqat yangi uylar";

describe("HeaderChip", () => {
  it("is a plain button, not highlighted by default", () => {
    render(<HeaderChip>Цена</HeaderChip>);

    const chip = screen.getByRole("button", { name: "Цена" });
    expect(chip).toHaveProperty("type", "button");
    expect(chip.getAttribute("data-state")).toBe("off");
    expect(chip.hasAttribute("aria-pressed")).toBe(false);
  });

  it("highlights when its filter is set", () => {
    render(<HeaderChip highlighted>2 комнаты</HeaderChip>);

    const chip = screen.getByRole("button", { name: "2 комнаты" });
    expect(chip.getAttribute("data-state")).toBe("on");
    expect(chip.className).toMatch(/data-\[state=on\]:bg-text/);
  });

  it("shows the count badge above zero only, without changing the name given by aria-label", () => {
    const { rerender } = render(
      <HeaderChip aria-label="Фильтры" icon={<SlidersHorizontal size={17} />} count={3} />,
    );

    const chip = screen.getByRole("button", { name: "Фильтры" });
    const badge = chip.querySelector('[data-slot="header-chip-badge"]');
    expect(badge?.textContent).toBe("3");
    expect(badge?.getAttribute("aria-hidden")).toBe("true");
    expect(chip.querySelector('[data-slot="header-chip-label"]')).toBeNull();

    rerender(<HeaderChip aria-label="Фильтры" icon={<SlidersHorizontal size={17} />} count={0} />);
    expect(chip.querySelector('[data-slot="header-chip-badge"]')).toBeNull();

    rerender(<HeaderChip aria-label="Фильтры" icon={<SlidersHorizontal size={17} />} />);
    expect(chip.querySelector('[data-slot="header-chip-badge"]')).toBeNull();
  });

  it("inverts the badge on a highlighted chip", () => {
    render(
      <HeaderChip highlighted count={2}>
        Цена
      </HeaderChip>,
    );

    const badge = screen.getByRole("button").querySelector('[data-slot="header-chip-badge"]');
    expect(badge?.className).toMatch(/\bbg-bg\b/);
    expect(badge?.className).not.toMatch(/\bbg-text\b/);
  });

  it("cuts a long label with an ellipsis and keeps the full text in the title", () => {
    render(<HeaderChip>{LONG_LABEL}</HeaderChip>);

    const chip = screen.getByRole("button", { name: LONG_LABEL });
    expect(chip.getAttribute("title")).toBe(LONG_LABEL);
    expect(chip.className).toMatch(/\bmax-w-full\b/);
    expect(chip.querySelector('[data-slot="header-chip-label"]')?.className).toMatch(/\btruncate\b/);
  });

  it("keeps an explicit title and calls onClick once per tap", () => {
    const onClick = vi.fn();
    render(
      <HeaderChip title="Город" onClick={onClick}>
        Ташкент
      </HeaderChip>,
    );

    const chip = screen.getByRole("button", { name: "Ташкент" });
    expect(chip.getAttribute("title")).toBe("Город");
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("FilterChip", () => {
  it("exposes its state as aria-pressed", () => {
    const { rerender } = render(<FilterChip>Квартира</FilterChip>);

    const chip = screen.getByRole("button", { name: "Квартира" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");

    rerender(<FilterChip pressed>Квартира</FilterChip>);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(chip.className).toMatch(/aria-pressed:bg-text/);
  });

  it("leaves the toggle to the caller", () => {
    const onClick = vi.fn();
    render(<FilterChip onClick={onClick}>Дом</FilterChip>);

    const chip = screen.getByRole("button", { name: "Дом" });
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(chip.getAttribute("aria-pressed")).toBe("false");
  });

  it("cuts a long label and keeps the full text in the title", () => {
    render(<FilterChip pressed>{LONG_LABEL}</FilterChip>);

    const chip = screen.getByRole("button", { name: LONG_LABEL });
    expect(chip.getAttribute("title")).toBe(LONG_LABEL);
    expect(chip.querySelector('[data-slot="filter-chip-label"]')?.className).toMatch(/\btruncate\b/);
  });

  it("is a plain button that can be disabled", () => {
    const onClick = vi.fn();
    render(
      <FilterChip disabled onClick={onClick}>
        Участок
      </FilterChip>,
    );

    const chip = screen.getByRole("button", { name: "Участок" });
    expect(chip).toHaveProperty("type", "button");
    fireEvent.click(chip);
    expect(onClick).not.toHaveBeenCalled();
  });
});
