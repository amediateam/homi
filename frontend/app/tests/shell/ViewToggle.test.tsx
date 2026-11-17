import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ pathname: "/", search: "", tab: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.search) }));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@/lib/navigation/nav", () => ({ nav: { tab: (href: string) => state.tab(href), replace: vi.fn() } }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ me: null }) }));

import type { ShellVariant } from "@/features/shell/shellVariant";
import { ViewToggle } from "@/features/shell/ViewToggle";

function toggle(variant: ShellVariant, locale: Locale = "ru", onIntent?: () => void) {
  return render(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
      <ViewToggle variant={variant} onIntent={onIntent} />
    </NextIntlClientProvider>,
  );
}

const at = (pathname: string, search = "") => {
  state.pathname = pathname;
  state.search = search;
};

let fake: FakeTelegram | null = null;
const haptics = () =>
  (fake?.calls ?? []).filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);

beforeEach(() => {
  at("/");
  state.tab.mockReset();
  fake = fakeTelegram({ version: "8.0" });
  document.documentElement.classList.remove("chrome-mini");
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  fake?.uninstall();
  fake = null;
  document.documentElement.classList.remove("chrome-mini");
});

describe("ViewToggle (SCR-006)", () => {
  it.each([
    ["ru", "Карта", "Список"],
    ["uz", "Xarita", "Roʻyxat"],
    ["en", "Map", "List"],
  ] as const)("names the view it switches to (%s)", (locale, map, list) => {
    at("/", "city=tashkent");
    toggle("search-list", locale);
    expect(screen.getByRole("button").textContent).toBe(map);
    cleanup();

    at("/map", "city=tashkent");
    toggle("map", locale);
    expect(screen.getByRole("button").textContent).toBe(list);
  });

  it("the list goes to the map with the search parameters, and nothing else, through the tab replace", () => {
    at("/", "city=tashkent&deal=sale&rooms_min=2&sort=cheap&from=map&pin=3");
    toggle("search-list");

    fireEvent.click(screen.getByRole("button", { name: "Карта" }));

    expect(state.tab).toHaveBeenCalledTimes(1);
    expect(state.tab).toHaveBeenCalledWith("/map?city=tashkent&deal=sale&rooms_min=2&sort=cheap");
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
  });

  it("the map goes back to the list with the search parameters", () => {
    at("/map", "city=tashkent&deal=sale&pin=3");
    toggle("map");

    fireEvent.click(screen.getByRole("button", { name: "Список" }));

    expect(state.tab).toHaveBeenCalledWith("/?city=tashkent&deal=sale");
  });

  it.each(["map-drawing", "saved", "radars", "settings", "none"] as const)("is hidden for %s", (variant) => {
    at("/map", "city=tashkent&draw=1");
    expect(toggle(variant).container.innerHTML).toBe("");
  });

  it("a tap on the collapsed chrome only expands it", () => {
    at("/", "city=tashkent");
    toggle("search-list");
    document.documentElement.classList.add("chrome-mini");

    fireEvent.click(screen.getByRole("button"));

    expect(document.documentElement.classList.contains("chrome-mini")).toBe(false);
    expect(state.tab).not.toHaveBeenCalled();
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);

    fireEvent.click(screen.getByRole("button"));
    expect(state.tab).toHaveBeenCalledTimes(1);
  });

  it("a pointer-down on «Карта» calls onIntent at once, before the tap and without navigating (WP-27)", () => {
    at("/", "city=tashkent");
    const onIntent = vi.fn();
    toggle("search-list", "ru", onIntent);

    fireEvent.pointerDown(screen.getByRole("button", { name: "Карта" }));

    expect(onIntent).toHaveBeenCalledTimes(1);
    expect(onIntent).toHaveBeenCalledWith();
    expect(state.tab).not.toHaveBeenCalled();
    expect(haptics()).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Карта" }));
    expect(onIntent).toHaveBeenCalledTimes(1);
    expect(state.tab).toHaveBeenCalledTimes(1);
  });

  it("the intent is also called on the collapsed chrome, whose tap only expands it", () => {
    at("/", "city=tashkent");
    const onIntent = vi.fn();
    toggle("search-list", "ru", onIntent);
    document.documentElement.classList.add("chrome-mini");

    fireEvent.pointerDown(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("button"));

    expect(onIntent).toHaveBeenCalledTimes(1);
    expect(state.tab).not.toHaveBeenCalled();
  });

  it("«Список» on the map has no intent", () => {
    at("/map", "city=tashkent");
    const onIntent = vi.fn();
    toggle("map", "ru", onIntent);

    fireEvent.pointerDown(screen.getByRole("button", { name: "Список" }));

    expect(onIntent).not.toHaveBeenCalled();
  });

  it("floats at the toggle's layer with the hooks of the collapse rules", () => {
    toggle("search-list");
    const button = screen.getByRole("button");
    expect(button.className).toMatch(/(?:^|\s)z-\(--z-view-toggle\)(?:\s|$)/);
    expect(button.getAttribute("data-view-toggle")).toBe("list");
    expect(button.hasAttribute("data-chrome")).toBe(true);
  });
});
