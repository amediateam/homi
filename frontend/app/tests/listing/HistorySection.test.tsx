import type { Locale } from "@homi/config";
import { getMessages, numberLocale } from "@homi/i18n";
import { formatShortDate, formatTime } from "@homi/i18n/format";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** `useMoney` without a profile currency or a rate prints dollars. */
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ me: null }) }));
vi.mock("@/lib/reference/useReference", () => ({ useReference: () => ({ usdUzs: 0 }) }));

import type { PriceEvent } from "@/features/listing/listingData";
import { HistorySection } from "@/features/listing/sections/HistorySection";
import { clearTracked, recentTracked } from "@/lib/analytics/events";

import { detailsOf } from "../helpers/details";

const TASHKENT = { timeZone: "Asia/Tashkent" };
/** 20:30 UTC: still 14 November in the device zone of the tests (UTC), already 15 November in Tashkent. */
const LATE = "2026-11-14T20:30:00+00:00";

function withIntl(children: ReactNode, locale: Locale) {
  return (
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
      {children}
    </NextIntlClientProvider>
  );
}

function section(history: readonly PriceEvent[], { locale = "ru", tashkentDates = false }: { locale?: Locale; tashkentDates?: boolean } = {}) {
  return withIntl(<HistorySection number={100001} history={history} tashkentDates={tashkentDates} />, locale);
}

const event = (overrides: Partial<PriceEvent> = {}): PriceEvent => ({
  at: "2026-11-14T06:40:00+00:00",
  channel: "stub_channel_a",
  url: null,
  text: null,
  kind: null,
  price_usd: null,
  change_pct: null,
  ...overrides,
});

/** The stub listing's two events (published at $648, then down 7.4 % to $600), each with a link of its own. */
const TWO = detailsOf().price_history;

const rows = () => [...document.querySelectorAll<HTMLElement>("[data-history-row]")];
const percent = (value: number, locale: Locale) =>
  `${value > 0 ? "+" : ""}${new Intl.NumberFormat(numberLocale(locale), { maximumFractionDigits: 3 }).format(value)}%`;

let fake: FakeTelegram;
const haptics = () =>
  fake.calls.filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);
const opened = () => fake.calls.filter((entry) => entry.member === "openTelegramLink").map((entry) => entry.args[0]);

beforeEach(() => {
  window.history.replaceState(null, "", "/ru/listing/100001");
  fake = fakeTelegram();
});

afterEach(() => {
  cleanup();
  fake.uninstall();
  clearTracked();
});

describe("HistorySection (BR-APP-069)", () => {
  it("renders nothing without events", () => {
    const { container } = render(section([]));

    expect(container.innerHTML).toBe("");
  });

  describe("one event: the sentence", () => {
    it("reads «Опубликовано {date} в @channel…» with the date alone, and the channel opens the post", () => {
      const at = "2026-11-10T07:00:00+00:00";
      render(section([event({ at, url: "https://t.me/stub_channel_a/3901" })]));

      const root = document.querySelector('[data-section="history"]')!;
      expect(root.getAttribute("data-history")).toBe("single");
      expect(root.querySelector("h2")?.textContent).toBe("История");
      expect(root.querySelector("p")?.textContent).toBe(
        `Опубликовано ${formatShortDate(at, "ru")} в @stub_channel_a. Повторов и изменений цены пока не было.`,
      );
      expect([...root.querySelectorAll("time")].map((time) => time.textContent)).toEqual(["10 нояб"]);
      expect(root.textContent).not.toContain(formatTime(at, "ru")!);

      const channel = root.querySelector<HTMLButtonElement>("button[data-history-channel]")!;
      expect(channel.textContent).toBe("@stub_channel_a");
      fireEvent.click(channel);

      expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
      expect(opened()).toEqual(["https://t.me/stub_channel_a/3901"]);
      expect(recentTracked()).toEqual([{ name: "original_opened", props: { listing_id: 100001, src: "price_history" } }]);
    });

    it("has no button without a link, and speaks uz and en", () => {
      const at = "2026-11-10T07:00:00+00:00";
      render(section([event({ at })], { locale: "uz" }));

      expect(document.querySelector("button")).toBeNull();
      expect(document.querySelector('[data-section="history"] p')?.textContent).toBe(
        `${formatShortDate(at, "uz")} da @stub_channel_a da joylangan. Takrorlar va narx oʻzgarishi hozircha yoʻq.`,
      );

      cleanup();
      render(section([event({ at, url: "https://t.me/stub_channel_a/3902" })], { locale: "en" }));
      expect(document.querySelector('[data-section="history"] h2')?.textContent).toBe("History");
      expect(document.querySelector("button[data-history-channel]")?.textContent).toBe("@stub_channel_a");
    });
  });

  describe("several events: the timeline", () => {
    it("shows «История цены» and a row per event: date, time, text · @channel, price and change", () => {
      render(section([TWO[0], { ...TWO[1], text: "Цена снижена" }]));

      const root = document.querySelector('[data-section="history"]')!;
      expect(root.getAttribute("data-history")).toBe("timeline");
      expect(root.querySelector("h2")?.textContent).toBe("История цены");
      expect(rows()).toHaveLength(2);
      const times = rows().map((row) => [...row.querySelectorAll("time")].map((time) => time.textContent));
      expect(times).toEqual([
        [formatShortDate(TWO[0].at, "ru"), formatTime(TWO[0].at, "ru")],
        [formatShortDate(TWO[1].at, "ru"), formatTime(TWO[1].at, "ru")],
      ]);
      expect(rows()[0].textContent).toContain("@stub_channel_a");
      expect(rows()[0].textContent).not.toContain(" · ");
      expect(rows()[1].textContent).toContain("Цена снижена · @stub_channel_a");
      expect(rows()[0].querySelector("b")?.textContent).toBe("$648");
      expect(rows()[1].querySelector("b")?.textContent).toBe("$600");
    });

    it.each<[string, number | null, "down" | "up" | null]>([
      ["a drop, in green with the down trend", -7.4, "down"],
      ["zero, in orange with the up trend", 0, "up"],
      ["a rise, in orange with a plus", 5, "up"],
      ["no change", null, null],
    ])("change: %s", (_name, change, direction) => {
      render(section([event({ kind: "published" }), event({ change_pct: change, price_usd: 600 })]));

      const cell = rows()[1].querySelector<HTMLElement>("[data-change]");
      if (direction === null || change === null) {
        expect(cell).toBeNull();
        return;
      }
      expect(cell?.dataset.change).toBe(direction);
      expect(cell?.textContent).toBe(percent(change, "ru"));
      expect(cell?.className).toContain(direction === "down" ? "text-good" : "text-high");
      expect(cell?.querySelector("svg")?.getAttribute("class")).toContain(direction === "down" ? "trending-down" : "trending-up");
    });

    it("writes the server's percent as it is, in the number locale, with no space before «%»", () => {
      render(section([event({ change_pct: -7.4 }), event({ change_pct: 5 }), event({ change_pct: 0 }), event({ change_pct: 12.345 })]));
      const changes = () => [...document.querySelectorAll("[data-change]")].map((cell) => cell.textContent);

      expect(changes()).toEqual([percent(-7.4, "ru"), "+5%", "0%", percent(12.345, "ru")]);
      expect(changes()[0]).toMatch(/^.7,4%$/);
      expect(changes()[3]).toBe("+12,345%");

      cleanup();
      render(section([event({ change_pct: -7.4 }), event({ change_pct: 5 })], { locale: "en" }));
      expect(changes()).toEqual([percent(-7.4, "en"), "+5%"]);
      expect(changes()[0]).toMatch(/^.7\.4%$/);
    });

    it("shows no price without one, and nothing in the last column without price and change", () => {
      render(section([event({ price_usd: null, change_pct: -3 }), event()]));

      expect(rows()[0].querySelector("b")).toBeNull();
      expect(rows()[0].querySelector("[data-change]")).not.toBeNull();
      expect(rows()[1].querySelector("b, [data-change]")).toBeNull();
    });

    it("colours the leading dot by the event's kind; any other kind or none is a faded dot", () => {
      render(
        section([
          event({ kind: "published" }),
          event({ kind: "price_down" }),
          event({ kind: "price_up" }),
          event({ kind: "repost" }),
          event({ kind: null }),
        ]),
      );
      const dots = [...document.querySelectorAll<HTMLElement>("[data-history-row] [data-kind]")];

      expect(dots.map((dot) => dot.dataset.kind)).toEqual(["published", "price_down", "price_up", "repost", ""]);
      expect(dots[0].className).toContain("bg-accent");
      expect(dots[0].className).toContain("ring-");
      expect(dots[1].className).toContain("bg-good");
      expect(dots[2].className).toContain("bg-high");
      for (const dot of dots.slice(3)) {
        expect(dot.className).toContain("bg-hint");
        expect(dot.className).toContain("opacity-50");
      }
    });

    it("makes a row with a link a button that opens the post with the light haptic; a row without one is no button", () => {
      render(section([event({ url: "https://t.me/stub_channel_a/3903" }), event()]));

      expect(rows()[0].tagName).toBe("BUTTON");
      expect(rows()[1].tagName).toBe("DIV");
      fireEvent.click(rows()[0]);

      expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
      expect(opened()).toEqual(["https://t.me/stub_channel_a/3903"]);
      expect(recentTracked()).toEqual([{ name: "original_opened", props: { listing_id: 100001, src: "price_history" } }]);
    });
  });

  describe("dates (LB-APP-025, dev014TashkentDates)", () => {
    it("flag off: the server leaves fixed-width empty cells; the client fills them in the device zone", () => {
      const html = renderToString(section([event({ at: LATE }), event({ at: LATE })]));
      const parsed = new DOMParser().parseFromString(html, "text/html");
      const cells = [...parsed.querySelectorAll("time")];

      expect(cells).toHaveLength(4);
      for (const cell of cells) {
        expect(cell.getAttribute("datetime")).toBe(LATE);
        expect(cell.textContent).toBe("");
        expect(cell.className).toContain("min-w-");
      }

      render(section([event({ at: LATE }), event({ at: LATE })]));
      const filled = [...rows()[0].querySelectorAll("time")].map((time) => time.textContent);
      expect(filled).toEqual([formatShortDate(LATE, "ru"), formatTime(LATE, "ru")]);
      // The literal values hold only in the default zone of the tests (UTC, unless the shell sets `TZ`).
      if (process.env.TZ === "UTC") {
        expect(filled).toEqual(["14 нояб", "20:30"]);
      }
    });

    it("flag on: Asia/Tashkent, already in the server render", () => {
      const html = renderToString(section([event({ at: LATE }), event({ at: LATE })], { tashkentDates: true }));
      const parsed = new DOMParser().parseFromString(html, "text/html");
      const tashkent = [formatShortDate(LATE, "ru", TASHKENT), formatTime(LATE, "ru", TASHKENT)];

      expect(tashkent).toEqual(["15 нояб", "01:30"]);
      expect([...parsed.querySelectorAll("time")].slice(0, 2).map((time) => time.textContent)).toEqual(tashkent);

      render(section([event({ at: LATE }), event({ at: LATE })], { tashkentDates: true }));
      expect([...rows()[0].querySelectorAll("time")].map((time) => time.textContent)).toEqual(tashkent);
    });

    it("the one-event sentence follows the flag too, and speaks uz months", () => {
      render(section([event({ at: LATE })], { tashkentDates: true, locale: "uz" }));

      expect(document.querySelector("time")?.textContent).toBe(formatShortDate(LATE, "uz", TASHKENT));
      expect(document.querySelector("time")?.textContent).toBe("15-noy");
    });
  });
});
