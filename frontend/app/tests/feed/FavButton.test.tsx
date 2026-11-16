import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
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
import { currentToast } from "@/lib/ui/toast";

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
  ])("%s: a failure returns the heart to the state before the tap, with no text and no error haptic", async (_name, before, failure) => {
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
    expect(haptics()).toEqual([`HapticFeedback.impactOccurred(${before ? "light" : "medium"})`]);
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
