import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CrashScreen } from "@/features/gates/CrashScreen";
import { brand } from "@/lib/brand";
import { clearRecentErrors, recentErrors } from "@/lib/errors/report";

function screenFor(error: unknown, locale: Locale = "ru") {
  return (
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
      <CrashScreen error={error} />
    </NextIntlClientProvider>
  );
}

const slot = (name: string) => document.querySelector(`[data-slot="${name}"]`);
const renderReports = () => recentErrors().filter((entry) => entry.context.kind === "render");

afterEach(() => {
  cleanup();
  clearRecentErrors();
});

describe("CrashScreen (SCR-045)", () => {
  it.each([
    ["ru", "Что-то пошло не так", "Ошибка записана. Обновите приложение — обычно это помогает.", "Обновить"],
    ["uz", "Nimadir xato ketdi", "Xato yozib olindi. Ilovani yangilang — odatda shu yordam beradi.", "Yangilash"],
    ["en", "Something went wrong", "The error has been logged. Reload the app — that usually helps.", "Reload"],
  ] as const)("shows the shrug placeholder and the crash texts in %s", (locale, title, text, reload) => {
    render(screenFor(new Error("boom"), locale));

    expect(screen.getByRole("alert")).toBe(slot("empty-state"));
    expect(slot("empty-state-image")?.getAttribute("src")).toBe(brand.assets.emptyShrug);
    expect(slot("empty-state-image")?.getAttribute("alt")).toBe("");
    expect(screen.getByRole("heading", { level: 1 })).toBe(slot("empty-state-title"));
    expect(slot("empty-state-title")?.textContent).toBe(title);
    expect(slot("empty-state-hint")?.textContent).toBe(text);
    expect(screen.getByRole("button").textContent).toBe(reload);
  });

  it("moves the focus to its action: the screen replaced whatever held it", () => {
    render(screenFor(new Error("boom")));

    expect(document.activeElement).toBe(screen.getByRole("button"));
  });

  it("has a single action, which reloads the document", () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { pathname: "/ru", reload });
    render(screenFor(new Error("boom")));

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    fireEvent.click(buttons[0]);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reports the error once as a render error, however often the screen renders or mounts", () => {
    const first = new Error("first");
    const view = render(screenFor(first));
    view.rerender(screenFor(first));
    view.rerender(screenFor(first, "uz"));
    view.unmount();
    render(screenFor(first));

    expect(renderReports()).toHaveLength(1);
    expect(renderReports()[0]).toEqual({ error: first, context: { kind: "render" } });

    const second = new Error("second");
    cleanup();
    render(screenFor(second));

    expect(renderReports().map((entry) => entry.error)).toEqual([first, second]);
  });

  it("reports a thrown value that is not an Error once while it stays the same", () => {
    const view = render(screenFor("plain string"));
    view.rerender(screenFor("plain string"));

    expect(renderReports()).toHaveLength(1);
    expect(renderReports()[0].error.message).toBe("plain string");
  });
});
