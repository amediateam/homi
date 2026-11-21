import { getMessages } from "@homi/i18n";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TOAST_DISMISS_DRAG_PX, ToastHost } from "@/features/shell/ToastHost";
import { clearRecentErrors, recentErrors } from "@/lib/errors/report";
import { type BottomMark, useBottomMark } from "@/lib/ui/shellState";
import { currentToast, dismissToast, showToast, TOAST_ACTION_MS, TOAST_MS, type ToastScope } from "@/lib/ui/toast";

function host(scope?: ToastScope, locale: "ru" | "uz" = "ru") {
  return render(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
      <ToastHost scope={scope} />
    </NextIntlClientProvider>,
  );
}

const region = (scope: ToastScope = "app") => document.querySelector(`[data-toast-host="${scope}"]`);
const toastElement = (scope: ToastScope = "app") => region(scope)?.querySelector("[data-toast]") ?? null;
const dragFrame = () => region()?.querySelector<HTMLElement>("[data-toast-drag]") ?? null;

/** A component that marks what lies at the bottom of the screen while it is mounted, as the toggle, sub-page and CTA bar do. */
function Mark({ mark, on }: { mark: BottomMark; on?: boolean }) {
  useBottomMark(mark, on);
  return null;
}

/** A finger on the toast at y 500, moved to `500 + dy` and lifted. */
function drag(dy: number, { lift = true }: { lift?: boolean } = {}) {
  const target = toastElement() as Element;
  fireEvent.touchStart(target, { touches: [{ clientX: 100, clientY: 500 }] });
  fireEvent.touchMove(target, { touches: [{ clientX: 100, clientY: 500 + dy }] });
  if (lift) {
    fireEvent.touchEnd(target, { touches: [] });
  }
}

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
    expect(live.className).toMatch(/bottom-\[calc\(var\(--tabbar-h\)\+var\(--bottom-inset\)\+20px\)\]/);
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

  it.each<[string, BottomMark[], RegExp, string]>([
    ["the bare tab bar", [], /bottom-\[calc\(var\(--tabbar-h\)\+var\(--bottom-inset\)\+20px\)\]/, "tabbar"],
    ["the view toggle", ["toggle"], /bottom-\[calc\(var\(--tabbar-h\)\+var\(--bottom-inset\)\+78px\)\]/, "toggle"],
    ["a sub-page", ["subpage"], /bottom-\[calc\(var\(--bottom-inset\)\+16px\)\]/, "subpage"],
    ["the listing's CTA bar", ["cta"], /bottom-\[calc\(var\(--bottom-inset\)\+88px\)\]/, "cta"],
    ["a sub-page over the toggle", ["toggle", "subpage"], /bottom-\[calc\(var\(--bottom-inset\)\+16px\)\]/, "subpage"],
    ["the CTA bar over the toggle", ["toggle", "cta"], /bottom-\[calc\(var\(--bottom-inset\)\+88px\)\]/, "cta"],
    ["the CTA bar over a sub-page", ["subpage", "cta"], /bottom-\[calc\(var\(--bottom-inset\)\+88px\)\]/, "cta"],
  ])("the app's toast sits by what is below it: %s", (_, marks, bottom, placement) => {
    render(
      <>
        {marks.map((mark) => (
          <Mark key={mark} mark={mark} />
        ))}
      </>,
    );
    host();
    expect(region()?.className).toMatch(bottom);
    expect(region()?.getAttribute("data-placement")).toBe(placement);
  });

  it("follows the marks as they come and go; a mark that is off counts for nothing; the sheet scope keeps its offset", () => {
    host();
    const marks = render(<Mark mark="toggle" />);
    expect(region()?.getAttribute("data-placement")).toBe("toggle");
    marks.rerender(
      <>
        <Mark mark="toggle" />
        <Mark mark="cta" />
      </>,
    );
    expect(region()?.getAttribute("data-placement")).toBe("cta");
    marks.rerender(
      <>
        <Mark mark="toggle" on={false} />
        <Mark mark="cta" on={false} />
      </>,
    );
    expect(region()?.getAttribute("data-placement")).toBe("tabbar");

    marks.rerender(<Mark mark="subpage" />);
    host("sheet");
    expect(region("sheet")?.className).toMatch(/bottom-\[calc\(var\(--fsheet-foot,0px\)\+10px\)\]/);
    expect(region("sheet")?.hasAttribute("data-placement")).toBe(false);
    marks.unmount();
    expect(region()?.getAttribute("data-placement")).toBe("tabbar");
  });

  it("follows a downward drag and fades; released past 36 px it closes", () => {
    host();
    act(() => showToast("Готово"));

    drag(60, { lift: false });
    expect(dragFrame()?.style.transform).toBe("translateY(60px)");
    expect(dragFrame()?.style.opacity).toBe("0.5");
    expect(dragFrame()?.style.transition).toBe("none");
    fireEvent.touchMove(toastElement() as Element, { touches: [{ clientX: 100, clientY: 700 }] });
    expect(dragFrame()?.style.opacity).toBe("0.2");
    fireEvent.touchEnd(toastElement() as Element, { touches: [] });

    expect(toastElement()).toBeNull();
    expect(currentToast()).toBeNull();
  });

  it(`a drag of ${TOAST_DISMISS_DRAG_PX} px or less, or upwards, returns the toast`, () => {
    host();
    act(() => showToast({ text: "Объявление скрыто", action: "Вернуть", run: vi.fn() }));

    drag(TOAST_DISMISS_DRAG_PX);
    expect(toastElement()).not.toBeNull();
    expect(dragFrame()?.style.transform).toBe("");
    expect(dragFrame()?.style.opacity).toBe("");

    drag(-80, { lift: false });
    expect(dragFrame()?.style.transform).toBe("");
    fireEvent.touchEnd(toastElement() as Element, { touches: [] });
    expect(currentToast()).not.toBeNull();
  });

  it("a cancelled touch returns the toast, however far it was dragged", () => {
    host();
    act(() => showToast("Готово"));

    drag(80, { lift: false });
    fireEvent.touchCancel(toastElement() as Element, { touches: [] });
    expect(toastElement()).not.toBeNull();
    expect(dragFrame()?.style.transform).toBe("");

    // The next drag starts afresh: a short one past the cancel does not close it.
    drag(20);
    expect(currentToast()).not.toBeNull();
  });

  it("the drag moves a frame without an animation of its own: under reduced motion, which stops the rise-in, it still works", () => {
    host();
    act(() => showToast("Готово"));

    expect(toastElement()?.className).toMatch(/animate-rise-in/);
    expect(dragFrame()?.className).not.toMatch(/animate-/);
    expect(dragFrame()?.className).toMatch(/touch-none/);
    drag(20, { lift: false });
    expect(dragFrame()?.style.transform).toBe("translateY(20px)");
  });
});

describe("ToastHost: the countdown ring and the leave (WP-39, BR-APP-118, BR-APP-112)", () => {
  const ring = () => region()?.querySelector<SVGElement>("[data-toast-ring]") ?? null;
  const css = readFileSync(join(import.meta.dirname, "../../styles/motion.css"), "utf8");

  it("an action toast shows the ring on its button, running for the toast's six seconds", () => {
    host();
    act(() => showToast({ text: "Объявление скрыто", action: "Отменить", run: () => undefined }));

    const button = screen.getByRole("button", { name: "Отменить" });
    expect(button.contains(ring())).toBe(true);
    // Legacy's order: the ring, then the label, 7 px apart.
    expect(button.firstElementChild).toBe(ring());
    expect(button.className).toMatch(/gap-\[7px\]/);
    expect(ring()?.getAttribute("aria-hidden")).toBe("true");
    const [track, left] = [...ring()!.querySelectorAll<SVGCircleElement>("circle")];
    expect(track!.getAttribute("r")).toBe("8");
    expect(left!.getAttribute("pathLength")).toBe("1");
    expect(left!.style.animationDuration).toBe(`${TOAST_ACTION_MS}ms`);
    expect(TOAST_ACTION_MS).toBe(6000);
  });

  it("a plain toast has no ring", () => {
    host();
    act(() => showToast("Сохранено"));
    expect(ring()).toBeNull();
  });

  it("a replacement restarts the ring with the timer: a new element, also for the same text (LB-APP-085)", () => {
    host();
    const message = { text: "Объявление скрыто", action: "Отменить", run: () => undefined };
    act(() => showToast(message));
    const first = ring();
    act(() => vi.advanceTimersByTime(TOAST_ACTION_MS - 1000));
    act(() => showToast(message));

    expect(ring()).not.toBe(first);
    act(() => vi.advanceTimersByTime(TOAST_ACTION_MS - 1));
    expect(toastElement()).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(toastElement()).toBeNull();
  });

  it("the ring is 16 px, its dash runs out linearly and holds; under reduced motion nothing animates, so it stays full", () => {
    expect(css).toMatch(/\[data-toast-ring\] \{\s*width: 16px;\s*height: 16px;/);
    expect(css).toMatch(/circle:last-child \{[\s\S]*?stroke-dasharray: 1;\s*stroke-dashoffset: 0;\s*animation: toast-ring linear forwards;/);
    expect(css).toMatch(/@keyframes toast-ring \{\s*to \{\s*stroke-dashoffset: 1;/);
  });

  describe("the leave", () => {
    const copies = () => [...document.querySelectorAll<HTMLElement>('[data-leave="toast"]')];
    const settle = () => act(async () => undefined);
    let played: Array<{ frames: Keyframe[]; timing: KeyframeAnimationOptions }> = [];

    beforeEach(() => {
      played = [];
      Element.prototype.animate = function animate(frames: Keyframe[], timing: KeyframeAnimationOptions) {
        played.push({ frames, timing });
        return { finished: new Promise<void>(() => undefined) } as unknown as Animation;
      } as unknown as typeof Element.prototype.animate;
    });

    afterEach(() => {
      Reflect.deleteProperty(Element.prototype, "animate");
      document.querySelector("[data-leave-layer]")?.remove();
    });

    it("a toast that closes leaves a copy that sinks 10 px and fades over 180 ms; the copy is not a toast", async () => {
      host();
      act(() => showToast("Сохранено"));
      fireEvent.click(toastElement()!);
      await settle();

      expect(toastElement()).toBeNull();
      expect(copies()).toHaveLength(1);
      expect(copies()[0]!.textContent).toBe("Сохранено");
      expect(document.querySelectorAll("[data-toast], [data-toast-drag]")).toHaveLength(0);
      expect(played).toEqual([
        { frames: [{ transform: "translateY(10px)", opacity: 0 }], timing: { duration: 180, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" } },
      ]);
    });

    it("no leave when another toast replaces it, when a drag took it away, or when its host goes with it", async () => {
      const view = host();
      act(() => showToast("Первый"));
      act(() => showToast("Второй"));
      await settle();
      expect(copies()).toHaveLength(0);

      drag(TOAST_DISMISS_DRAG_PX + 10);
      await settle();
      expect(toastElement()).toBeNull();
      expect(copies()).toHaveLength(0);

      act(() => showToast("Третий"));
      view.unmount();
      await settle();
      expect(copies()).toHaveLength(0);
    });
  });
});
