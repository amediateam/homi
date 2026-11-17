import type { Locale } from "@homi/config";
import { filtersAreaSummary, filtersSummary } from "@homi/search";
import { getMessages } from "@homi/i18n";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ pathname: "/", search: "", loaded: true }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.search) }));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@/lib/navigation/nav", () => ({ nav: { replace: vi.fn() } }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ me: null }) }));

const TASHKENT = {
  code: "tashkent",
  name: "Ташкент",
  center: { lat: 41.3111, lon: 69.2797 },
  zoom: 12,
  is_region: false,
  has_metro: true,
  has_median: true,
  districts: [{ code: "yunusabad", name: "Юнусабад" }],
  zones: [{ code: "center", name: "Центр" }],
};
vi.mock("@/lib/reference/useReference", () => ({
  useReference: () => {
    const cities = state.loaded ? [TASHKENT] : [];
    return { loaded: state.loaded, cities, findCity: (code: string) => cities.find((city) => city.code === code) ?? null, usdUzs: 0 };
  },
}));

import { MiniTitle, miniTitleSummary } from "@/features/shell/MiniTitle";

function title(locale: Locale = "ru") {
  render(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
      <MiniTitle />
    </NextIntlClientProvider>,
  );
  return screen.getByRole("button");
}

let fake: FakeTelegram | null = null;
const haptics = () => (fake?.calls ?? []).filter((entry) => entry.member.startsWith("HapticFeedback")).length;

beforeEach(() => {
  state.pathname = "/";
  state.search = "";
  state.loaded = true;
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

describe("MiniTitle (SCR-006, BR-APP-064)", () => {
  it("reads «<deal> · <summary>» from the address", () => {
    state.search = "city=tashkent&districts=yunusabad&rooms_min=2&rooms_max=2&owner=owners";
    expect(title().textContent).toBe("Аренда · Ташкент · Юнусабад · 2-комн. · от хозяев");
  });

  it("daily rent reads as rent, the summary names the day rate once", () => {
    state.search = "city=tashkent&deal=rent_daily";
    expect(title().textContent).toBe("Аренда · Ташкент · Посуточно");
  });

  it.each([
    ["ru", "Продажа · Ташкент"],
    ["uz", "Sotuv · Ташкент"],
    ["en", "Buy · Ташкент"],
  ] as const)("the deal in %s", (locale, expected) => {
    state.search = "city=tashkent&deal=sale";
    expect(title(locale).textContent).toBe(expected);
  });

  it("before the reference data arrives it is the deal alone: no city, no district code, no undefined", () => {
    state.loaded = false;
    state.search = "city=tashkent&districts=yunusabad&rooms_min=2";
    expect(title().textContent).toBe("Аренда");
  });

  it("is chosen in one place: WP-22's filtersSummary, not the whole-city label (D-SH-3)", () => {
    expect(miniTitleSummary).toBe(filtersSummary);
    expect(miniTitleSummary).not.toBe(filtersAreaSummary);
  });

  it("carries the hooks of the lite rule and its layer", () => {
    const button = title();
    expect(button.hasAttribute("data-mini-title")).toBe(true);
    expect(button.className).toMatch(/(?:^|\s)z-\(--z-mini-title\)(?:\s|$)/);
    expect(button.className).toMatch(/(?:^|\s)glass(?:\s|$)/);
  });

  it("names the feed's own search while a listing lies over the feed (KI-43)", () => {
    state.search = "city=tashkent&deal=sale";
    const tree = () => (
      <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
        <MiniTitle />
      </NextIntlClientProvider>
    );
    const { rerender } = render(tree());

    state.pathname = "/listing/42";
    state.search = "";
    rerender(tree());

    expect(screen.getByRole("button").textContent).toBe("Продажа · Ташкент");
  });

  it("a tap on the collapsed chrome only expands it, with one light haptic", () => {
    state.search = "city=tashkent";
    const button = title();
    document.documentElement.classList.add("chrome-mini");

    fireEvent.click(button);
    expect(document.documentElement.classList.contains("chrome-mini")).toBe(false);
    expect(haptics()).toBe(1);

    fireEvent.click(button);
    expect(haptics()).toBe(1);
  });
});
