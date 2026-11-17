import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { SWIPE_BACK_EXCLUDED } from "@homi/ui";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: state.push }) }));

import type { ListingDetails } from "@/features/listing/listingData";
import { placeLine } from "@/features/listing/listingData";
import { LocationSection } from "@/features/listing/sections/LocationSection";

import { detailsOf } from "../helpers/details";

type Location = Pick<ListingDetails, "location" | "center_km" | "metro" | "nearby" | "geo_radius_m">;

function location(overrides: Partial<Location> = {}, place: string | null = placeLine(detailsOf()), locale: Locale = "ru") {
  const details = { ...detailsOf(), ...overrides };
  return render(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
      <LocationSection number={100001} details={details} place={place} />
    </NextIntlClientProvider>,
  );
}

const root = () => document.querySelector<HTMLElement>('[data-section="location"]');
const slot = () => document.querySelector<HTMLButtonElement>("button[data-spot-map]");
const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;

let fake: FakeTelegram;
const haptics = () =>
  fake.calls.filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);

beforeEach(() => {
  state.push.mockReset();
  fake = fakeTelegram();
});

afterEach(() => {
  cleanup();
  fake.uninstall();
});

describe("LocationSection (03 SCR-018, block 9)", () => {
  it("with coordinates: the heading, the map slot, the approximate hint, the place, the centre and «Рядом»", () => {
    location();

    expect(root()?.querySelector("h2")?.textContent).toBe("Расположение");
    expect(slot()).not.toBeNull();
    expect(root()?.textContent).toContain("Место примерное: по кварталу, ориентиру или метро из объявления");
    expect(text("[data-location-place]")).toBe("Юнусабад · Мегапланет");
    expect(text("[data-location-center]")).toBe("4,2 км до центра");
    expect(root()?.querySelector('[data-section="nearby"]')).not.toBeNull();
  });

  it("without coordinates: neither the map slot nor the hint", () => {
    location({ location: null });

    expect(slot()).toBeNull();
    expect(root()?.textContent).not.toContain("Место примерное");
    expect(text("[data-location-place]")).toBe("Юнусабад · Мегапланет");
  });

  it("keeps its heading when only «Рядом» is empty", () => {
    location({ location: null, metro: null, nearby: [] });

    expect(root()?.querySelector("h2")?.textContent).toBe("Расположение");
    expect(root()?.querySelector('[data-section="nearby"]')).toBeNull();
    expect(text("[data-location-center]")).toBe("4,2 км до центра");
  });

  it("shows «Рядом» alone when nothing else is known", () => {
    location({ location: null, center_km: null }, null);

    expect(root()?.querySelector("h2")?.textContent).toBe("Расположение");
    expect(document.querySelector("[data-location-place], [data-location-center]")).toBeNull();
    expect(root()?.querySelectorAll("[data-nearby]")).toHaveLength(3);
  });

  it("renders nothing when every part is absent", () => {
    const { container } = location({ location: null, center_km: null, metro: { name: "Минор", km: 2.4 }, nearby: [] }, null);

    expect(container.innerHTML).toBe("");
  });

  it("speaks the locale", () => {
    location({}, "Yunusobod · Megaplanet", "en");

    expect(root()?.querySelector("h2")?.textContent).toBe("Location");
    expect(text("[data-location-center]")).toBe("4.2 km to the centre");
    expect(slot()?.getAttribute("aria-label")).toBe("Open map");
  });
});

describe("SpotMapSlot", () => {
  it("is a 2:1 button named «Открыть карту» that a swipe back never starts on", () => {
    location();

    expect(slot()?.getAttribute("aria-label")).toBe("Открыть карту");
    expect(slot()?.className).toContain("aspect-[2/1]");
    expect(slot()?.hasAttribute("data-no-swipe")).toBe(true);
    expect(slot()?.matches(SWIPE_BACK_EXCLUDED)).toBe(true);
  });

  it("opens the full-screen map of the listing with the light haptic", () => {
    location();
    fireEvent.click(slot()!);

    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
    expect(state.push).toHaveBeenCalledExactlyOnceWith("/listing/100001/location");
  });
});
