import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const map = vi.hoisted(() => ({
  status: "ready" as "loading" | "ready" | "failed",
  moving: false,
  center: { lat: 41.3111, lon: 69.2797 },
  read: vi.fn(() => ({ lat: 41.311081234, lon: 69.240562678 }) as { lat: number; lon: number } | null),
  flyTo: vi.fn(),
  showUser: vi.fn(),
}));
vi.mock("@/features/owner/place/usePickerMap", () => ({
  usePickerMap: () => ({ ...map, basemap: { kind: "none" } }),
}));
vi.mock("@/features/owner/place/usePlaceLabel", () => ({ usePlaceLabel: () => ({ kind: "place", text: "Юнусабад · Ташкент" }) }));
vi.mock("@/features/map/useLocate", () => ({ useLocate: () => ({ available: true, busy: false, me: null, locate: vi.fn() }) }));

import { PlacePicker } from "@/features/owner/place/PlacePicker";

import { withIntl } from "../settings/harness";

let fake: FakeTelegram | null = null;
const START = { lat: 41.3111, lon: 69.2797, zoom: 13 };
const button = (action: string) => document.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;

beforeEach(() => {
  map.status = "ready";
  map.read.mockReturnValue({ lat: 41.311081234, lon: 69.240562678 });
  fake = fakeTelegram({ version: "8.0" });
});

afterEach(() => {
  cleanup();
  fake?.uninstall();
  fake = null;
});

describe("PlacePicker (WP-81, SCR-051)", () => {
  it("shows the pin, the label, «Найти меня», the panel; «Готово» saves the centre at 5 decimals", () => {
    const onDone = vi.fn();
    render(withIntl(<PlacePicker start={START} first={false} onDone={onDone} onManual={vi.fn()} onCancel={vi.fn()} onSwipe={vi.fn()} />));

    expect(document.querySelector("[data-pin]")).toBeTruthy();
    expect(document.querySelector("[data-picker-label]")?.textContent).toBe("Юнусабад · Ташкент");
    expect(button("locate")).toBeTruthy();
    fireEvent.click(button("pick-done"));
    expect(onDone).toHaveBeenCalledWith({ lat: 41.31108, lon: 69.24056 }, false);
  });

  it("«Готово» is disabled until the map is there; both engines failing shows own.pickFailed", () => {
    map.status = "loading";
    const { unmount } = render(withIntl(<PlacePicker start={START} first={false} onDone={vi.fn()} onManual={vi.fn()} onCancel={vi.fn()} onSwipe={vi.fn()} />));
    expect(button("pick-done").disabled).toBe(true);
    unmount();

    map.status = "failed";
    render(withIntl(<PlacePicker start={START} first={false} onDone={vi.fn()} onManual={vi.fn()} onCancel={vi.fn()} onSwipe={vi.fn()} />));
    expect(document.querySelector("[data-picker-failed]")?.textContent).toContain("Не получилось определить");
    expect(button("pick-done").disabled).toBe(true);
  });

  it("a centre outside Uzbekistan refuses with own.pickOutside and the warning haptic", () => {
    map.read.mockReturnValue({ lat: 55.75, lon: 37.62 });
    const onDone = vi.fn();
    render(withIntl(<PlacePicker start={START} first={false} onDone={onDone} onManual={vi.fn()} onCancel={vi.fn()} onSwipe={vi.fn()} />));
    act(() => fireEvent.click(button("pick-done")));

    expect(onDone).not.toHaveBeenCalled();
    expect(document.querySelector("[data-picker-note]")?.getAttribute("data-picker-note")).toBe("pickOutside");
    expect(fake!.calls.some((call) => call.member === "HapticFeedback.notificationOccurred" && call.args[0] === "warning")).toBe(true);
  });

  it("step «where» offers «Указать вручную»; from the questionnaire «Отмена»", () => {
    const onManual = vi.fn();
    const { unmount } = render(withIntl(<PlacePicker start={START} first onDone={vi.fn()} onManual={onManual} onCancel={vi.fn()} onSwipe={vi.fn()} />));
    fireEvent.click(button("pick-manual"));
    expect(onManual).toHaveBeenCalledTimes(1);
    unmount();

    const onCancel = vi.fn();
    render(withIntl(<PlacePicker start={START} first={false} onDone={vi.fn()} onManual={vi.fn()} onCancel={onCancel} onSwipe={vi.fn()} />));
    fireEvent.click(button("pick-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("is portalled into the body, marked for the edge-only swipe", () => {
    render(withIntl(<PlacePicker start={START} first={false} onDone={vi.fn()} onManual={vi.fn()} onCancel={vi.fn()} onSwipe={vi.fn()} />));

    const picker = document.querySelector("[data-owner-picker]");
    expect(picker?.parentElement).toBe(document.body);
    expect(picker?.hasAttribute("data-edge-swipe")).toBe(true);
  });
});
