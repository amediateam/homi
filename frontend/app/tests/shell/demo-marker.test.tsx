import { getMessages } from "@homi/i18n";
import { act, cleanup, render, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DemoDataMarker } from "@/features/shell/DemoDataMarker";
import { SourceReporter } from "@/features/shell/SourceReporter";
import { reportSource, resetSources } from "@/lib/data/sources";

const navigation = vi.hoisted(() => ({ pathname: "/ru" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

function renderMarker(children?: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      {children}
      <DemoDataMarker />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  navigation.pathname = "/ru";
  resetSources();
});
afterEach(cleanup);

describe("DemoDataMarker", () => {
  it("is hidden while the screen reports only legacy and native answers", () => {
    renderMarker(
      <>
        <SourceReporter source="legacy" />
        <SourceReporter source="native" />
      </>,
    );

    expect(screen.queryByText("Демо-данные")).toBeNull();
  });

  it("shows the pill with its accessible description once an answer reports stub", () => {
    renderMarker();
    expect(screen.queryByText("Демо-данные")).toBeNull();

    act(() => reportSource("stub", "/ru"));

    const marker = screen.getByText("Демо-данные").closest("[data-demo-marker]") as HTMLElement;
    expect(marker).not.toBeNull();
    expect(document.getElementById(marker.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Раздел пока работает на тестовых данных",
    );
    expect(marker.className).toMatch(/pointer-events-none/);
  });

  it("sits above the listing layer and below the sheets' backdrop (WP-26: 46 between 45 and 50)", () => {
    renderMarker(<SourceReporter source="stub" />);

    const marker = screen.getByText("Демо-данные").closest("[data-demo-marker]") as HTMLElement;
    expect(marker.className).toMatch(/(?:^|\s)z-\[calc\(var\(--z-listing\)\+1\)\](?:\s|$)/);
    expect(marker.className).not.toMatch(/z-tabbar/);
  });

  it("shows for a stub reported by a Server Component's SourceReporter", () => {
    renderMarker(<SourceReporter source="stub" />);

    expect(screen.getByText("Демо-данные")).toBeDefined();
  });

  it("reports nothing for an answer without meta.source (WP-22)", () => {
    renderMarker(<SourceReporter source={undefined} />);

    expect(screen.queryByText("Демо-данные")).toBeNull();
  });

  it("is hidden again after the pathname changes", () => {
    const view = renderMarker(<SourceReporter source="stub" />);
    expect(screen.getByText("Демо-данные")).toBeDefined();

    navigation.pathname = "/ru/map";
    view.rerender(
      <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
        <DemoDataMarker />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByText("Демо-данные")).toBeNull();
  });

  it("forgets the stub of an address that was left, even when the same address comes back", () => {
    const view = renderMarker();
    act(() => reportSource("stub", "/ru"));
    const rerender = () =>
      view.rerender(
        <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
          <DemoDataMarker />
        </NextIntlClientProvider>,
      );

    navigation.pathname = "/ru/map";
    rerender();
    navigation.pathname = "/ru";
    rerender();

    expect(screen.queryByText("Демо-данные")).toBeNull();
  });

  it("keeps a stub reported for the new address before the marker saw the change", () => {
    const view = renderMarker();
    navigation.pathname = "/ru/saved";
    act(() => reportSource("stub", "/ru/saved"));
    view.rerender(
      <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
        <DemoDataMarker />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Демо-данные")).toBeDefined();
  });
  it("hydrates as the server rendered it although a report came first, then shows the pill (WP-33, React error 418)", async () => {
    const tree = (
      <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
        <DemoDataMarker />
      </NextIntlClientProvider>
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(tree);
    document.body.append(container);
    expect(container.querySelector("[data-demo-marker]")).toBeNull();

    // The page's boundary hydrated first: its reporter's effect has run before the marker hydrates.
    reportSource("stub", "/ru");
    const recoverable = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, tree, { onRecoverableError: recoverable });
    });

    expect(recoverable).not.toHaveBeenCalled();
    expect(container.querySelector("[data-demo-marker]")?.textContent).toContain("Демо-данные");
    act(() => root?.unmount());
    container.remove();
  });
  it("has no pill on the screen outside Telegram, though the layout's reference read reports stub there (WP-33)", () => {
    navigation.pathname = "/ru/outside";
    renderMarker(<SourceReporter source="stub" />);
    expect(screen.queryByText("Демо-данные")).toBeNull();
  });
});
