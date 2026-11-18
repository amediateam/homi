import { getMessages } from "@homi/i18n";
import { act, cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ pathname: "/", query: "" }));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.query) }));
vi.mock("@/features/shell/TopBar", () => ({ TopBar: ({ variant }: { variant: string }) => <header data-part="topbar" data-variant={variant} /> }));
vi.mock("@/features/shell/MiniTitle", () => ({ MiniTitle: () => <button type="button" data-part="mini-title" /> }));
vi.mock("@/features/shell/ViewToggle", () => ({ ViewToggle: ({ variant }: { variant: string }) => <button type="button" data-part="view-toggle" data-variant={variant} /> }));
vi.mock("@/features/shell/PullToRefresh", () => ({ PullToRefresh: () => <div data-part="ptr" /> }));
/** The nudges are `NudgeHost`'s (tested in `tests/nudges/NudgeHost.test.tsx`); the shell only mounts it. */
vi.mock("@/features/nudges/NudgeHost", () => ({
  NudgeHost: ({ searchTab }: { searchTab: boolean }) => <div data-nudge-host={searchTab ? "search" : "other"} />,
}));

import { BOOT_RETRY_IDLE, publishBootRetry, resetBootRetry, setBootRetryHandler } from "@/features/gates/bootRetryStore";
import { AppShell } from "@/features/shell/AppShell";
import { lastSavedHref, lastSearchHref, rememberHref } from "@/lib/ui/shellState";

let frames: FrameRequestCallback[] = [];

function shell() {
  return (
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      <AppShell overlay={<div data-part="overlay" />} sheet={<div data-part="sheet" />}>
        <section data-part="page" />
      </AppShell>
    </NextIntlClientProvider>
  );
}

function renderShell(pathname: string, query = "") {
  Object.assign(state, { pathname, query });
  return render(shell());
}

/** A soft navigation: the shell stays mounted and renders the new address. */
function navigate(view: ReturnType<typeof render>, pathname: string, query = "") {
  Object.assign(state, { pathname, query });
  view.rerender(shell());
}

const parts = () =>
  [...document.querySelectorAll<HTMLElement>("[data-part], [data-tabbar]")].map((element) => element.dataset.part ?? "tabbar");
const topBar = () => document.querySelector('[data-part="topbar"]')?.getAttribute("data-variant") ?? null;
const currentTab = () => document.querySelector('[data-tab][aria-current="page"]')?.getAttribute("data-tab") ?? null;
/** The spacers above and below the page: the top inset alone where no top bar is drawn, the chrome's height below. */
const spacers = () => [...document.querySelectorAll("[data-shell] > div[aria-hidden]")].map((element) => element.className);

function scrollTo(y: number) {
  vi.stubGlobal("scrollY", y);
  act(() => {
    window.dispatchEvent(new Event("scroll"));
    const pending = frames;
    frames = [];
    for (const frame of pending) {
      frame(0);
    }
  });
}

beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("scrollY", 0);
  rememberHref("/", "");
  rememberHref("/saved", "");
});

afterEach(() => {
  cleanup();
  resetBootRetry();
  document.documentElement.classList.remove("chrome-mini");
});

describe("AppShell (SCR-006)", () => {
  it("renders the chrome around the page in the legacy order, the slots last", () => {
    renderShell("/");
    expect(parts()).toEqual(["mini-title", "topbar", "page", "view-toggle", "ptr", "tabbar", "overlay", "sheet"]);
    expect(document.querySelector('[data-part="topbar"]')?.getAttribute("data-variant")).toBe("search-list");
    expect(document.querySelector('[data-tab="search"]')?.getAttribute("aria-current")).toBe("page");
  });

  it("shows the toggle on the map and not while drawing; the mini title on the search list only", () => {
    renderShell("/map");
    expect(parts()).toEqual(["topbar", "page", "view-toggle", "ptr", "tabbar", "overlay", "sheet"]);
    cleanup();

    renderShell("/map", "draw=1");
    expect(parts()).toEqual(["topbar", "page", "ptr", "tabbar", "overlay", "sheet"]);
    expect(document.querySelector('[data-part="topbar"]')?.getAttribute("data-variant")).toBe("map-drawing");
    cleanup();

    renderShell("/settings/theme");
    expect(parts()).toEqual(["topbar", "page", "ptr", "tabbar", "overlay", "sheet"]);
    expect(document.querySelector('[data-tab="settings"]')?.getAttribute("aria-current")).toBe("page");
  });

  it("draws no chrome on a listing loaded directly, nor on a layer over it", () => {
    const view = renderShell("/listing/42");
    expect(parts()).toEqual(["page", "ptr", "overlay", "sheet"]);
    expect(spacers()).toEqual(["h-(--top-inset)", "h-(--bottom-inset)"]);

    navigate(view, "/listing/43");
    expect(parts()).toEqual(["page", "ptr", "overlay", "sheet"]);
    navigate(view, "/radars/new", "entry=listing");
    expect(parts()).toEqual(["page", "ptr", "overlay", "sheet"]);
  });

  it("a listing opened over a page keeps that page's chrome, so the page keeps its height (SCR-006, WP-26)", () => {
    const feed = ["mini-title", "topbar", "page", "view-toggle", "ptr", "tabbar", "overlay", "sheet"];
    const view = renderShell("/", "deal=sale");
    expect(spacers()).toEqual(["h-(--bottom-chrome)"]);

    for (const [pathname, query] of [
      ["/listing/42", ""],
      ["/listing/42/photos", "i=2"],
      ["/listing/42/actions", "step=detail"],
      ["/radars/new", "deal=sale&entry=feed"],
    ]) {
      navigate(view, pathname, query);
      expect(parts()).toEqual(feed);
      expect(topBar()).toBe("search-list");
      expect(currentTab()).toBe("search");
      expect(spacers()).toEqual(["h-(--bottom-chrome)"]);
    }

    navigate(view, "/");
    expect(parts()).toEqual(feed);
    navigate(view, "/saved/history");
    navigate(view, "/listing/7");
    expect(topBar()).toBe("saved");
    expect(currentTab()).toBe("saved");
    navigate(view, "/map", "city=tashkent");
    navigate(view, "/listing/7");
    expect(topBar()).toBe("map");
    expect(document.querySelector('[data-part="view-toggle"]')?.getAttribute("data-variant")).toBe("map");
  });

  it("a radar sheet draws the radar tab's chrome, also on Back from the radar's feed (WP-30)", () => {
    const view = renderShell("/radars");
    navigate(view, "/radars/01JD0000000000000000000001");
    expect(topBar()).toBe("radars");
    navigate(view, "/", "city=tashkent&deal=rent_long&from=radar");
    expect(topBar()).toBe("search-list");
    expect(currentTab()).toBe("search");
    navigate(view, "/radars/01JD0000000000000000000001");
    expect(topBar()).toBe("radars");
    expect(currentTab()).toBe("radars");
    navigate(view, "/listing/42");
    expect(topBar()).toBe("radars");
  });

  it("a sheet keeps the chrome of the page it opened over; loaded directly it draws its own", () => {
    const view = renderShell("/");
    navigate(view, "/radars/new", "entry=feed");
    expect(topBar()).toBe("search-list");
    expect(currentTab()).toBe("search");

    navigate(view, "/radars");
    navigate(view, "/radars/new");
    expect(topBar()).toBe("radars");
    navigate(view, "/map");
    navigate(view, "/filters", "from=map");
    expect(topBar()).toBe("map");
    navigate(view, "/settings");
    navigate(view, "/city");
    expect(topBar()).toBe("settings");
    cleanup();

    renderShell("/radars/new", "entry=feed");
    expect(topBar()).toBe("radars");
    cleanup();
    renderShell("/filters", "from=map");
    expect(topBar()).toBe("map");
  });

  it("mounts the nudge host once, right above the tab bar, and tells it whether the search tab is drawn (WP-30)", () => {
    const hosts = () => [...document.querySelectorAll<HTMLElement>("[data-nudge-host]")].map((host) => host.dataset.nudgeHost);
    const view = renderShell("/", "deal=sale");
    expect(hosts()).toEqual(["search"]);
    const order = [...document.querySelectorAll<HTMLElement>('[data-part="ptr"], [data-nudge-host], [data-tabbar]')];
    expect(order.map((element) => (element.dataset.nudgeHost === undefined ? (element.dataset.part ?? "tabbar") : "nudges"))).toEqual([
      "ptr",
      "nudges",
      "tabbar",
    ]);

    navigate(view, "/listing/42");
    expect(hosts()).toEqual(["search"]);
    navigate(view, "/radars");
    expect(hosts()).toEqual(["other"]);
    navigate(view, "/map");
    expect(hosts()).toEqual(["search"]);
  });

  it("wraps the page and the slots in nothing that moves fixed layers or stacks them", () => {
    renderShell("/");
    const page = document.querySelector('[data-part="page"]')!;
    for (let element = page.parentElement; element && element !== document.body; element = element.parentElement) {
      expect(element.className).not.toMatch(/transform|translate|scale|rotate|will-change|filter|blur|z-|isolate|contain/);
      expect(element.getAttribute("style")).toBeNull();
    }
    expect(document.querySelector('[data-part="sheet"]')?.parentElement).toBe(page.parentElement?.parentElement);
  });

  it("remembers the search and saved roots for the tab bar", () => {
    const view = renderShell("/map", "city=tashkent&draw=1");
    expect(lastSearchHref()).toBe("/map?city=tashkent");

    Object.assign(state, { pathname: "/saved/history", query: "" });
    view.rerender(
      <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
        <AppShell overlay={null} sheet={null}>
          <section />
        </AppShell>
      </NextIntlClientProvider>,
    );
    expect(lastSavedHref()).toBe("/saved/history");
    expect(lastSearchHref()).toBe("/map?city=tashkent");
  });

  it("collapses the chrome on the feed only, not under a sheet or a layer parameter", () => {
    renderShell("/");
    scrollTo(500);
    expect(document.documentElement.classList.contains("chrome-mini")).toBe(true);
    cleanup();
    expect(document.documentElement.classList.contains("chrome-mini")).toBe(false);

    for (const [pathname, query] of [
      ["/filters", ""],
      ["/", "pick=city"],
      ["/map", ""],
      ["/saved", ""],
    ]) {
      vi.stubGlobal("scrollY", 0);
      renderShell(pathname, query);
      scrollTo(500);
      expect(document.documentElement.classList.contains("chrome-mini")).toBe(false);
      cleanup();
    }
  });

  it("shows ErrorState in the content area after the sixth failed sign-in, the chrome around it (D-S-3)", () => {
    const retry = vi.fn();
    setBootRetryHandler(retry);
    publishBootRetry({ failed: true, kind: "offline", checking: false });
    const view = renderShell("/");
    const content = document.querySelector("[data-shell-content]")!;
    expect(content.querySelector('[data-part="page"]')).toBeNull();
    const error = content.querySelector<HTMLElement>('[data-slot="error-state"]')!;
    expect(error.dataset.kind).toBe("offline");
    expect(error.textContent).toContain("Нет связи");
    expect(error.textContent).toContain("Проверьте интернет и попробуйте ещё раз.");
    expect(parts()).toEqual(["mini-title", "topbar", "view-toggle", "ptr", "tabbar", "overlay", "sheet"]);

    act(() => error.querySelector("button")!.click());
    expect(retry).toHaveBeenCalledTimes(1);

    act(() => publishBootRetry({ failed: true, kind: "server", checking: false }));
    expect(content.textContent).toContain("Не загрузилось");
    expect(content.textContent).toContain("Сервер не ответил. Попробуйте ещё раз через минуту.");
    expect(content.textContent).toContain("Повторить");

    act(() => publishBootRetry(BOOT_RETRY_IDLE));
    view.rerender(shell());
    expect(content.querySelector('[data-part="page"]')).not.toBeNull();
    expect(content.querySelector('[data-slot="error-state"]')).toBeNull();
  });
});
