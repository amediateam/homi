import type { Locale } from "@homi/config";
import { getMessages, type Messages } from "@homi/i18n";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ tab: vi.fn() }));
vi.mock("@/lib/navigation/nav", () => ({ nav: { tab: state.tab } }));

import type { ShellTab } from "@/features/shell/shellVariant";
import { LONG_LABEL_CHARS, TabBar } from "@/features/shell/TabBar";
import { rememberHref } from "@/lib/ui/shellState";

let fake: FakeTelegram | null = null;
const scrollTo = vi.fn();

const haptics = () =>
  (fake?.calls ?? []).filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);

function bar(active: ShellTab, locale: Locale = "ru", messages: Messages = getMessages(locale)) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Tashkent">
      <TabBar active={active} />
    </NextIntlClientProvider>
  );
}

function renderBar(active: ShellTab, locale: Locale = "ru", messages: Messages = getMessages(locale)) {
  return render(bar(active, locale, messages));
}

const button = (key: ShellTab) => document.querySelector<HTMLButtonElement>(`[data-tab="${key}"]`)!;
const label = (key: ShellTab) => button(key).querySelector("span")!;

beforeEach(() => {
  fake = fakeTelegram({ version: "8.0" });
  state.tab.mockReset();
  scrollTo.mockReset();
  vi.stubGlobal("scrollTo", scrollTo);
  rememberHref("/", "");
  rememberHref("/saved", "");
});

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("chrome-mini");
  fake?.uninstall();
  fake = null;
});

describe("TabBar (SCR-006)", () => {
  it("shows the four tabs in the legacy order, the active one current and under the lens", () => {
    renderBar("radars");

    const nav = screen.getByRole("navigation");
    expect([...nav.querySelectorAll("button")].map((item) => item.textContent)).toEqual(["Поиск", "Избранное", "Радар", "Настройки"]);
    expect(button("radars").getAttribute("aria-current")).toBe("page");
    expect(button("search").hasAttribute("aria-current")).toBe(false);
    expect(nav.style.getPropertyValue("--tab")).toBe("2");
    expect(button("radars").querySelector("svg")?.getAttribute("width")).toBe("24");
  });

  it.each<Locale>(["ru", "uz", "en"])("gives the long class to labels longer than 13 characters only (%s)", (locale) => {
    renderBar("search", locale);
    for (const key of ["search", "saved", "radars", "settings"] as const) {
      const text = label(key).textContent ?? "";
      expect(text.length).toBeGreaterThan(0);
      expect(label(key).classList.contains("long")).toBe(text.length > LONG_LABEL_CHARS);
    }
  });

  it.each<Locale>(["uz", "en"])("marks a 14-character label long and keeps a 13-character one (%s)", (locale) => {
    const messages = getMessages(locale) as Messages & { tab: Record<string, string> };
    renderBar("search", locale, { ...messages, tab: { ...messages.tab, favorites: "x".repeat(14), subs: "y".repeat(13) } } as Messages);

    expect(label("saved").classList.contains("long")).toBe(true);
    expect(label("radars").classList.contains("long")).toBe(false);
  });

  it("a press on another tab is a light impact, a tab replace to its address and, once it lands, a scroll to the top", () => {
    rememberHref("/map", "city=tashkent&deal=sale&draw=1");
    rememberHref("/saved/history", "");
    const view = renderBar("settings");

    fireEvent.click(button("search"));
    expect(state.tab).toHaveBeenLastCalledWith("/map?city=tashkent&deal=sale");
    // The replace is a transition: the old tab stays on screen until the new one commits, and must not jump meanwhile.
    expect(scrollTo).not.toHaveBeenCalled();
    view.rerender(bar("search"));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);

    fireEvent.click(button("saved"));
    expect(state.tab).toHaveBeenLastCalledWith("/saved/history");
    view.rerender(bar("saved"));
    fireEvent.click(button("radars"));
    expect(state.tab).toHaveBeenLastCalledWith("/radars");
    view.rerender(bar("radars"));

    expect(state.tab).toHaveBeenCalledTimes(3);
    expect(scrollTo).toHaveBeenCalledTimes(3);
    expect(haptics()).toEqual(Array(3).fill("HapticFeedback.impactOccurred(light)"));
  });

  it("a tab change that no press asked for (the SettingsButton, a launch link) does not scroll", () => {
    const view = renderBar("search");
    view.rerender(bar("settings"));
    view.rerender(bar("search"));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("a press on the active tab only scrolls to the top", () => {
    renderBar("saved");

    fireEvent.click(button("saved"));
    expect(state.tab).not.toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
  });

  it("a press while the chrome is collapsed only expands it", () => {
    renderBar("search");
    document.documentElement.classList.add("chrome-mini");

    fireEvent.click(button("settings"));
    expect(document.documentElement.classList.contains("chrome-mini")).toBe(false);
    expect(state.tab).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);

    fireEvent.click(button("settings"));
    expect(state.tab).toHaveBeenCalledWith("/settings");
  });
});
