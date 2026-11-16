import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Component, type ComponentProps, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Page from "@/app/[locale]/dev/ui/page";
import { currentToast, dismissToast } from "@/lib/ui/toast";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
}));
/** The counted `Link` needs the App Router; a plain anchor keeps its address. */
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, ...props }: ComponentProps<"a"> & { href: string }) => <a href={href} {...props} />,
}));

let fake: FakeTelegram | null = null;
const haptics = () =>
  (fake?.calls ?? []).filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);

afterEach(() => {
  cleanup();
  dismissToast("app");
  fake?.uninstall();
  fake = null;
  vi.useRealTimers();
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
  "gallery-toast",
  "gallery-toast-plain",
  "gallery-toast-action",
  "gallery-toast-key",
  "gallery-toast-replace",
  "gallery-confirm",
  "gallery-confirm-ask",
  "gallery-confirm-events",
  "gallery-feedback",
  "gallery-feedback-failed",
  "gallery-feedback-failed-dev016",
  "gallery-feedback-saved",
  "gallery-bottom-sheet",
  "gallery-open-sheet-full",
  "gallery-open-sheet-compact",
  "gallery-open-sheet-fixed",
  "gallery-subpage",
  "gallery-open-subpage",
  "gallery-routes",
  "gallery-route-filters",
  "gallery-route-settings-theme",
  "gallery-route-listing",
  "gallery-crash",
  "gallery-throw",
];

const click = (testId: string) => fireEvent.click(screen.getByTestId(testId));
const eventLog = () => screen.getByTestId("gallery-sheet-events").textContent;

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

describe("the feedback and route entries of the gallery (WP-23 part B)", () => {
  it("shows a plain, a catalogue-key and an action toast through the app's store; the action is logged", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "ci");
    render(Page());

    click("gallery-toast-plain");
    expect(currentToast()?.message).toBe("Ссылка скопирована");
    click("gallery-toast-key");
    expect(currentToast()?.message).toEqual({ key: "toast.blocked", values: { label: "@realtor_uz" } });
    click("gallery-toast-action");
    const message = currentToast()?.message;
    expect(message).toMatchObject({ text: "Объявление скрыто", action: "Вернуть" });

    act(() => (message as { run: () => void }).run());
    expect(eventLog()).toBe("События: toast action");
  });

  it("replaces the visible toast with a second one, and drops a pending replacement when the page goes", () => {
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "ci");
    const { unmount } = render(Page());

    click("gallery-toast-replace");
    const first = currentToast();
    expect(String(first?.message)).toMatch(/^Первый тост/);
    act(() => vi.advanceTimersByTime(1499));
    expect(currentToast()).toBe(first);
    act(() => vi.advanceTimersByTime(1));
    expect(String(currentToast()?.message)).toMatch(/^Второй тост/);
    expect(currentToast()?.id).not.toBe(first?.id);

    click("gallery-toast-replace");
    const pending = currentToast();
    unmount();
    act(() => vi.advanceTimersByTime(1500));
    expect(currentToast()).toBe(pending);
  });

  it("logs the answer of the confirm dialog into the event log", async () => {
    fake = fakeTelegram({ version: "6.2", answers: { confirm: false } });
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "ci");
    render(Page());

    await act(async () => click("gallery-confirm-ask"));
    fake.answers.confirm = true;
    await act(async () => click("gallery-confirm-ask"));

    expect(fake.calls.filter((entry) => entry.member === "showConfirm").map((entry) => entry.args[0])).toEqual([
      "Очистить историю просмотров?",
      "Очистить историю просмотров?",
    ]);
    expect(screen.getByTestId("gallery-confirm-events").textContent).toBe("События: confirm true · confirm false");
    expect(eventLog()).toBe("События: confirm true · confirm false");
  });

  it("plays failed() with the flag off and on, and saved()", () => {
    fake = fakeTelegram();
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "ci");
    render(Page());

    click("gallery-feedback-failed");
    expect(currentToast()).toBeNull();
    click("gallery-feedback-failed-dev016");
    expect(currentToast()?.message).toEqual({ key: "common.saveFailed" });
    click("gallery-feedback-saved");

    expect(haptics()).toEqual([
      "HapticFeedback.notificationOccurred(error)",
      "HapticFeedback.notificationOccurred(error)",
      "HapticFeedback.notificationOccurred(success)",
    ]);
    expect(eventLog()).toBe("События: saved · failed, DEV-016 · failed");
  });

  it("links the three route wrappers through their real addresses", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "ci");
    render(Page());

    expect(screen.getByTestId("gallery-route-filters").getAttribute("href")).toBe("/filters");
    expect(screen.getByTestId("gallery-route-settings-theme").getAttribute("href")).toBe("/settings/theme");
    expect(screen.getByTestId("gallery-route-listing").getAttribute("href")).toBe("/listing/42");
  });
});
