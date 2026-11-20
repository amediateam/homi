import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";

import { KeyFacts, type KeyFactsProps } from "@/features/listing/KeyFacts";

const ITEM: KeyFactsProps["item"] = { rooms: 2, area_total: 54, floor: 3, floors_total: 9 };

/** The details' tiles of 100001; `marketCode` defaults to `secondary`. */
function facts(item: Partial<KeyFactsProps["item"]> = {}, { marketCode = "secondary", locale = "ru" }: { marketCode?: KeyFactsProps["marketCode"]; locale?: Locale } = {}) {
  return render(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
      <KeyFacts item={{ ...ITEM, ...item }} marketCode={marketCode} />
    </NextIntlClientProvider>,
  );
}

const tiles = () => [...document.querySelectorAll("[data-key-facts] [data-fact]")].map((tile) => [tile.getAttribute("data-fact"), tile.textContent]);

afterEach(cleanup);

describe("KeyFacts (SCR-018 block 4)", () => {
  it("rooms, m², floor n/total and the building, in this order", () => {
    facts();

    expect(tiles()).toEqual([
      ["rooms", "2комнаты"],
      ["area", "54м²"],
      ["floor", "3/9этаж"],
      ["building", "Вторичкадом"],
    ]);
  });

  it.each([
    [1, "комната"],
    [2, "комнаты"],
    [5, "комнат"],
    [11, "комнат"],
    [21, "комната"],
  ])("ru plural of %i rooms: «%s»", (rooms, noun) => {
    facts({ rooms });

    expect(document.querySelector('[data-fact="rooms"] span')?.textContent).toBe(noun);
  });

  it("en plural", () => {
    facts({ rooms: 1 }, { locale: "en" });
    expect(document.querySelector('[data-fact="rooms"] span')?.textContent).toBe("room");
    cleanup();

    facts({ rooms: 3 }, { locale: "en" });
    expect(document.querySelector('[data-fact="rooms"] span')?.textContent).toBe("rooms");
  });

  it("the code `new` is a new building, any other code a resale one, no code no tile", () => {
    facts({}, { marketCode: "new" });
    expect(document.querySelector('[data-fact="building"]')?.textContent).toBe("Новыйдом");
    cleanup();

    facts({}, { marketCode: null });
    expect(document.querySelector('[data-fact="building"]')).toBeNull();
    cleanup();

    render(
      <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
        <KeyFacts item={ITEM} marketCode={undefined} />
      </NextIntlClientProvider>,
    );
    expect(document.querySelector('[data-fact="building"]')).toBeNull();
  });

  it("a floor without a total is the floor alone", () => {
    facts({ floors_total: null });

    expect(document.querySelector('[data-fact="floor"] b')?.textContent).toBe("3");
  });

  it("leaves unknown and zero values out; only a floor of `null` leaves its tile out", () => {
    facts({ rooms: null, area_total: 0, floor: null });

    expect(tiles().map(([fact]) => fact)).toEqual(["building"]);
  });

  it.each([
    [0, 9, "ru", "Цокольный этаж"],
    [0, null, "ru", "Цокольный этаж"],
    [-1, 9, "ru", "Подвал"],
    [-2, null, "uz", "Yertoʻla"],
    [0, 9, "en", "Semi-basement floor"],
  ] as const)("BR-APP-110: floor %s of %s is the word tile (%s) with an empty caption", (floor, floors_total, locale, word) => {
    facts({ floor, floors_total }, { locale });

    expect(document.querySelector('[data-fact="floor"] b')?.textContent).toBe(word);
    expect(document.querySelector('[data-fact="floor"] span')?.textContent).toBe("");
  });

  it("a value wraps, hyphenated where it can, and is never cut off with an ellipsis", () => {
    facts({ floor: 0 });

    for (const value of document.querySelectorAll("[data-key-facts] b")) {
      expect(value.className.split(" ")).toEqual(expect.arrayContaining(["break-words", "hyphens-auto"]));
      expect(value.className.split(" ")).not.toContain("truncate");
    }
  });

  it("nothing when all four are absent", () => {
    facts({ rooms: null, area_total: null, floor: null, floors_total: null }, { marketCode: null });

    expect(document.querySelector("[data-key-facts]")).toBeNull();
  });
});
