import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Switch } from "../src/index";

afterEach(cleanup);

/**
 * The Switch against legacy `.switch` (51 × 31, a 27 px thumb 2 px in, 20 px of travel) and against its surfaces: it
 * sits on a `--fill` tile or card, on the page (`--bg`) or in a sheet (`--bg` = `--sheet`). The colours are worked out
 * from the class names and the stylesheets of `@homi/ui`, so a class that names another role is checked as well.
 */
const stylesDir = join(import.meta.dirname, "../src/styles");
const css = ["tokens.css", "brand.css", "themes.css", "theme.css", "layout.css"]
  .map((name) => readFileSync(join(stylesDir, name), "utf8"))
  .join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");

/** The declarations of every rule whose selector is exactly `selector`, later ones winning. */
function rule(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const declarations: Record<string, string> = {};
  for (const match of css.matchAll(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, "g"))) {
    for (const part of match[1].split(";")) {
      const colon = part.indexOf(":");
      if (colon > 0) {
        declarations[part.slice(0, colon).trim()] = part.slice(colon + 1).trim();
      }
    }
  }
  return declarations;
}

type Scheme = "light" | "dark";
type State = "checked" | "unchecked";
type Surface = "page" | "sheet";
interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** The Tailwind colour utilities of `@homi/ui` (`--color-bg: var(--bg)` …). */
const roles = rule("@theme inline");
const schemes: Record<Scheme, Record<string, string>> = {
  light: { ...rule(":root"), ...rule('html[data-theme="light"]') },
  dark: { ...rule(":root"), ...rule('html[data-scheme="dark"]') },
};

function colour(value: string, vars: Record<string, string>): Rgba {
  const text = value.trim();
  const reference = /^var\((--[\w-]+)(?:,\s*(.+))?\)$/.exec(text);
  if (reference) {
    const next = vars[reference[1]] ?? reference[2];
    if (next === undefined) {
      throw new Error(`${reference[1]} is not defined`);
    }
    return colour(next, vars);
  }
  const hex = /^#([0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const [r, g, b] = [0, 2, 4].map((at) => Number.parseInt(hex[1].slice(at, at + 2), 16));
    return { r, g, b, a: 1 };
  }
  const rgba = /^rgba\(([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)$/.exec(text);
  if (rgba) {
    return { r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]), a: Number(rgba[4]) };
  }
  const mix = /^color-mix\(in srgb,\s*(.+)\s+([\d.]+)%,\s*transparent\)$/.exec(text);
  if (mix) {
    const base = colour(mix[1], vars);
    return { ...base, a: (base.a * Number(mix[2])) / 100 };
  }
  throw new Error(`no colour for "${text}"`);
}

function over(top: Rgba, below: Rgba): Rgba {
  const mixed = (channel: "r" | "g" | "b") => top[channel] * top.a + below[channel] * (1 - top.a);
  return { r: mixed("r"), g: mixed("g"), b: mixed("b"), a: 1 };
}

/** WCAG 2.2 contrast of two opaque colours. */
function contrast(one: Rgba, two: Rgba): number {
  const luminance = ({ r, g, b }: Rgba) => {
    const [lr, lg, lb] = [r, g, b].map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  };
  const [light, dark] = [luminance(one), luminance(two)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

/** The variants of a class (`data-[state=checked]:bg-accent`), split on the colons outside brackets. */
function parts(className: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of className) {
    depth += character === "[" ? 1 : character === "]" ? -1 : 0;
    if (character === ":" && depth === 0) {
      out.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  return [...out, current];
}

/**
 * The background utility that applies to an element in `state` under `scheme`: the class with the most matching
 * variants. Two with as many would leave it to the order of the generated CSS, so that fails the test.
 */
function backgroundClass(element: Element, state: State, scheme: Scheme): string {
  const candidates = (element.getAttribute("class") ?? "").split(/\s+/).flatMap((name) => {
    const variants = parts(name);
    const utility = variants.pop()!;
    if (!utility.startsWith("bg-")) {
      return [];
    }
    for (const variant of variants) {
      if (variant !== `data-[state=${state}]` && !(variant === "[[data-scheme=dark]_&]" && scheme === "dark")) {
        return [];
      }
    }
    return [{ utility, weight: variants.length }];
  });
  const top = Math.max(...candidates.map((candidate) => candidate.weight));
  const winners = candidates.filter((candidate) => candidate.weight === top);
  expect(winners.map((winner) => winner.utility)).toHaveLength(1);
  return winners[0].utility;
}

function backgroundColour(element: Element, state: State, scheme: Scheme, surface: Surface): Rgba {
  const utility = backgroundClass(element, state, scheme);
  const role = roles[`--color-${utility.slice("bg-".length)}`];
  if (role === undefined) {
    throw new Error(`${utility} is no colour role of @homi/ui`);
  }
  const vars = { ...schemes[scheme] };
  if (surface === "sheet") {
    vars["--bg"] = rule('[data-slot="bottom-sheet"]')["--bg"];
    vars["--sheet"] = schemes[scheme]["--sheet"] === "var(--bg)" ? schemes[scheme]["--bg"] : schemes[scheme]["--sheet"];
  }
  return colour(role, vars);
}

/** The thumb against the track, both over a `--fill` tile on `surface`. */
function thumbContrast(state: State, scheme: Scheme, surface: Surface): number {
  render(<Switch aria-label="send" checked={state === "checked"} />);
  const track = screen.getByRole("switch", { name: "send" });
  const thumb = track.querySelector('[data-slot="switch-thumb"]')!;
  const vars = { ...schemes[scheme] };
  const page = colour(surface === "sheet" ? "var(--sheet)" : "var(--bg)", vars);
  const tile = over(colour("var(--fill)", vars), page);
  const behind = over(backgroundColour(track, state, scheme, surface), tile);
  const knob = over(backgroundColour(thumb, state, scheme, surface), behind);
  cleanup();
  return contrast(knob, behind);
}

describe("Switch (legacy .switch, WP-20, WP-30)", () => {
  it("is 51 × 31 px with a 27 px thumb 2 px in, which travels 20 px in pixels, not rem (KI-33)", () => {
    render(<Switch aria-label="send" defaultChecked />);
    const track = screen.getByRole("switch", { name: "send" });
    const thumb = track.querySelector('[data-slot="switch-thumb"]')!;
    const px = (element: Element, utility: string) =>
      Number(new RegExp(`(?:^|\\s)${utility}-\\[(\\d+)px\\](?:\\s|$)`).exec(element.getAttribute("class") ?? "")?.[1]);

    expect([px(track, "w"), px(track, "h"), px(track, "p"), px(thumb, "size")]).toEqual([51, 31, 2, 27]);
    expect(px(thumb, "data-\\[state=checked\\]:translate-x")).toBe(51 - 2 * 2 - 27);
    expect(thumb.getAttribute("class")).not.toMatch(/translate-x-\d/);
  });

  it.each(["page", "sheet"] as const)("off in the dark scheme on a tile on the %s: the thumb stands out from the track (≥ 3:1)", (surface) => {
    expect(thumbContrast("unchecked", "dark", surface)).toBeGreaterThanOrEqual(3);
  });

  it.each([
    ["light", "page"],
    ["light", "sheet"],
    ["dark", "page"],
    ["dark", "sheet"],
  ] as const)("on in the %s scheme on the %s: the accent track, with a thumb that stands out from it (≥ 3:1)", (scheme, surface) => {
    render(<Switch aria-label="send" checked />);
    expect(backgroundClass(screen.getByRole("switch"), "checked", scheme)).toBe("bg-accent");
    cleanup();
    expect(thumbContrast("checked", scheme, surface)).toBeGreaterThanOrEqual(3);
  });

  it.each(["light", "dark"] as const)("off in the %s scheme: the track is not the --fill of the tiles and cards it sits on", (scheme) => {
    render(<Switch aria-label="send" />);
    expect(backgroundClass(screen.getByRole("switch"), "unchecked", scheme)).not.toBe("bg-fill");
  });
});
