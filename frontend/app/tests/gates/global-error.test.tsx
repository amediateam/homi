import { type Locale, locales } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { act, fireEvent } from "@testing-library/react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import GlobalError from "@/app/global-error";
import { clearRecentErrors, recentErrors } from "@/lib/errors/report";

/** The component renders `<html>` itself, so it is mounted on the document, as Next.js does. */
let root: Root | null = null;

function stubAddress(pathname: string) {
  const reload = vi.fn();
  vi.stubGlobal("location", { pathname, reload });
  return reload;
}

function show(error: unknown = new Error("layout failed")) {
  act(() => {
    root = createRoot(document);
    root.render(<GlobalError error={error} />);
  });
}

const text = (selector: string) => document.querySelector(selector)?.textContent;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.documentElement.innerHTML = "<head></head><body></body>";
  document.documentElement.removeAttribute("lang");
  clearRecentErrors();
});

describe("global-error (D-E-2)", () => {
  it.each<[string, Locale]>([
    ["/ru/map", "ru"],
    ["/uz/listing/42", "uz"],
    ["/en", "en"],
    ["/", "ru"],
    ["/de/x", "ru"],
    ["/uzb/settings", "ru"],
  ])("at %s shows the crash texts in %s", (pathname, locale) => {
    stubAddress(pathname);
    show();

    const crash = getMessages(locale).crash;
    expect(document.documentElement.getAttribute("lang")).toBe(locale);
    expect(text("main[data-route='global-error'] h1")).toBe(crash.title);
    expect(text("main p")).toBe(crash.text);
    expect(text("main button")).toBe(crash.reload);
  });

  it("keeps the main landmark and announces the screen from an alert inside it", () => {
    stubAddress("/ru");
    show();

    const main = document.querySelector("main[data-route='global-error']");
    expect(main?.hasAttribute("role")).toBe(false);
    expect(main?.querySelector("[role='alert'] h1")?.textContent).toBe(getMessages("ru").crash.title);
  });

  it("keeps the hard-coded copies equal to the crash texts of the catalogues", () => {
    expect(locales.map((locale) => getMessages(locale).crash.title)).toEqual([
      "Что-то пошло не так",
      "Nimadir xato ketdi",
      "Something went wrong",
    ]);
    expect(getMessages("en").crash.reload).toBe("Reload");
  });

  it("renders its own document with inline styles and no script, dark under the system scheme", () => {
    const html = renderToString(<GlobalError error={new Error("layout failed")} />);

    expect(html).toMatch(/^<html lang="ru"><head>/);
    expect(html).toContain("<body>");
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/nonce/i);
    expect(html).not.toMatch(/<link/i);
    const style = /<style>([\s\S]*)<\/style>/.exec(html)?.[1] ?? "";
    expect(style).toContain("@media (prefers-color-scheme: dark)");
    expect(style).toContain('url("/brand/empty-shrug.svg")');
    expect(style).not.toContain("&quot;");
  });

  it("hydrates the server HTML without a mismatch, then follows the address", () => {
    const server = renderToString(<GlobalError error={new Error("layout failed")} />);
    document.documentElement.innerHTML = server.replace(/^<html[^>]*>|<\/html>$/g, "");
    document.documentElement.setAttribute("lang", "ru");
    stubAddress("/uz/saved");
    const onRecoverableError = vi.fn();
    const consoleError = vi.spyOn(console, "error");

    act(() => {
      root = hydrateRoot(document, <GlobalError error={new Error("layout failed")} />, { onRecoverableError });
    });

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(document.documentElement.getAttribute("lang")).toBe("uz");
    expect(text("main h1")).toBe("Nimadir xato ketdi");
  });

  it("reloads the document from its single button and reports the error once", () => {
    const reload = stubAddress("/en/radars");
    const error = new Error("layout failed");
    show(error);
    act(() => root?.render(<GlobalError error={error} />));

    const buttons = document.querySelectorAll("button");
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(recentErrors()).toEqual([{ error, context: { kind: "render" } }]);
  });
});
