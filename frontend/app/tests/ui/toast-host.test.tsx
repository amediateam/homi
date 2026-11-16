import { getMessages } from "@homi/i18n";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastHost } from "@/features/shell/ToastHost";
import { clearRecentErrors, recentErrors } from "@/lib/errors/report";
import { currentToast, dismissToast, showToast, TOAST_MS, type ToastScope } from "@/lib/ui/toast";

function host(scope?: ToastScope, locale: "ru" | "uz" = "ru") {
  return render(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
      <ToastHost scope={scope} />
    </NextIntlClientProvider>,
  );
}

const region = (scope: ToastScope = "app") => document.querySelector(`[data-toast-host="${scope}"]`);
const toastElement = (scope: ToastScope = "app") => region(scope)?.querySelector("[data-toast]") ?? null;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  dismissToast("app");
  dismissToast("sheet");
  clearRecentErrors();
  vi.useRealTimers();
});

describe("ToastHost (SCR-042)", () => {
  it("keeps an empty polite live region at the toast layer", () => {
    host();
    const live = screen.getByRole("status");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.className).toMatch(/z-\(--z-toast\)/);
    expect(live.className).toMatch(/bottom-\[calc\(var\(--tabbar-h\)\+var\(--bottom-inset\)\+78px\)\]/);
    expect(live.textContent).toBe("");
  });

  it("renders a plain text, clamped to three lines, and rises in", () => {
    host();
    act(() => showToast("Ссылка скопирована"));
    const toast = toastElement();
    expect(toast?.textContent).toBe("Ссылка скопирована");
    expect(toast?.className).toMatch(/animate-rise-in/);
    expect(toast?.querySelector("span")?.className).toMatch(/line-clamp-3/);
  });

  it("translates a key toast with its values in the current locale", () => {
    const { unmount } = host();
    act(() => showToast({ key: "common.saveFailed" }));
    expect(toastElement()?.textContent).toBe("Не получилось сохранить");
    act(() => showToast({ key: "subs.deleteConfirm", values: { name: "Чиланзар" } }));
    expect(toastElement()?.textContent).toBe("Удалить радар «Чиланзар»?");
    unmount();

    host("app", "uz");
    act(() => showToast({ key: "common.saveFailed" }));
    expect(toastElement()?.textContent).toBe("Saqlab boʻlmadi");
  });

  it("closes a plain toast on tap", () => {
    host();
    act(() => showToast("Готово"));
    fireEvent.click(toastElement() as Element);
    expect(toastElement()).toBeNull();
    expect(currentToast()).toBeNull();
  });

  it("closes by itself after the store's time", () => {
    host();
    act(() => showToast("Готово"));
    act(() => vi.advanceTimersByTime(TOAST_MS));
    expect(toastElement()).toBeNull();
  });

  it("runs the action once and closes; a tap on its text does not close it", () => {
    const run = vi.fn();
    host();
    act(() => showToast({ text: "Объявление скрыто", action: "Отменить", run }));
    fireEvent.click(screen.getByText("Объявление скрыто"));
    expect(toastElement()).not.toBeNull();

    const button = screen.getByRole("button", { name: "Отменить" });
    expect(button.className).not.toMatch(/line-clamp/);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(run).toHaveBeenCalledTimes(1);
    expect(toastElement()).toBeNull();
  });

  it("keeps a toast that the action itself showed", () => {
    host();
    act(() => showToast({ text: "Скрыто", action: "Отменить", run: () => showToast("Снова показывается") }));
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
    expect(toastElement()?.textContent).toBe("Снова показывается");
  });

  it("closes and reports when the action throws", () => {
    const failure = new Error("undo failed");
    host();
    act(() =>
      showToast({
        text: "Скрыто",
        action: "Отменить",
        run: () => {
          throw failure;
        },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
    expect(toastElement()).toBeNull();
    expect(recentErrors()).toEqual([{ error: failure, context: { kind: "error", source: "toast" } }]);
  });

  it("closes at once and reports the rejection when an async action fails", async () => {
    const failure = new Error("undo rejected");
    const run = vi.fn(() => Promise.reject(failure));
    host();
    act(() => showToast({ text: "Скрыто", action: "Отменить", run }));
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(toastElement()).toBeNull();

    await act(async () => {});
    expect(recentErrors()).toEqual([{ error: failure, context: { kind: "rejection", source: "toast" } }]);
  });

  it("mounts a new element for a replacement, even with the same text", () => {
    host();
    act(() => showToast("Снова"));
    const first = toastElement();
    act(() => showToast("Снова"));
    const second = toastElement();
    expect(second?.textContent).toBe("Снова");
    expect(second).not.toBe(first);
    expect(first?.isConnected).toBe(false);
  });

  it("shows only its own scope and closes it when unmounted", () => {
    const { unmount } = host("sheet");
    act(() => {
      showToast("В приложении");
      showToast("В фильтрах", "sheet");
    });
    expect(region("sheet")?.textContent).toBe("В фильтрах");
    expect(region("sheet")?.className).toMatch(/bottom-\[calc\(var\(--fsheet-foot,0px\)\+10px\)\]/);

    unmount();
    expect(currentToast("sheet")).toBeNull();
    expect(currentToast("app")).not.toBeNull();
  });
});
