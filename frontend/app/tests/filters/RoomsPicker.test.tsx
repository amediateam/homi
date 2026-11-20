import { getMessages } from "@homi/i18n";
import { defaultFilters, normalizeFilters, type SearchFilters } from "@homi/search";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RoomsPicker } from "@/features/filters/RoomsPicker";

/** The drafts the picker handed over, as the form would hold them; the first is the initial one. */
const drafts: SearchFilters[] = [];

function Host({ initial }: { initial: SearchFilters }) {
  const [filters, setFilters] = useState(initial);
  const update = (patch: Partial<SearchFilters>) => {
    const next = normalizeFilters({ ...filters, ...patch });
    drafts.push(next);
    setFilters(next);
  };
  return <RoomsPicker filters={filters} update={update} />;
}

function picker(initial: SearchFilters = defaultFilters()) {
  drafts.splice(0, drafts.length, initial);
  return render(
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      <Host initial={initial} />
    </NextIntlClientProvider>,
  );
}

const button = (label: string) => screen.getByRole("button", { name: label });
const tap = (label: string) => fireEvent.click(button(label));
const range = () => {
  const latest = drafts[drafts.length - 1];
  return [latest.rooms_min, latest.rooms_max];
};
/** The labels of the pressed buttons, in order. */
const pressed = () =>
  screen
    .getAllByRole("button")
    .filter((node) => node.getAttribute("aria-pressed") === "true")
    .map((node) => node.textContent);

let fake: FakeTelegram | null = null;
const impacts = () => (fake?.calls ?? []).filter((entry) => entry.member === "HapticFeedback.impactOccurred").map((entry) => entry.args[0]);

beforeEach(() => {
  fake = fakeTelegram({ version: "8.0" });
});

afterEach(() => {
  cleanup();
  fake?.uninstall();
  fake = null;
});

describe("RoomsPicker (BR-APP-007)", () => {
  it("shows «Любые», 1, 2, 3, «4+»; «Любые» is pressed while nothing is picked", () => {
    picker();

    expect(screen.getAllByRole("button").map((node) => node.textContent)).toEqual(["Любые", "1", "2", "3", "4+"]);
    expect(pressed()).toEqual(["Любые"]);
    expect(range()).toEqual([null, null]);
  });

  it("«до 2» from a radar's filters (only `rooms_max`) presses 1 and 2, not «Любые» (since index-CIa0Ldj2.js)", () => {
    picker({ ...defaultFilters(), rooms_min: null, rooms_max: 2 });

    expect(pressed()).toEqual(["1", "2"]);
  });

  it("a tap on 2 picks 2–2; then 4 makes «2 and up»", () => {
    picker();

    tap("2");
    expect(range()).toEqual([2, 2]);
    expect(pressed()).toEqual(["2"]);

    tap("4+");
    expect(range()).toEqual([2, null]);
    expect(pressed()).toEqual(["2", "3", "4+"]);
  });

  it("3 then 1 makes 1–3", () => {
    picker();

    tap("3");
    tap("1");
    expect(range()).toEqual([1, 3]);
    expect(pressed()).toEqual(["1", "2", "3"]);
  });

  it("«Любые» clears a range", () => {
    picker({ ...defaultFilters(), rooms_min: 1, rooms_max: 3 });
    expect(pressed()).toEqual(["1", "2", "3"]);

    tap("Любые");
    expect(range()).toEqual([null, null]);
    expect(pressed()).toEqual(["Любые"]);
  });

  it("a tap inside a range starts a new single value", () => {
    picker({ ...defaultFilters(), rooms_min: 1, rooms_max: 3 });

    tap("2");
    expect(range()).toEqual([2, 2]);
  });

  it("every tap plays a light impact", () => {
    picker();

    tap("1");
    tap("3");
    tap("Любые");
    expect(impacts()).toEqual(["light", "light", "light"]);
  });
});
