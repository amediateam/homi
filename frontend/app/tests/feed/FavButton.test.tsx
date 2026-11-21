import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Activity, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/actions/run";

type Input = { number: number; on: boolean };
type Saved = ActionResult<{ favorite: boolean }>;

const state = vi.hoisted(() => ({
  setFavorite: vi.fn<(input: Input, auth?: unknown, locale?: string) => Promise<ActionResult<{ favorite: boolean }>>>(),
}));
vi.mock("@/lib/actions/favorites", () => ({ setFavorite: state.setFavorite }));

import { FavButton, type FavButtonProps, resetPendingFavorites } from "@/features/feed/FavButton";
import { isFavorite, resetSessionMaps, setFav } from "@/lib/data/sessionMaps";
import { currentToast, dismissToast } from "@/lib/ui/toast";

import { withDevFlags } from "../helpers/flags";

const SAVED_ON: Saved = { ok: true, data: { favorite: true }, meta: { source: "stub" } };
const SAVED_OFF: Saved = { ok: true, data: { favorite: false }, meta: { source: "stub" } };
const UNAVAILABLE: Saved = { ok: false, error: "source_unavailable", status: 503, code: "source_unavailable", method: "PUT", path: "favorites/:number" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function withIntl(children: ReactNode, locale: Locale = "ru") {
  return (
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
      {children}
    </NextIntlClientProvider>
  );
}

function heart(props: Partial<FavButtonProps> = {}, locale: Locale = "ru") {
  return render(withIntl(<FavButton number={42} favorite={false} {...props} />, locale));
}

const button = () => document.querySelector<HTMLButtonElement>("button[data-fav]")!;
const pressed = () => button().getAttribute("aria-pressed");

let fake: FakeTelegram | null = null;
const haptics = () =>
  (fake?.calls ?? []).filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);

beforeEach(() => {
  state.setFavorite.mockReset();
  fake = fakeTelegram({ version: "8.0" });
});

afterEach(() => {
  cleanup();
  dismissToast("app");
  resetSessionMaps();
  resetPendingFavorites();
  fake?.uninstall();
  fake = null;
});

describe("FavButton (BR-APP-039)", () => {
  it("adding: fills at once with a medium haptic, sends on: true, and stays filled on success", async () => {
    const save = deferred<Saved>();
    state.setFavorite.mockReturnValueOnce(save.promise);
    heart();
    expect(pressed()).toBe("false");
    expect(button().getAttribute("aria-label")).toBe("В избранное");

    fireEvent.click(button());

    expect(pressed()).toBe("true");
    expect(button().getAttribute("aria-label")).toBe("Убрать из избранного");
    expect(isFavorite(42, false)).toBe(true);
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(medium)"]);
    expect(state.setFavorite.mock.calls).toEqual([[{ number: 42, on: true }, undefined, "ru"]]);

    await act(async () => save.resolve(SAVED_ON));

    expect(pressed()).toBe("true");
    expect(isFavorite(42, false)).toBe(true);
  });

  it("removing: empties at once with a light haptic, sends on: false, and stays empty on success", async () => {
    state.setFavorite.mockResolvedValueOnce(SAVED_OFF);
    heart({ favorite: true });
    expect(pressed()).toBe("true");

    await act(async () => {
      fireEvent.click(button());
    });

    expect(pressed()).toBe("false");
    expect(button().getAttribute("aria-label")).toBe("В избранное");
    expect(isFavorite(42, true)).toBe(false);
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
    expect(state.setFavorite.mock.calls).toEqual([[{ number: 42, on: false }, undefined, "ru"]]);
  });

  it("success keeps the requested state, whatever the answer's flag says", async () => {
    state.setFavorite.mockResolvedValueOnce(SAVED_OFF);
    heart();

    await act(async () => {
      fireEvent.click(button());
    });

    expect(pressed()).toBe("true");
  });

  it.each([
    ["adding", false, UNAVAILABLE],
    ["removing", true, { ...UNAVAILABLE, method: "DELETE" } as Saved],
    ["adding, offline", false, { ok: false, error: "offline", method: "ACTION", path: "setFavorite" } as Saved],
  ])("%s: a failure returns the heart to the state before the tap, with the error haptic and «Не получилось сохранить»", async (_name, before, failure) => {
    const save = deferred<Saved>();
    state.setFavorite.mockReturnValueOnce(save.promise);
    const onChange = vi.fn();
    heart({ favorite: before, onChange });

    fireEvent.click(button());
    expect(pressed()).toBe(String(!before));

    await act(async () => save.resolve(failure));

    expect(pressed()).toBe(String(before));
    expect(isFavorite(42, !before)).toBe(before);
    expect(onChange.mock.calls).toEqual([[!before], [before]]);
    expect(haptics()).toEqual([`HapticFeedback.impactOccurred(${before ? "light" : "medium"})`, "HapticFeedback.notificationOccurred(error)"]);
    expect(currentToast()?.message).toEqual({ key: "common.saveFailed" });
  });

  it("with dev016ErrorToastOnFailure off a failure returns the heart with the error haptic and no text", async () => {
    state.setFavorite.mockResolvedValueOnce(UNAVAILABLE);
    withDevFlags({ dev016ErrorToastOnFailure: false }, (flags) => heart({ flags }));

    await act(async () => {
      fireEvent.click(button());
    });

    expect(pressed()).toBe("false");
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(medium)", "HapticFeedback.notificationOccurred(error)"]);
    expect(currentToast()).toBeNull();
  });

  it("taps while the save runs are ignored: no request, no haptic, no change", async () => {
    const save = deferred<Saved>();
    state.setFavorite.mockReturnValueOnce(save.promise);
    heart();

    fireEvent.click(button());
    fireEvent.click(button());
    fireEvent.click(button());

    expect(pressed()).toBe("true");
    expect(state.setFavorite).toHaveBeenCalledTimes(1);
    expect(haptics()).toHaveLength(1);

    await act(async () => save.resolve(SAVED_ON));
    state.setFavorite.mockResolvedValueOnce(SAVED_OFF);
    await act(async () => {
      fireEvent.click(button());
    });

    expect(pressed()).toBe("false");
    expect(state.setFavorite.mock.calls.map((call) => call[0])).toEqual([
      { number: 42, on: true },
      { number: 42, on: false },
    ]);
  });

  it("the busy rule holds across every heart of the listing, not across listings", async () => {
    const save = deferred<Saved>();
    state.setFavorite.mockReturnValueOnce(save.promise).mockResolvedValueOnce(SAVED_ON);
    render(
      withIntl(
        <>
          <FavButton number={42} favorite={false} />
          <FavButton number={42} favorite={false} variant="plain" />
          <FavButton number={7} favorite={false} />
        </>,
      ),
    );
    const [card, title, other] = document.querySelectorAll<HTMLButtonElement>("button[data-fav]");

    fireEvent.click(card);
    expect(title.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(title);
    await act(async () => {
      fireEvent.click(other);
    });

    expect(state.setFavorite.mock.calls.map((call) => call[0])).toEqual([
      { number: 42, on: true },
      { number: 7, on: true },
    ]);
    expect(title.getAttribute("aria-pressed")).toBe("true");
    expect(other.getAttribute("aria-pressed")).toBe("true");

    await act(async () => save.resolve(SAVED_ON));
  });

  it("the launch's choice in favs wins over the card's flag", () => {
    setFav(42, true);
    setFav(7, false);
    render(
      withIntl(
        <>
          <FavButton number={42} favorite={false} />
          <FavButton number={7} favorite />
          <FavButton number={9} favorite />
        </>,
      ),
    );

    expect([...document.querySelectorAll("button[data-fav]")].map((entry) => entry.getAttribute("aria-pressed"))).toEqual(["true", "false", "true"]);
  });

  it("the click never reaches the card's link", async () => {
    state.setFavorite.mockResolvedValueOnce(SAVED_ON);
    const open = vi.fn();
    render(
      withIntl(
        <a href="#listing-42" onClick={open}>
          <FavButton number={42} favorite={false} />
        </a>,
      ),
    );

    let followed = true;
    await act(async () => {
      followed = fireEvent.click(button());
    });

    expect(followed).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(pressed()).toBe("true");
  });

  it.each([
    ["ru", "В избранное", "Убрать из избранного"],
    ["uz", "Saralanganlarga", "Saralangandan chiqarish"],
    ["en", "Save", "Remove from saved"],
  ] as const)("is a button labelled from the catalogue in %s", (locale, add, remove) => {
    heart({}, locale);
    expect(button().type).toBe("button");
    expect(button().getAttribute("aria-label")).toBe(add);
    cleanup();
    heart({ favorite: true }, locale);
    expect(button().getAttribute("aria-label")).toBe(remove);
  });

  it("the overlay sizes and the plain variant", () => {
    const sizes = () => {
      const svg = button().querySelector("svg")!;
      return [button().dataset.fav, svg.getAttribute("width")];
    };
    heart();
    expect(sizes()).toEqual(["overlay", "24"]);
    cleanup();
    heart({ size: "compact" });
    expect(sizes()).toEqual(["overlay", "20"]);
    cleanup();
    heart({ variant: "plain" });
    expect(sizes()).toEqual(["plain", "22"]);
  });
});

describe("FavButton: the heart and the burst (WP-39, BR-APP-117)", () => {
  const icon = () => button().querySelector<SVGElement>("svg")!;
  const burst = () => button().querySelector<HTMLElement>("[data-fav-burst]");
  const css = readFileSync(join(import.meta.dirname, "../../styles/motion.css"), "utf8");

  it("still before the first tap: no animation mark and no burst", () => {
    heart();
    expect(icon().hasAttribute("data-fav-heart")).toBe(false);
    expect(burst()).toBeNull();
  });

  it("a tap that adds plays `like` and bursts into eight sparks at index / 8 × 2π + 0.2 rad", async () => {
    state.setFavorite.mockResolvedValueOnce(SAVED_ON);
    heart();
    await act(async () => fireEvent.click(button()));

    expect(icon().getAttribute("data-fav-heart")).toBe("like");
    const sparks = [...burst()!.querySelectorAll<HTMLElement>("i")];
    expect(sparks).toHaveLength(8);
    expect(burst()!.getAttribute("aria-hidden")).toBe("true");
    expect(sparks.map((spark) => spark.style.getPropertyValue("--a"))).toEqual(
      Array.from({ length: 8 }, (_, index) => `${(index / 8) * Math.PI * 2 + 0.2}rad`),
    );
  });

  it("a tap that removes plays `dip` without a burst", async () => {
    state.setFavorite.mockResolvedValueOnce(SAVED_OFF);
    heart({ favorite: true });
    await act(async () => fireEvent.click(button()));

    expect(icon().getAttribute("data-fav-heart")).toBe("dip");
    expect(burst()).toBeNull();
  });

  it("every tap mounts the heart anew, so the animation replays; the burst too", async () => {
    /** One tap whose save then answers `saved`: the next tap is not held back by a save in flight. */
    const tapAndSave = async (saved: Saved) => {
      const save = deferred<Saved>();
      state.setFavorite.mockReturnValueOnce(save.promise);
      fireEvent.click(button());
      await act(async () => save.resolve(saved));
    };
    heart();
    const before = icon();

    await tapAndSave(SAVED_ON);
    const first = icon();
    const firstBurst = burst();
    expect(first).not.toBe(before);
    expect(firstBurst).not.toBeNull();

    await tapAndSave(SAVED_OFF);
    // One heart at a time: the heart and the burst are siblings and must not share a key.
    expect(button().querySelectorAll("svg")).toHaveLength(1);
    expect(icon()).not.toBe(first);
    expect(icon().getAttribute("data-fav-heart")).toBe("dip");
    expect(burst()).toBeNull();

    await tapAndSave(SAVED_ON);
    expect(icon().getAttribute("data-fav-heart")).toBe("like");
    expect(burst()).not.toBeNull();
    expect(burst()).not.toBe(firstBurst);
  });

  it("a failed save flips the heart back and takes the burst away, without replaying the heart (LB-APP-087)", async () => {
    const save = deferred<Saved>();
    state.setFavorite.mockReturnValueOnce(save.promise);
    heart();
    fireEvent.click(button());
    const tapped = icon();
    expect(burst()).not.toBeNull();

    await act(async () => save.resolve(UNAVAILABLE));

    expect(pressed()).toBe("false");
    expect(burst()).toBeNull();
    expect(icon()).toBe(tapped);
  });

  it("the burst follows the tap on this button: the other heart of the listing stays still", async () => {
    state.setFavorite.mockResolvedValueOnce(SAVED_ON);
    render(
      withIntl(
        <>
          <FavButton number={42} favorite={false} />
          <FavButton number={42} favorite={false} variant="plain" />
        </>,
      ),
    );
    const [first, second] = [...document.querySelectorAll<HTMLButtonElement>("button[data-fav]")];
    await act(async () => fireEvent.click(first!));

    expect(second!.getAttribute("aria-pressed")).toBe("true");
    expect(first!.querySelector("[data-fav-burst]")).not.toBeNull();
    expect(second!.querySelector("[data-fav-burst]")).toBeNull();
    expect(second!.querySelector("svg")!.hasAttribute("data-fav-heart")).toBe(false);
  });

  it("legacy's timings, and no burst under reduced motion", () => {
    expect(css).toMatch(/\[data-fav-heart="like"\] \{\s*animation: fav-like 0\.8s linear;/);
    expect(css).toMatch(/\[data-fav-heart="dip"\] \{\s*animation: fav-dip 0\.6s linear;/);
    expect(css).toMatch(/animation: fav-spark 0\.55s cubic-bezier\(0\.33, 1, 0\.68, 1\);/);
    expect(css).toMatch(/\[data-fav-burst\] i \{[\s\S]*?width: 6px;[\s\S]*?background: var\(--heart\);[\s\S]*?--r: 24px;/);
    expect(css).toMatch(/i:nth-child\(2n\) \{\s*background: var\(--accent\);\s*--r: 29px;/);
    expect(css).toMatch(/translate\(8px\) scale\(1\);[\s\S]*?60% \{\s*opacity: 0\.64;/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\[data-fav-burst\] \{\s*display: none;/);
  });
});

describe("FavButton: nothing replays without a tap (WP-39)", () => {
  const icon = () => button().querySelector<SVGElement>("svg")!;
  const burst = () => button().querySelector<HTMLElement>("[data-fav-burst]");
  const shown = (hidden: boolean) => withIntl(<Activity mode={hidden ? "hidden" : "visible"}>{<FavButton number={42} favorite={false} />}</Activity>);

  it("a route hidden and shown again holds a still heart: no mark and no burst to restart", async () => {
    state.setFavorite.mockResolvedValueOnce(SAVED_ON);
    const view = render(shown(false));
    await act(async () => fireEvent.click(button()));
    expect(icon().getAttribute("data-fav-heart")).toBe("like");
    expect(burst()).not.toBeNull();

    view.rerender(shown(true));
    view.rerender(shown(false));

    expect(pressed()).toBe("true");
    expect(icon().hasAttribute("data-fav-heart")).toBe(false);
    expect(burst()).toBeNull();
  });

  it("when the heart's animation ended the mark and the burst go", async () => {
    state.setFavorite.mockResolvedValueOnce(SAVED_ON);
    heart();
    await act(async () => fireEvent.click(button()));

    fireEvent.animationEnd(icon());

    expect(icon().hasAttribute("data-fav-heart")).toBe(false);
    expect(burst()).toBeNull();
    expect(pressed()).toBe("true");
  });
});
