import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Activity, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Spot } from "@/features/listing/spot/spotGeometry";
import type { SpotMap, SpotMapOptions } from "@/features/listing/spot/useSpotMap";
import type { LocationResult } from "@/lib/telegram/location";

const state = vi.hoisted(() => ({
  back: vi.fn(),
  impact: vi.fn(),
  success: vi.fn(),
  openLink: vi.fn(),
  locationAvailable: vi.fn(() => true),
  getLocation: vi.fn<() => Promise<LocationResult>>(),
  /** Every render of the stub map: the spot and options it was given. */
  spotMap: { calls: [] as { spot: Spot | null; options: SpotMapOptions }[], value: null as unknown as SpotMap },
}));
vi.mock("@/lib/navigation/useBack", () => ({ useBack: () => ({ canGoBack: true, back: state.back }) }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/telegram", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/telegram")>();
  return {
    ...original,
    tg: {
      ...original.tg,
      haptic: { impact: state.impact, success: state.success, error: vi.fn() },
      openLink: state.openLink,
      location: { available: state.locationAvailable, get: state.getLocation },
    },
  };
});
/** The engines are `useSpotMap`'s, tested on their own (`useSpotMap.test.ts`): here the map only records its input. */
vi.mock("@/features/listing/spot/useSpotMap", () => ({
  useSpotMap: (_ref: unknown, spot: Spot | null, options: SpotMapOptions) => {
    state.spotMap.calls.push({ spot, options });
    return { ...state.spotMap.value, status: spot === null ? "idle" : state.spotMap.value.status };
  },
}));

import { listingKey, type ListingRecord } from "@/features/listing/listingData";
import { SpotMapFullscreen, type SpotMapFullscreenProps } from "@/features/listing/spot/SpotMapFullscreen";
import { SpotMapRoute } from "@/features/listing/spot/SpotMapRoute";
import { ListingLayerContext, type ListingView } from "@/features/listing/useListing";
import { failureOf } from "@/lib/api/errors";
import { resetResources, seedResource, useResource } from "@/lib/data/useResource";
import { resetReference } from "@/lib/reference/useReference";

import { detailsOf } from "../helpers/details";
import { feedReference } from "../helpers/reference";

const SPOT: Spot = { lat: 41.36512, lon: 69.28431, radius: 500 };
/** Tashkent's centre: 6.02 km from the spot. */
const USER = { lat: 41.3111, lon: 69.2797, accuracy: 25 };

/** Settles the pending `tg.location.get()` with `answer`. */
let answer: (result: LocationResult) => void = () => {};

beforeEach(() => {
  state.back.mockReset();
  state.impact.mockReset();
  state.success.mockReset();
  state.openLink.mockReset();
  state.locationAvailable.mockReset().mockReturnValue(true);
  state.getLocation.mockReset().mockImplementation(
    () =>
      new Promise<LocationResult>((resolve) => {
        answer = resolve;
      }),
  );
  state.spotMap.calls = [];
  state.spotMap.value = { status: "ready", basemap: { kind: "raster" }, showUser: vi.fn(), fitSpotAndUser: vi.fn() };
  feedReference({});
  window.history.replaceState(null, "", "/ru/listing/100001/location");
});

afterEach(() => {
  cleanup();
  resetResources();
  resetReference();
});

function intl(children: ReactNode, locale: Locale = "ru") {
  return (
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
      {children}
    </NextIntlClientProvider>
  );
}

function fullscreen(props: Partial<SpotMapFullscreenProps> = {}, locale: Locale = "ru") {
  const onClose = vi.fn();
  const view = render(intl(<SpotMapFullscreen spot={SPOT} place="Юнусабад · Мегапланет" onClose={onClose} {...props} />, locale));
  return { ...view, onClose };
}

const dialog = () => document.querySelector<HTMLElement>("[data-spot-fullscreen]");
const line = () => document.querySelector("[data-spot-line]")?.textContent ?? null;
const locateButton = () => document.querySelector<HTMLButtonElement>("button[data-map-locate]");
const button = (selector: string) => document.querySelector<HTMLButtonElement>(selector)!;
const lastMap = () => state.spotMap.calls.at(-1)!;

/** Taps «Где я» and answers the location request with `result`. */
async function locate(result: LocationResult) {
  fireEvent.click(locateButton()!);
  await act(async () => answer(result));
}

describe("SpotMapFullscreen (03 SCR-021), idle", () => {
  it("draws an interactive map of the spot with the close and locate buttons and the bottom card", () => {
    fullscreen();

    expect(dialog()?.getAttribute("role")).toBe("dialog");
    expect(lastMap()).toEqual({ spot: SPOT, options: { interactive: true, tiles: null, scheme: "light", locale: "ru", lite: false } });
    expect(button("[data-spot-close]").getAttribute("aria-label")).toBe("Закрыть");
    expect(locateButton()?.getAttribute("aria-label")).toBe("Где я");
    expect(document.querySelector("[data-spot-place]")?.textContent).toBe("Юнусабад · Мегапланет");
    expect(document.querySelector("[data-spot-place]")?.className).toContain("font-bold");
    expect(line()).toBe("Место примерное: по кварталу, ориентиру или метро из объявления");
    expect(button("[data-spot-yandex]").textContent).toBe("Яндекс Карты");
    expect(button("[data-spot-google]").textContent).toBe("Google Карты");
    expect(document.querySelector("[data-map-attribution]")?.textContent).toBe("© OpenStreetMap");
  });

  it("has no locate button when the adapter cannot locate", () => {
    state.locationAvailable.mockReturnValue(false);
    fullscreen();

    expect(locateButton()).toBeNull();
  });

  it("leaves out the place line when the place is unknown", () => {
    fullscreen({ place: null });

    expect(document.querySelector("[data-spot-place]")).toBeNull();
    expect(line()).toContain("Место примерное");
  });

  it("shows no attribution before the map is ready, and the vector one on the vector basemap", () => {
    state.spotMap.value = { ...state.spotMap.value, status: "loading" };
    const { unmount } = fullscreen();
    expect(document.querySelector("[data-map-attribution]")).toBeNull();
    unmount();

    state.spotMap.value = { ...state.spotMap.value, status: "ready", basemap: { kind: "pmtiles", url: "https://cdn.homi.loc/t.pmtiles" } };
    fullscreen();
    expect(document.querySelector("[data-map-attribution]")?.textContent).toBe("© OpenStreetMap · Protomaps");
  });

  it("speaks the locale", () => {
    fullscreen({}, "en");

    expect(button("[data-spot-close]").getAttribute("aria-label")).toBe("Close");
    expect(line()).toBe("Approximate location: from the block, landmark or metro in the listing");
    expect(button("[data-spot-yandex]").textContent).toBe("Yandex Maps");
  });
});

describe("SpotMapFullscreen locate (KV-FE-031, TMA-035)", () => {
  it("spins and is disabled while the position is asked for", () => {
    fullscreen();
    fireEvent.click(locateButton()!);

    expect(state.impact).toHaveBeenCalledExactlyOnceWith();
    expect(locateButton()?.disabled).toBe(true);
    expect(locateButton()?.getAttribute("aria-busy")).toBe("true");
    expect(locateButton()?.querySelector('[role="presentation"]')).not.toBeNull();
    expect(line()).toContain("Место примерное");
  });

  it("a position plays the success haptic, draws the dot, fits spot and user and reads the distance", async () => {
    fullscreen();

    await locate(USER);

    expect(state.success).toHaveBeenCalledOnce();
    expect(state.spotMap.value.showUser).toHaveBeenCalledExactlyOnceWith({ lat: USER.lat, lon: USER.lon });
    expect(state.spotMap.value.fitSpotAndUser).toHaveBeenCalledOnce();
    expect(line()).toBe("≈ 6,0 км от вас — место примерное");
    expect(locateButton()?.disabled).toBe(false);
  });

  it("reads the distance with one decimal in the locale", async () => {
    fullscreen({}, "en");

    await locate({ lat: 41.355, lon: 69.28431, accuracy: null });

    expect(line()).toBe("≈ 1.1 km from you — approximate location");
  });

  it("denied reads the permission line", async () => {
    fullscreen();

    await locate("denied");

    expect(line()).toBe("Нет доступа к геопозиции. Разрешить можно в настройках Telegram.");
    expect(state.spotMap.value.showUser).not.toHaveBeenCalled();
    expect(state.success).not.toHaveBeenCalled();
  });

  it("a failure, the 12 s cap included, reads the failure line; a later position replaces it", async () => {
    fullscreen();

    await locate("fail");
    expect(line()).toBe("Не получилось определить, где вы.");

    await locate(USER);
    expect(line()).toBe("≈ 6,0 км от вас — место примерное");

    await locate("denied");
    expect(line()).toBe("Нет доступа к геопозиции. Разрешить можно в настройках Telegram.");
  });

  it("an adapter that rejects is a failure", async () => {
    state.getLocation.mockReset().mockRejectedValue(new Error("no"));
    fullscreen();

    fireEvent.click(locateButton()!);
    await act(async () => {});

    expect(line()).toBe("Не получилось определить, где вы.");
  });
});

describe("SpotMapFullscreen hand-offs (SCR-021, TMA-028)", () => {
  it.each([
    [200, 17],
    [500, 16],
    [1200, 15],
    [3000, 13],
  ])("«Яндекс Карты» for a %i m radius opens zoom %i with a light haptic", (radius, zoom) => {
    fullscreen({ spot: { ...SPOT, radius } });

    fireEvent.click(button("[data-spot-yandex]"));

    expect(state.impact).toHaveBeenCalledExactlyOnceWith("light");
    expect(state.openLink).toHaveBeenCalledExactlyOnceWith(`https://yandex.uz/maps/?ll=69.284310,41.365120&z=${zoom}&pt=69.284310,41.365120,pm2rdm`);
  });

  it("«Google Карты» searches the coordinates with a light haptic", () => {
    fullscreen();

    fireEvent.click(button("[data-spot-google]"));

    expect(state.impact).toHaveBeenCalledExactlyOnceWith("light");
    expect(state.openLink).toHaveBeenCalledExactlyOnceWith("https://www.google.com/maps/search/?api=1&query=41.365120,69.284310");
  });

  it("never sends the position: the links carry the spot only", async () => {
    fullscreen();
    await locate(USER);

    fireEvent.click(button("[data-spot-yandex]"));
    fireEvent.click(button("[data-spot-google]"));

    for (const [url] of state.openLink.mock.calls as [string][]) {
      expect(url).not.toContain(String(USER.lat));
      expect(url).not.toContain(String(USER.lon));
    }
  });
});

describe("SpotMapFullscreen close", () => {
  it("× and Escape close", () => {
    const { onClose } = fullscreen();

    fireEvent.click(button("[data-spot-close]"));
    fireEvent.keyDown(dialog()!, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("takes the focus on open and gives it back on close", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { unmount } = fullscreen();

    expect(document.activeElement).toBe(dialog());
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

/**
 * A reader of the listing's resource that fails, as the listing screen's read does when the API cannot answer; it
 * reads even over fresh data (`staleMs: 0`), as a refetch would.
 */
function FailingRead({ number }: { number: number }) {
  useResource<ListingRecord>(listingKey(number), () => Promise.resolve(failureOf({ method: "GET", path: "listings/:number" }, { status: 500 })), {
    staleMs: 0,
  });
  return null;
}

/** The route in its layer; `view` is the state the listing screen reported to the layer (`null`: none yet). */
function route(
  number: number | null = 100001,
  { mode = "visible", extra = null, view = null }: { mode?: "visible" | "hidden"; extra?: ReactNode; view?: ListingView["state"] | null } = {},
) {
  return intl(
    <ListingLayerContext value={{ number, scrollToTop: () => {}, reportView: () => {}, view }}>
      {extra}
      <Activity mode={mode}>
        <SpotMapRoute />
      </Activity>
    </ListingLayerContext>,
  );
}

describe("SpotMapRoute (/listing/{number}/location)", () => {
  it("shows the fullscreen map of the listing's resource in an overlay at z-index 100, never reading it", () => {
    seedResource(listingKey(100001), { listing: detailsOf({ geo_radius_m: 250 }) });
    render(route());

    const overlay = document.querySelector<HTMLElement>('[data-slot="route-overlay"][data-route="listing/location"]');
    // Raised over the listing's own layer, and not scrolling: `cn` drops the defaults it replaces.
    expect(overlay?.className).toContain("z-(--z-viewer)");
    expect(overlay?.className).not.toContain("z-(--z-overlay)");
    expect(overlay?.className).not.toContain("overflow-y-auto");
    expect(overlay?.contains(dialog())).toBe(true);
    expect(lastMap().spot).toEqual({ lat: 41.36512, lon: 69.28431, radius: 250 });
    expect(document.querySelector("[data-spot-place]")?.textContent).toBe("Юнусабад · Мегапланет");
    expect(state.back).not.toHaveBeenCalled();
  });

  it("× calls back() once per address", () => {
    seedResource(listingKey(100001), { listing: detailsOf() });
    render(route());

    fireEvent.click(button("[data-spot-close]"));
    fireEvent.click(button("[data-spot-close]"));

    expect(state.back).toHaveBeenCalledOnce();
  });

  it("waits with the frame, × included, until the listing's answer is there (a direct load)", () => {
    render(route());

    expect(dialog()).not.toBeNull();
    expect(lastMap().spot).toBeNull();
    expect(document.querySelector("[data-spot-card]")).toBeNull();
    expect(button("[data-spot-close]")).not.toBeNull();
    expect(state.back).not.toHaveBeenCalled();

    act(() => seedResource(listingKey(100001), { listing: detailsOf() }));
    expect(lastMap().spot).toEqual({ lat: 41.36512, lon: 69.28431, radius: 500 });
    expect(document.querySelector("[data-spot-card]")).not.toBeNull();
  });

  it("goes back for a listing without coordinates", () => {
    seedResource(listingKey(100001), { listing: detailsOf({ location: null }) });
    render(route());

    expect(state.back).toHaveBeenCalledOnce();
    expect(document.querySelector("[data-spot-card]")).toBeNull();
  });

  it("goes back when the listing's read failed", async () => {
    render(route(100001, { extra: <FailingRead number={100001} /> }));
    await act(async () => {});

    expect(state.back).toHaveBeenCalledOnce();
  });

  it("stays when a refetch fails over details already shown", async () => {
    seedResource(listingKey(100001), { listing: detailsOf() });
    render(route(100001, { extra: <FailingRead number={100001} /> }));
    await act(async () => {});

    expect(document.querySelector("[data-spot-card]")).not.toBeNull();
    expect(state.back).not.toHaveBeenCalled();
    expect(lastMap().spot).not.toBeNull();
  });

  it.each(["not_found", "offline", "server"] as const)(
    "goes back when the listing screen shows %s with nothing in the resource (the server's read in cookie mode)",
    (view) => {
      render(route(100001, { view }));

      expect(state.back).toHaveBeenCalledOnce();
      expect(lastMap().spot).toBeNull();
    },
  );

  it("goes back once the screen's failure arrives after the frame waited (a direct load)", () => {
    const view = render(route(100001, { view: "skeleton" }));
    view.rerender(route(100001, { view: "preview" }));
    expect(state.back).not.toHaveBeenCalled();

    view.rerender(route(100001, { view: "server" }));
    view.rerender(route(100001, { view: "server" }));

    expect(state.back).toHaveBeenCalledOnce();
  });

  it("stays over details already shown whatever failure the screen reports", async () => {
    seedResource(listingKey(100001), { listing: detailsOf() });
    render(route(100001, { view: "server", extra: <FailingRead number={100001} /> }));
    await act(async () => {});

    expect(document.querySelector("[data-spot-card]")).not.toBeNull();
    expect(state.back).not.toHaveBeenCalled();
    expect(lastMap().spot).not.toBeNull();
  });

  it("goes back for an address without a valid number", () => {
    render(route(null));

    expect(state.back).toHaveBeenCalledOnce();
  });

  it("forgets the position when it is closed: hidden and shown again, it opens without it", async () => {
    seedResource(listingKey(100001), { listing: detailsOf() });
    const view = render(route());
    await locate(USER);
    expect(line()).toContain("6,0 км от вас");

    view.rerender(route(100001, { mode: "hidden" }));
    view.rerender(route(100001, { mode: "visible" }));

    expect(line()).toBe("Место примерное: по кварталу, ориентиру или метро из объявления");
  });
});
