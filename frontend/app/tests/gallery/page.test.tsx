import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Page from "@/app/[locale]/dev/ui/page";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

/** The segment's error boundary, as `[locale]/error.tsx` is for the real page. */
class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    return this.state.error ? <p data-testid="boundary">{this.state.error.message}</p> : this.props.children;
  }
}

const ENTRIES = [
  "gallery-header-chip",
  "gallery-header-chip-plain",
  "gallery-header-chip-highlighted",
  "gallery-header-chip-badge",
  "gallery-header-chip-long",
  "gallery-filter-chip",
  "gallery-segmented",
  "gallery-segmented-two",
  "gallery-segmented-three",
  "gallery-segmented-compact",
  "gallery-choice-list",
  "gallery-choice-list-languages",
  "gallery-error-state",
  "gallery-error-offline",
  "gallery-error-server",
  "gallery-empty-state",
  "gallery-empty-image",
  "gallery-empty-no-image",
  "gallery-icons",
  "gallery-radar-icon",
  "gallery-bottom-sheet",
  "gallery-open-sheet-full",
  "gallery-open-sheet-compact",
  "gallery-open-sheet-fixed",
  "gallery-subpage",
  "gallery-open-subpage",
  "gallery-crash",
  "gallery-throw",
];

describe("the primitives gallery (D-E-4)", () => {
  it.each(["production", "", "preview"])("answers not-found when NEXT_PUBLIC_APP_ENV is %j", (env) => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", env);
    expect(() => Page()).toThrow("not found");
  });

  it.each(["local", "ci", "staging"])("renders one entry per primitive in %s", (env) => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", env);
    render(Page());

    expect(document.querySelector('[data-route="dev/ui"]')).not.toBeNull();
    for (const id of ENTRIES) {
      expect(screen.getByTestId(id), id).toBeTruthy();
    }
  });

  it("opens and closes a sheet, the stacked sheet and the sub-page", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "ci");
    render(Page());

    fireEvent.click(screen.getByTestId("gallery-open-sheet-full"));
    const filters = screen.getByRole("dialog", { name: "Фильтры" });
    fireEvent.click(screen.getByTestId("gallery-open-sheet-stacked"));
    expect(document.querySelectorAll('[data-slot="bottom-sheet"]')).toHaveLength(2);
    fireEvent.click(screen.getByRole("radio", { name: "Андижан" }));
    expect(document.querySelectorAll('[data-slot="bottom-sheet"]')).toHaveLength(1);
    fireEvent.click(filters.querySelector<HTMLElement>('[data-slot="bottom-sheet-close"]')!);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByTestId("gallery-open-sheet-fixed"));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Выберите город" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Ташкент" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByTestId("gallery-open-subpage"));
    expect(screen.getByRole("region", { name: "Тема" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(screen.queryByRole("region", { name: "Тема" })).toBeNull();
  });

  it("the throw button makes a child throw while rendering", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "ci");
    // React reports the caught error on the console.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<Boundary>{Page()}</Boundary>);

    fireEvent.click(screen.getByTestId("gallery-throw"));

    expect(screen.getByTestId("boundary").textContent).toBe("UI gallery: a render error on purpose");
  });
});
