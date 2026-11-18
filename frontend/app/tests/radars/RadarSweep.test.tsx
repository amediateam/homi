import { cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { RadarSweep } from "@/features/radars/RadarSweep";

afterEach(cleanup);

const art = () => document.querySelector<HTMLElement>('[data-slot="radar-sweep"]')!;
const wedge = () => art().querySelector<HTMLElement>('[data-slot="radar-sweep-wedge"]')!;
const blips = () => [...art().querySelectorAll<HTMLElement>('[data-slot="radar-sweep-blip"]')];
const placed = () => blips().map((blip) => [blip.style.left, blip.style.top, blip.style.animationDelay]);

describe("RadarSweep (SCR-027, SCR-047)", () => {
  it("the radar tab's empty state: 132 px, three blips at the legacy places, delayed 0, 1.9 and 1.2 s", () => {
    render(<RadarSweep size={132} blips={3} />);

    expect(art().getAttribute("aria-hidden")).toBe("true");
    expect([art().style.width, art().style.height]).toEqual(["132px", "132px"]);
    expect(placed()).toEqual([
      ["64%", "26%", "0s"],
      ["28%", "62%", "1.9s"],
      ["70%", "70%", "1.2s"],
    ]);
    for (const blip of blips()) {
      expect([blip.style.width, blip.style.height, blip.style.margin]).toEqual(["9px", "9px", "-4.5px 0px 0px -4.5px"]);
      expect(blip.style.boxShadow).toBe("0 0 0 4px color-mix(in srgb, var(--accent) 25%, transparent)");
    }
  });

  it("the radar card in the feed: 56 px, two blips at their own places, the second 1.9 s behind, 7 px with a 3 px halo", () => {
    render(<RadarSweep size={56} blips={2} />);

    expect([art().style.width, art().style.height]).toEqual(["56px", "56px"]);
    expect(placed()).toEqual([
      ["66%", "28%", "0s"],
      ["30%", "64%", "1.9s"],
    ]);
    for (const blip of blips()) {
      expect([blip.style.width, blip.style.height, blip.style.margin]).toEqual(["7px", "7px", "-3.5px 0px 0px -3.5px"]);
      expect(blip.style.boxShadow).toBe("0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent)");
    }
  });

  it("marks every animated element for lite graphics: the wedge turns, the blips flash, nothing else moves", () => {
    render(<RadarSweep size={132} blips={3} />);

    expect(wedge().className).toMatch(/(?:^|\s)animate-radar-turn(?:\s|$)/);
    for (const blip of blips()) {
      expect(blip.className).toMatch(/(?:^|\s)animate-radar-blip(?:\s|$)/);
    }
    const animated = [...art().querySelectorAll<HTMLElement>("[class*='animate-']")];
    const marked = [...art().querySelectorAll<HTMLElement>("[data-radar-animation]")];
    expect(animated).toHaveLength(4);
    expect(marked).toEqual(animated);
    expect(art().className).not.toMatch(/animate-/);
  });

  it("draws the rings and the wedge from the theme's roles, so both themes recolour it", () => {
    render(<RadarSweep size={132} blips={3} />);

    const rings = art().style.backgroundImage;
    expect(rings.startsWith("radial-gradient(circle,")).toBe(true);
    for (const at of [21, 43, 66]) {
      expect(rings).toContain(`var(--sep) ${at}%, var(--sep) calc(${at}% + 1px)`);
    }
    expect(art().className).toMatch(/(?:^|\s)bg-fill(?:\s|$)/);
    expect(wedge().style.backgroundImage).toBe(
      "conic-gradient(from 0deg, color-mix(in srgb, var(--accent) 55%, transparent), transparent 22%)",
    );
  });

  it("takes the caller's classes and renders on the server, with the marks in the HTML", () => {
    render(<RadarSweep size={56} blips={2} className="mb-[6px]" />);
    expect(art().className).toMatch(/(?:^|\s)mb-\[6px\](?:\s|$)/);

    const html = renderToString(<RadarSweep size={132} blips={3} />);
    expect(html.match(/data-radar-animation=""/g)).toHaveLength(4);
    expect(html).toContain("animation-delay:1.9s");
  });
});
