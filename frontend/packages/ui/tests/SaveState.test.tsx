import { act, cleanup, render, renderHook } from "@testing-library/react";
import { Activity } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SAVE_DONE_MS, SAVE_DONE_REDUCED_MS, saveButtonProps, SaveState, useSavePhase } from "../src/index";

let reduced = false;

beforeEach(() => {
  reduced = false;
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduced && query.includes("reduce"), media: query }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const motion = readFileSync(join(import.meta.dirname, "../src/styles/motion.css"), "utf8");

describe("useSavePhase (BR-APP-114)", () => {
  it("starts idle and takes the phase its owner sets", () => {
    const { result } = renderHook(() => useSavePhase());
    expect(result.current.phase).toBe("idle");

    act(() => result.current.setPhase("busy"));
    expect(result.current.phase).toBe("busy");
  });

  it(`confirm() shows the tick and resolves after ${SAVE_DONE_MS} ms`, async () => {
    const { result } = renderHook(() => useSavePhase());
    const resolved = vi.fn();
    act(() => {
      void result.current.confirm().then(resolved);
    });
    expect(result.current.phase).toBe("done");

    await vi.advanceTimersByTimeAsync(SAVE_DONE_MS - 1);
    expect(resolved).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toHaveBeenCalledTimes(1);
    expect(SAVE_DONE_MS).toBe(900);
  });

  it(`under reduced motion it resolves after ${SAVE_DONE_REDUCED_MS} ms`, async () => {
    reduced = true;
    const { result } = renderHook(() => useSavePhase());
    const resolved = vi.fn();
    act(() => {
      void result.current.confirm().then(resolved);
    });

    await vi.advanceTimersByTimeAsync(SAVE_DONE_REDUCED_MS - 1);
    expect(resolved).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toHaveBeenCalledTimes(1);
    expect(SAVE_DONE_REDUCED_MS).toBe(250);
  });

  it("starts over when its owner is hidden with its route or unmounted: a sheet opened again shows no old tick", async () => {
    function Owner() {
      const save = useSavePhase();
      return (
        <button type="button" data-phase={save.phase} onClick={() => void save.confirm()}>
          save
        </button>
      );
    }
    const shown = (hidden: boolean) => (
      <Activity mode={hidden ? "hidden" : "visible"}>
        <Owner />
      </Activity>
    );
    const view = render(shown(false));
    const button = () => document.querySelector("button")!;
    act(() => button().click());
    expect(button().getAttribute("data-phase")).toBe("done");

    view.rerender(shown(true));
    view.rerender(shown(false));
    expect(button().getAttribute("data-phase")).toBe("idle");
  });

  it("confirm keeps its identity across renders", () => {
    const { result, rerender } = renderHook(() => useSavePhase());
    const first = result.current.confirm;
    rerender();
    expect(result.current.confirm).toBe(first);
  });
});

describe("SaveState", () => {
  const spinner = () => document.querySelector('[data-slot="save-spinner"]');
  const tick = () => document.querySelector('[data-slot="save-tick"]');
  const label = () => document.querySelector('[data-slot="save-state"]')!.firstElementChild as HTMLElement;

  it("idle: the label alone", () => {
    render(<SaveState phase="idle">Сохранить</SaveState>);
    expect(label().textContent).toBe("Сохранить");
    expect(label().className).not.toContain("invisible");
    expect(spinner()).toBeNull();
    expect(tick()).toBeNull();
  });

  it("busy: the spinner over the label, which still holds the width", () => {
    render(<SaveState phase="busy">Сохранить</SaveState>);
    expect(label().textContent).toBe("Сохранить");
    expect(label().className).toContain("invisible");
    expect(spinner()?.getAttribute("aria-hidden")).toBe("true");
    expect(tick()).toBeNull();
  });

  it("done: the tick that draws itself", () => {
    render(<SaveState phase="done">Сохранить</SaveState>);
    expect(label().className).toContain("invisible");
    expect(spinner()).toBeNull();
    expect(tick()?.querySelector("path")?.getAttribute("pathLength")).toBe("1");
  });

  it("the button's marks and legacy's styles for them", () => {
    expect(saveButtonProps("busy")).toEqual({ "data-phase": "busy", "data-save": "" });
    expect(motion).toMatch(/\[data-save\]\[data-phase="busy"\] \{\s*clip-path: inset\(0 calc\(50% - 24px\) round 999px\);/);
    expect(motion).toMatch(/\[data-save\]\[data-phase="done"\] \{\s*background: var\(--good\);/);
    expect(motion).toMatch(/clip-path 0\.66s var\(--ease-spring\)/);
    expect(motion).toMatch(/\.save-spin \{[\s\S]*?spin 0\.7s linear infinite/);
    expect(motion).toMatch(/animation: save-draw 0\.4s ease-out 0\.15s forwards;/);
    // A busy or done button is disabled and not dimmed.
    expect(motion).toMatch(/\[data-save\]\[data-phase="busy"\]:disabled,\s*\[data-save\]\[data-phase="done"\]:disabled \{\s*opacity: 1;/);
    // Reduced motion: no shrink, and the tick stands drawn.
    expect(motion).toMatch(/reduce\) \{[\s\S]*\[data-save\]\[data-phase="busy"\] \{\s*clip-path: inset\(-4px round 999px\);[\s\S]*\.save-ok path \{\s*stroke-dashoffset: 0;/);
    // At rest the clip lies outside the button, so its focus ring shows.
    expect(motion).toMatch(/\[data-save\] \{\s*clip-path: inset\(-4px round 999px\);/);
  });
});
