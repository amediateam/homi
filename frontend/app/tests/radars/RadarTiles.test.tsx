import { getMessages } from "@homi/i18n";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: "ready", renewed: false, me: null }) }));
/** The Server Actions are not reached here: the switch's handler is the test's. */
vi.mock("@/lib/actions/radars", () => ({ patchRadar: vi.fn(), deleteRadar: vi.fn() }));

import type { ListingPreview } from "@/features/feed/types";
import { normalizeRadar, type Radar } from "@/features/radars/normalize";
import { collageCovers, RadarTiles } from "@/features/radars/RadarTiles";
import { radarFinds, type RadarFinds } from "@/features/radars/useRadarPreviews";
import { resetReference } from "@/lib/reference/useReference";

import { previewOf } from "../helpers/listing";
import { feedReference } from "../helpers/reference";

const A = "01JD0000000000000000000001";
const B = "01JD0000000000000000000002";

/** A find with one photo: its cover, or only a preview photo when `cover` is `null`. */
const find = (number: number, cover: string | null = `https://cdn.homi.loc/stub/${number}/1.jpg?e=0&s=stub`): ListingPreview =>
  previewOf({ number, photos: { preview: cover === null ? [] : [cover], count: cover === null ? 0 : 1, cover } });

function radarOf(id: string, overrides: Record<string, unknown> = {}, items: ListingPreview[] | null = []): Radar {
  return normalizeRadar({
    id,
    active: true,
    mode: "instant",
    hidden: 0,
    created_at: "2026-11-10T06:00:00+00:00",
    filters: { city: "tashkent", deal: "rent_long", rooms_min: 2, rooms_max: 2, price_max: 600 },
    ...(items === null ? {} : { preview: { items, count: items.length, flow: { week: 21, days: 7 } } }),
    ...overrides,
  })!;
}

function withIntl(children: ReactNode) {
  return (
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      {children}
    </NextIntlClientProvider>
  );
}

const onOpen = vi.fn();
const onToggle = vi.fn();

function renderTiles(radars: Radar[]) {
  const finds: Record<string, RadarFinds> = Object.fromEntries(radars.map((radar) => [radar.id, radarFinds(radar)]));
  return render(withIntl(<RadarTiles radars={radars} finds={finds} onOpen={onOpen} onToggle={onToggle} />));
}

const tile = (id: string) => document.querySelector<HTMLElement>(`[data-radar-tile="${id}"]`)!;
const collage = (id: string) => tile(id).querySelector<HTMLElement>("[data-radar-collage]")!;

let fake: FakeTelegram | null = null;

beforeEach(() => {
  fake = fakeTelegram({ version: "8.0" });
  onOpen.mockReset();
  onToggle.mockReset();
  feedReference({});
});

afterEach(() => {
  cleanup();
  resetReference();
  fake?.uninstall();
  fake = null;
});

describe("RadarTiles (SCR-026)", () => {
  it("each tile: collage, title, area summary and status line", () => {
    renderTiles([radarOf(A, {}, [find(100001)])]);

    expect(tile(A).querySelector("b")?.textContent).toBe("2-комн. · до $600");
    expect(tile(A).textContent).toContain("Ташкент целиком");
    expect(tile(A).querySelector("[data-radar-status]")?.textContent).toBe("≈3 в день · сразу");
  });

  it.each([
    [0, 0],
    [1, 1],
    [4, 4],
    [5, 4],
  ])("a collage of %i finds shows %i covers, the radar icon without any", (finds, covers) => {
    const items = Array.from({ length: finds }, (_, index) => find(100001 + index));
    renderTiles([radarOf(A, {}, items)]);

    expect(collage(A).dataset.radarCollage).toBe(String(covers));
    expect(collage(A).querySelectorAll("[data-radar-cover]")).toHaveLength(covers);
    expect(collage(A).querySelectorAll("img")).toHaveLength(covers);
    expect(collage(A).querySelector("svg.lucide-radar-icon") !== null).toBe(covers === 0);
  });

  it("covers: the cover, else the first photo; a find without any photo gives none", () => {
    const withPreviewOnly = previewOf({ number: 3, photos: { preview: ["https://cdn.homi.loc/p/3.jpg"], count: 1, cover: null } });
    expect(collageCovers([find(1, "https://cdn.homi.loc/c/1.jpg"), find(2, null), withPreviewOnly])).toEqual([
      "https://cdn.homi.loc/c/1.jpg",
      "https://cdn.homi.loc/p/3.jpg",
    ]);
    expect(collageCovers(null)).toEqual([]);
  });

  it("a paused tile: only the collage is greyscale, the title is hint-coloured, the status reads «На паузе»", () => {
    renderTiles([radarOf(A, { active: false }, [find(100001)]), radarOf(B, {}, [find(100002)])]);

    expect(collage(A).className).toContain("grayscale");
    expect(collage(B).className).not.toContain("grayscale");
    expect(tile(A).querySelector("b")?.className).toContain("text-hint");
    expect(tile(B).querySelector("b")?.className).not.toContain("text-hint");
    expect(tile(A).querySelector("[data-radar-status]")?.textContent).toBe("На паузе");
    expect(tile(A).className).not.toContain("grayscale");
  });

  it("the tile and its switch are separate controls: a native button and, beside it, a named switch", () => {
    renderTiles([radarOf(A)]);

    const open = tile(A).querySelector<HTMLButtonElement>("[data-radar-open]")!;
    const toggle = screen.getByRole("switch", { name: "Присылать в чат" });
    // A real `<button type="button">`: the browser activates it with Enter and Space (jsdom does not emulate that).
    expect(open.tagName).toBe("BUTTON");
    expect(open.type).toBe("button");
    expect(open.contains(toggle)).toBe(false);
    expect(toggle.closest("[data-radar-open]")).toBeNull();
    // The switch is described by the tile's title, so each switch says which radar it is.
    expect(document.getElementById(toggle.getAttribute("aria-describedby")!)?.textContent).toBe("2-комн. · до $600");
    // Two focus stops in document order: the tile, then the switch.
    const focusable = [...tile(A).querySelectorAll<HTMLElement>("button")];
    expect(focusable).toEqual([open, toggle]);
    expect(focusable.every((element) => element.tabIndex === 0)).toBe(true);
  });

  it("activating the tile opens it; the switch toggles without opening", () => {
    const radar = radarOf(A);
    renderTiles([radar]);
    const open = tile(A).querySelector<HTMLButtonElement>("[data-radar-open]")!;

    open.focus();
    fireEvent.keyDown(open, { key: "Enter" });
    fireEvent.click(open);
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(radar);

    const toggle = screen.getByRole("switch");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    toggle.focus();
    fireEvent.keyDown(toggle, { key: " " });
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledExactlyOnceWith(radar, false);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("a paused tile's switch turns it on", () => {
    const radar = radarOf(A, { active: false });
    renderTiles([radar]);

    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledExactlyOnceWith(radar, true);
  });
});
