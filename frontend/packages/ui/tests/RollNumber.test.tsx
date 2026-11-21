import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ROLL_STAGGER_MS, RollNumber } from "../src/index";

afterEach(cleanup);

const root = () => document.querySelector<HTMLElement>('[data-slot="roll-number"]')!;
const columns = () => Array.from(root().children) as HTMLElement[];
const strips = () => Array.from(root().querySelectorAll<HTMLElement>("[data-roll-strip]"));
const motion = readFileSync(join(import.meta.dirname, "../src/styles/motion.css"), "utf8");

describe("RollNumber (BR-APP-113)", () => {
  it("one column per digit: a hidden digit for the width, a strip of 0 – 9 shifted to the digit", () => {
    render(<RollNumber value={307} />);

    expect(columns()).toHaveLength(3);
    expect(columns().map((column) => column.firstElementChild?.textContent)).toEqual(["3", "0", "7"]);
    expect(columns().every((column) => column.firstElementChild?.className.includes("invisible"))).toBe(true);
    expect(strips().map((strip) => strip.textContent)).toEqual(["0123456789", "0123456789", "0123456789"]);
    expect(strips().map((strip) => strip.style.transform)).toEqual(["translateY(-30%)", "translateY(0%)", "translateY(-70%)"]);
  });

  it(`the rightmost digit starts first, ${ROLL_STAGGER_MS} ms apart`, () => {
    render(<RollNumber value={1234} />);

    expect(ROLL_STAGGER_MS).toBe(45);
    expect(strips().map((strip) => strip.style.transitionDelay)).toEqual(["135ms", "90ms", "45ms", "0ms"]);
  });

  it("the plain number is the label and the columns are hidden from assistive technology", () => {
    render(<RollNumber value={42} />);

    expect(root().getAttribute("aria-label")).toBe("42");
    expect(columns().every((column) => column.getAttribute("aria-hidden") === "true")).toBe(true);
  });

  it("shows `max(0, round(value))`", () => {
    const view = render(<RollNumber value={12.6} />);
    expect(root().getAttribute("aria-label")).toBe("13");
    view.rerender(<RollNumber value={-5} />);
    expect(root().getAttribute("aria-label")).toBe("0");
  });

  it("the columns are keyed from the end: when the length changes the units stay the units", () => {
    const view = render(<RollNumber value={9} />);
    const units = columns().at(-1)!;

    view.rerender(<RollNumber value={10} />);
    expect(columns()).toHaveLength(2);
    expect(columns().at(-1)).toBe(units);
    expect(strips().at(-1)!.style.transform).toBe("translateY(0%)");

    view.rerender(<RollNumber value={7} />);
    expect(columns()).toHaveLength(1);
    expect(columns()[0]).toBe(units);
  });

  it("the strip moves over 0.62 s on the release's spring, and not at all under reduced motion", () => {
    expect(motion).toMatch(/\.roll-strip \{\s*transition: transform 0\.62s var\(--ease-spring\);\s*transition-timing-function: linear\(0, 0\.035 2\.5%/);
    // One rule for every transition under reduced motion: the strip jumps to its digit.
    expect(motion).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\* \{\s*transition: none !important;\s*\}/);
  });
});
