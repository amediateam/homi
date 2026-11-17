import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { formatNumber } from "@homi/i18n/format";
import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";

import type { ListingDetails } from "@/features/listing/listingData";
import { StatsSection } from "@/features/listing/sections/StatsSection";

type Stats = ListingDetails["stats"];

const BASE: Stats = { days_listed: 3, publications: 2, channels: 2, views: 41 };

function stats(overrides: Partial<Stats> = {}, locale: Locale = "ru") {
  return render(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
      <StatsSection stats={{ ...BASE, ...overrides }} />
    </NextIntlClientProvider>,
  );
}

const names = () => [...document.querySelectorAll<HTMLElement>("[data-stat]")].map((cell) => cell.dataset.stat);
/** A cell as «value · label». */
const cell = (name: string) => {
  const found = document.querySelector(`[data-stat="${name}"]`);
  return found ? [...found.children].map((child) => child.textContent).join(" · ") : null;
};

afterEach(cleanup);

describe("StatsSection (BR-APP-068)", () => {
  it("shows the days, the publications, the channels and the views of the stub listing", () => {
    stats();

    expect(names()).toEqual(["days", "publications", "channels", "views"]);
    expect(cell("days")).toBe("3 · дня на рынке");
    expect(cell("publications")).toBe("2 · публикации");
    expect(cell("channels")).toBe("2 · канала");
    expect(cell("views")).toBe("41 · просмотр");
  });

  it.each([
    [1, "день на рынке", "публикация", "просмотр"],
    [2, "дня на рынке", "публикации", "просмотра"],
    [5, "дней на рынке", "публикаций", "просмотров"],
    [11, "дней на рынке", "публикаций", "просмотров"],
    [21, "день на рынке", "публикация", "просмотр"],
  ])("ru plurals for %i", (n, days, publications, views) => {
    stats({ days_listed: n, publications: n, channels: n, views: n });

    expect(cell("days")).toBe(`${n} · ${days}`);
    expect(cell("publications")).toBe(`${n} · ${publications}`);
    expect(cell("views")).toBe(`${n} · ${views}`);
  });

  it("reads «Сегодня на рынке» at 0 days", () => {
    stats({ days_listed: 0 });

    expect(cell("days")).toBe("Сегодня · на рынке");
  });

  it("shows the channels only when there is more than one", () => {
    stats({ channels: 1 });
    expect(names()).toEqual(["days", "publications", "views"]);

    cleanup();
    stats({ channels: 2 });
    expect(cell("channels")).toBe("2 · канала");
  });

  it("hides the views at 0 and when unknown, and groups a large count", () => {
    stats({ views: 0 });
    expect(names()).not.toContain("views");

    cleanup();
    stats({ views: null });
    expect(names()).not.toContain("views");

    cleanup();
    stats({ views: 1200 });
    expect(cell("views")).toBe(`${formatNumber(1200, "ru")} · просмотров`);
    expect(cell("views")).toBe("1\u00a0200 · просмотров");
  });

  it("speaks the locale", () => {
    stats({ days_listed: 0, views: 1200 }, "en");

    expect(cell("days")).toBe("Today · on the market");
    expect(cell("publications")).toBe("2 · posts");
    expect(cell("views")).toBe("1,200 · views");
  });
});
