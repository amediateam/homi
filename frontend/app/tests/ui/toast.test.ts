import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { currentToast, dismissToast, showToast, subscribeToasts, TOAST_ACTION_MS, TOAST_MS } from "@/lib/ui/toast";

/** The text of the plain toast of the app scope, or `null`. */
const text = () => {
  const message = currentToast()?.message;
  return typeof message === "string" ? message : null;
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  dismissToast("app");
  dismissToast("sheet");
  vi.useRealTimers();
});

describe("toast store (SCR-042)", () => {
  it("keeps a plain toast 3 999 ms and drops it at 4 000 ms", () => {
    showToast("Сохранено");
    vi.advanceTimersByTime(3999);
    expect(text()).toBe("Сохранено");
    vi.advanceTimersByTime(1);
    expect(currentToast()).toBeNull();
    expect(TOAST_MS).toBe(4000);
  });

  it("keeps a toast with an action 6 000 ms", () => {
    showToast({ text: "Скрыто", action: "Отменить", run: () => undefined });
    vi.advanceTimersByTime(5999);
    expect(currentToast()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(currentToast()).toBeNull();
    expect(TOAST_ACTION_MS).toBe(6000);
  });

  it("times a key toast like a plain one", () => {
    showToast({ key: "common.saveFailed" });
    vi.advanceTimersByTime(3999);
    expect(currentToast()?.message).toEqual({ key: "common.saveFailed" });
    vi.advanceTimersByTime(1);
    expect(currentToast()).toBeNull();
  });

  it("replaces the visible toast with a new id and restarts the timer", () => {
    showToast("Первый");
    const first = currentToast();
    vi.advanceTimersByTime(3000);
    showToast("Второй");
    expect(text()).toBe("Второй");
    expect(currentToast()?.id).not.toBe(first?.id);

    vi.advanceTimersByTime(3999);
    expect(text()).toBe("Второй");
    vi.advanceTimersByTime(1);
    expect(currentToast()).toBeNull();
  });

  it("gives a replacement of the same text a new id", () => {
    showToast("Снова");
    const first = currentToast()?.id;
    showToast("Снова");
    expect(currentToast()?.id).not.toBe(first);
  });

  it("keeps the scopes apart", () => {
    showToast("В приложении");
    vi.advanceTimersByTime(2000);
    showToast({ text: "В фильтрах", action: "Понятно", run: () => undefined }, "sheet");
    expect(text()).toBe("В приложении");
    expect(currentToast("sheet")?.message).toMatchObject({ text: "В фильтрах" });

    vi.advanceTimersByTime(2000);
    expect(currentToast()).toBeNull();
    expect(currentToast("sheet")).not.toBeNull();

    dismissToast("sheet");
    showToast("Ещё", "sheet");
    expect(currentToast()).toBeNull();
    dismissToast();
    expect(currentToast("sheet")).not.toBeNull();
  });

  it("dismissToast closes at once and stops the timer; with an id only that toast", () => {
    showToast("Первый");
    const first = currentToast()?.id;
    dismissToast();
    expect(currentToast()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    showToast("Второй");
    dismissToast("app", first);
    expect(text()).toBe("Второй");
    dismissToast("app", currentToast()?.id);
    expect(currentToast()).toBeNull();
  });

  it("a timer of a replaced toast does not close its successor", () => {
    showToast({ text: "Скрыто", action: "Отменить", run: () => undefined });
    vi.advanceTimersByTime(5000);
    showToast("Готово");
    vi.advanceTimersByTime(1000);
    expect(text()).toBe("Готово");
  });

  it("returns the same snapshot until something changes and notifies the subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToasts(listener);
    showToast("Раз");
    expect(currentToast()).toBe(currentToast());
    expect(listener).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(TOAST_MS);
    expect(listener).toHaveBeenCalledTimes(2);
    dismissToast();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    showToast("Два");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
