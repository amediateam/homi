import { getMessages } from "@homi/i18n";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/favorites", () => ({ setFavorite: vi.fn(() => new Promise(() => {})) }));

import { resetPendingFavorites } from "@/features/feed/FavButton";
import { ListingTitleRow, type ListingTitleRowProps } from "@/features/listing/ListingTitleRow";
import { resetSessionMaps } from "@/lib/data/sessionMaps";

function row(props: Partial<ListingTitleRowProps> = {}) {
  return render(
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      <ListingTitleRow number={100001} title="2-комн. квартира, 54 м²" place="Юнусабад · Мегапланет" favorite={false} onMenu={vi.fn()} {...props} />
    </NextIntlClientProvider>,
  );
}

let fake: FakeTelegram | null = null;
const haptics = () =>
  (fake?.calls ?? []).filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);

beforeEach(() => {
  fake = fakeTelegram({ version: "8.0" });
});

afterEach(() => {
  cleanup();
  resetSessionMaps();
  resetPendingFavorites();
  fake?.uninstall();
  fake = null;
});

describe("ListingTitleRow (SCR-018 block 3)", () => {
  it("the title whole as the heading and the place line", () => {
    row({ title: "Дом · 200 м²" });

    expect(document.querySelector("h1[data-listing-title]")?.textContent).toBe("Дом · 200 м²");
    expect(document.querySelector("[data-listing-place]")?.textContent).toBe("Юнусабад · Мегапланет");
  });

  it("an empty title renders no heading; no place, no place line", () => {
    row({ title: "", place: null });

    expect(document.querySelector("h1")).toBeNull();
    expect(document.querySelector("[data-listing-place]")).toBeNull();
  });

  it("buttons in legacy order: share, the heart, «⋯»", () => {
    row({ onShare: vi.fn() });

    const buttons = [...document.querySelectorAll("button")];
    expect(buttons.map((button) => button.getAttribute("data-action") ?? `fav:${button.getAttribute("data-fav")}`)).toEqual([
      "share",
      "fav:plain",
      "menu",
    ]);
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(["Поделиться", "В избранное", "Ещё"]);
  });

  it("no share button without onShare (no bot name)", () => {
    row();

    expect(document.querySelector('button[data-action="share"]')).toBeNull();
  });

  it("share calls onShare and plays no haptic of its own (the share hook does)", () => {
    const onShare = vi.fn();
    row({ onShare });

    fireEvent.click(document.querySelector('button[data-action="share"]')!);

    expect(onShare).toHaveBeenCalledTimes(1);
    expect(haptics()).toEqual([]);
  });

  it("«⋯» plays the light haptic, then opens the menu", () => {
    const onMenu = vi.fn(() => expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]));
    row({ onMenu });

    fireEvent.click(document.querySelector('button[data-action="menu"]')!);

    expect(onMenu).toHaveBeenCalledTimes(1);
  });

  it("the heart starts from the listing's flag", () => {
    row({ favorite: true });

    expect(document.querySelector('[data-fav="plain"]')?.getAttribute("aria-pressed")).toBe("true");
  });
});
