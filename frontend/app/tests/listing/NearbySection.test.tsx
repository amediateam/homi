import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { formatDistance } from "@homi/i18n/format";
import { type LucideIcon, MapPin, School, TrainFront, Trees } from "@homi/ui";
import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";

import type { ListingDetails, ListingNearby } from "@/features/listing/listingData";
import { NearbySection } from "@/features/listing/sections/NearbySection";

import { translator } from "../helpers/listing";

const PARK: ListingNearby = { kind: "park", name: "Парк", km: 0.4, note: null };
const SCHOOL: ListingNearby = { kind: "school", name: "Школа", km: 0.9, note: null };

function nearby(
  {
    metro = { name: "Минор", km: 0.7 },
    places = [PARK, SCHOOL],
    radius = 300,
  }: { metro?: ListingDetails["metro"]; places?: readonly ListingNearby[]; radius?: number | null } = {},
  locale: Locale = "ru",
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
      <NearbySection metro={metro} nearby={places} geoRadiusM={radius} />
    </NextIntlClientProvider>,
  );
}

function drawing(Icon: LucideIcon): string {
  const { container, unmount } = render(<Icon aria-hidden />);
  const markup = container.querySelector("svg")!.innerHTML;
  unmount();
  return markup;
}

/** What `formatDistance` prints, so the test follows the catalogue's units. */
const distance = (km: number, approx = false, locale: Locale = "ru") => formatDistance(km, locale, translator(locale), { approx });

const rows = () => [...document.querySelectorAll<HTMLElement>("[data-nearby]")];
const kinds = () => rows().map((row) => row.dataset.nearby);
/** The distance cell: the last child of a row. */
const distances = () => rows().map((row) => row.lastElementChild?.textContent);

afterEach(cleanup);

describe("NearbySection (BR-APP-031, LB-APP-016)", () => {
  it("shows «Рядом», the metro first, then the server's places in order, with their distances", () => {
    nearby();

    expect(document.querySelector('[data-section="nearby"] h3')?.textContent).toBe("Рядом");
    expect(kinds()).toEqual(["metro", "park", "school"]);
    expect(rows().map((row) => row.querySelector("span > span")?.textContent)).toEqual(["Минор", "Парк", "Школа"]);
    expect(distances()).toEqual(["700 м", "400 м", "900 м"]);
    expect(distances()).toEqual([distance(0.7), distance(0.4), distance(0.9)]);
  });

  it("shows the metro at 1.5 km, not at 1.51 km nor with an unknown distance", () => {
    nearby({ metro: { name: "Минор", km: 1.5 } });
    expect(kinds()).toEqual(["metro", "park", "school"]);
    expect(distances()[0]).toBe("1,5 км");

    cleanup();
    nearby({ metro: { name: "Минор", km: 1.51 } });
    expect(kinds()).toEqual(["park", "school"]);

    cleanup();
    nearby({ metro: { name: "Минор", km: null } });
    expect(kinds()).toEqual(["park", "school"]);
  });

  it("draws an unknown kind with the pin, and the metro, park and school with their own icons", () => {
    const icons = [drawing(TrainFront), drawing(Trees), drawing(School), drawing(MapPin)];
    nearby({ places: [PARK, SCHOOL, { kind: "hospital", name: "Больница", km: 1.2, note: null }] });

    expect(kinds()).toEqual(["metro", "park", "school", "other"]);
    expect(rows().map((row) => row.querySelector("svg")!.innerHTML)).toEqual(icons);
    expect(rows()[3].textContent).toContain("Больница");
  });

  it("renders two places of one kind, also with the same name, without a key warning", () => {
    const errors: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      nearby({ metro: null, places: [SCHOOL, { ...SCHOOL, km: 1.1 }, SCHOOL] });
    } finally {
      console.error = original;
    }

    expect(kinds()).toEqual(["school", "school", "school"]);
    expect(errors).toEqual([]);
  });

  it("prefixes `~` at a radius of 500 m and without a radius, also on the metro row; not at 300 m", () => {
    nearby({ radius: 500 });
    expect(distances()).toEqual(["~700 м", "~400 м", "~900 м"]);
    expect(distances()).toEqual([distance(0.7, true), distance(0.4, true), distance(0.9, true)]);

    cleanup();
    nearby({ radius: null });
    expect(distances()[0]).toBe("~700 м");

    cleanup();
    nearby({ radius: 400 });
    expect(distances()[0]).toBe("~700 м");

    cleanup();
    nearby({ radius: 300 });
    expect(distances()).toEqual(["700 м", "400 м", "900 м"]);
  });

  it("puts a non-empty note under the name in small muted text; none for null or empty, none on the metro row", () => {
    nearby({
      places: [
        { ...PARK, note: "через дорогу" },
        { ...SCHOOL, note: null },
        { ...SCHOOL, name: "Лицей", note: "" },
      ],
    });
    const notes = rows().map((row) => row.querySelector<HTMLElement>("[data-nearby-note]"));

    expect(notes[0]).toBeNull();
    expect(notes[1]?.textContent).toBe("через дорогу");
    expect(notes[1]?.className).toContain("text-hint");
    expect(notes[1]?.parentElement?.className).toContain("flex-col");
    expect(notes[1]?.previousElementSibling?.textContent).toBe("Парк");
    expect(notes[2]).toBeNull();
    expect(notes[3]).toBeNull();
  });

  it("writes «рядом» under 100 m and kilometres from 0.95 km, in the locale", () => {
    nearby({ metro: { name: "Минор", km: 0.05 }, places: [{ ...PARK, km: 1.26 }] }, "en");

    expect(document.querySelector('[data-section="nearby"] h3')?.textContent).toBe("Nearby");
    expect(distances()).toEqual(["close by", "1.3 km"]);
  });

  it("renders nothing without a row", () => {
    const { container } = nearby({ metro: { name: "Минор", km: 2 }, places: [] });

    expect(container.innerHTML).toBe("");
  });
});
