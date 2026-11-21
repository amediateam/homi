import { getMessages } from "@homi/i18n";
import { fakeTelegram, type FakeTelegram, freezeClock } from "@homi/testing";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ListingPreview } from "@/features/feed/types";
import type { BffOptions } from "@/lib/api/browser";
import type { ApiResult } from "@/lib/api/types";

type Call = (input: unknown, auth?: unknown, locale?: string) => Promise<ApiResult<unknown>>;

const state = vi.hoisted(() => ({
  /** Every `bffFetch` path, in order. */
  sent: [] as { path: string; query: BffOptions["query"] }[],
  /** The answer per path; a path without one stays pending. */
  answers: new Map<string, ApiResult<unknown>>(),
  pathname: "/radars/01JD0000000000000000000001",
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  patchRadar: vi.fn<Call>(),
  deleteRadar: vi.fn<Call>(),
}));
vi.mock("@/lib/api/browser", () => ({
  bffFetch: (path: string, options: BffOptions = {}) => {
    state.sent.push({ path, query: options.query });
    const answer = state.answers.get(path);
    return answer === undefined ? new Promise(() => undefined) : Promise.resolve(answer);
  },
}));
vi.mock("@/lib/actions/radars", () => ({ patchRadar: state.patchRadar, deleteRadar: state.deleteRadar }));
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: vi.fn(), reauthenticate: vi.fn(async () => false) }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: "ready", renewed: false, me: null }) }));
vi.mock("@/lib/data/sources", () => ({ reportSource: vi.fn() }));
vi.mock("@/lib/navigation/nav", () => ({
  nav: { push: (href: string) => state.push(href), replace: (href: string) => state.replace(href), back: () => state.back() },
}));
vi.mock("@/lib/navigation/useBack", () => ({ useBack: () => ({ canGoBack: true, back: state.back }) }));
vi.mock("next/navigation", () => ({
  usePathname: () => `/ru${state.pathname}`,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => state.pathname }));

import { normalizeRadar, type Radar } from "@/features/radars/normalize";
import { hasFeedScroll, rememberFeedScroll } from "@/features/feed/feedScroll";
import { clearRadarReturn, peekRadarReturn, radarFeedHref, rememberRadarReturn } from "@/features/radars/radarReturn";
import { RadarSheetRoute } from "@/features/radars/RadarSheetRoute";
import { resetRadarSwitches } from "@/features/radars/RadarTiles";
import { RADARS_KEY, RADARS_PREVIEWS_KEY } from "@/features/radars/useRadars";
import { getPreview, resetPreviews } from "@/lib/data/previewCache";
import { resetSessionMaps } from "@/lib/data/sessionMaps";
import { readResource, resetResources, seedResource } from "@/lib/data/useResource";
import type { DevFlags } from "@/lib/flags";
import { resetReference } from "@/lib/reference/useReference";
import { rememberHref } from "@/lib/ui/shellState";
import { currentToast, dismissToast } from "@/lib/ui/toast";

import { withDevFlags } from "../helpers/flags";
import { previewOf } from "../helpers/listing";
import { cityOf, feedReference } from "../helpers/reference";

const A = "01JD0000000000000000000001";
const B = "01JD0000000000000000000002";

function raw(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    active: true,
    mode: "instant",
    hidden: 0,
    created_at: "2026-11-10T06:00:00+00:00",
    filters: { city: "tashkent", deal: "rent_long", rooms_min: 2, rooms_max: 2, price_max: 600 },
    preview: { items: [], count: 3, flow: { week: 21, days: 7 } },
    ...overrides,
  };
}

/** A radar as a mutation answers it, or the plain list holds it: without the `preview` key. */
function plain(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const answer = raw(id, overrides);
  delete answer.preview;
  return answer;
}

const radar = (id: string, overrides: Record<string, unknown> = {}): Radar => normalizeRadar(raw(id, overrides))!;
const ok = (data: unknown): ApiResult<unknown> => ({ ok: true, data, meta: { source: "stub" } });
const failure = (error: string, status: number): ApiResult<never> =>
  ({ ok: false, error, status, method: "PATCH", path: "radars/:id" }) as unknown as ApiResult<never>;

function withIntl(children: ReactNode) {
  return (
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      {children}
    </NextIntlClientProvider>
  );
}

function renderSheet({ flags, id = A, children }: { flags?: DevFlags; id?: string; children?: ReactNode } = {}) {
  return render(withIntl(<RadarSheetRoute id={id} presentation="layer" flags={flags}>{children}</RadarSheetRoute>));
}

/** The tab's list as the tab below the sheet left it (`useRadars({ previews: true })`). */
const seed = (...radars: Radar[]) => seedResource(RADARS_PREVIEWS_KEY, radars);
const sheet = () => document.querySelector<HTMLElement>('[data-route="radar"][data-layer="sheet"]')!;
const dialog = () => screen.getByRole("dialog");
const strip = () => sheet().querySelector<HTMLElement>("[data-radar-strip]")!;
const footer = () => document.querySelector<HTMLElement>('[data-slot="bottom-sheet-footer"]');
const haptics = () => (fake?.calls ?? []).filter((call) => call.member.startsWith("HapticFeedback")).map((call) => `${call.member}(${String(call.args[0])})`);
const settle = () => act(async () => undefined);

let fake: FakeTelegram | null = null;
const scrollTo = vi.fn();

beforeEach(() => {
  fake = fakeTelegram({ version: "8.0" });
  state.sent.length = 0;
  state.answers.clear();
  state.answers.set("settings", ok({ digest_hours: [9, 21] }));
  state.pathname = `/radars/${A}`;
  for (const mock of [state.push, state.replace, state.back, state.patchRadar, state.deleteRadar, scrollTo]) {
    mock.mockReset();
  }
  vi.stubGlobal("scrollTo", scrollTo);
  resetResources();
  resetRadarSwitches();
  resetPreviews();
  resetSessionMaps();
  clearRadarReturn();
  dismissToast("app");
  rememberHref("/", "");
  feedReference({ reference: { radars_enabled: true } });
});

afterEach(() => {
  cleanup();
  // jsdom shares `window.location` across tests (`currentAddress()`).
  window.history.replaceState(null, "", "/");
  resetReference();
  vi.unstubAllGlobals();
  fake?.uninstall();
  fake = null;
});

describe("RadarSheet (SCR-028, BR-APP-047)", () => {
  it("an active radar: the header, the strip label, the switch on, the two mode rows with the selected one checked", async () => {
    seed(radar(A));
    renderSheet();
    await settle();

    expect(dialog().querySelector('[data-slot="bottom-sheet-title"]')?.textContent).toBe("2-комн. · до $600");
    const head = document.querySelector<HTMLElement>("[data-radar-head]")!;
    expect(head.textContent).toContain("Ташкент целиком");
    expect(head.querySelector("[data-radar-status]")?.textContent).toBe("≈3 в день · сразу");
    expect(head.querySelector("[data-radar-dot]")?.className).toContain("bg-accent");
    expect(sheet().textContent).toContain("Последние находки");
    expect(screen.getByRole("switch", { name: "Присылать в чат" }).getAttribute("aria-checked")).toBe("true");
    const modes = screen.getAllByRole("radio");
    expect(modes.map((row) => [row.textContent, row.getAttribute("aria-checked")])).toEqual([
      ["СразуКаждое новое — как только появится", "true"],
      ["ПодборкойСписком в 9 и 21", "false"],
    ]);
    expect(sheet().querySelector("[data-radar-delete]")?.textContent).toBe("Удалить радар");
    expect(sheet().querySelector("[data-radar-delete] span")?.className).toContain("text-danger");
    expect(sheet().querySelector("[data-radar-edit]")?.textContent).toBe("Изменить условия");
  });

  it("a paused radar: no mode rows, the hint dot, «На паузе», the finds dimmed; no settings are read", async () => {
    seed(radar(A, { active: false, preview: { items: [previewOf({ number: 100001 })], count: 1, flow: null } }));
    renderSheet();
    await settle();

    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(document.querySelector("[data-radar-head] [data-radar-status]")?.textContent).toBe("На паузе");
    expect(document.querySelector("[data-radar-dot]")?.className).toContain("bg-hint");
    expect(sheet().querySelector("[data-radar-finds]")?.className).toContain("opacity-45");
    // «новое» only on a find of an active radar.
    expect(sheet().querySelector("[data-radar-new]")).toBeNull();
    expect(state.sent.filter((call) => call.path === "settings")).toHaveLength(0);
  });

  it("hidden 0: no hidden row; hidden 3: «Скрыто: 3 — Вернуть», which unhides with the success haptic and the toast", async () => {
    seed(radar(A));
    const view = renderSheet();
    await settle();
    expect(sheet().querySelector("[data-radar-unhide]")).toBeNull();
    view.unmount();

    seed(radar(A, { hidden: 3 }));
    renderSheet();
    await settle();
    const row = sheet().querySelector<HTMLButtonElement>("[data-radar-unhide]")!;
    expect(row.textContent).toBe("Скрыто: 3Вернуть");
    state.patchRadar.mockResolvedValue(ok({ radar: plain(A, { hidden: 0 }), starter: 0, ask_found: false }));

    await act(async () => fireEvent.click(row));
    expect(state.patchRadar).toHaveBeenCalledExactlyOnceWith({ id: A, unhide: true }, undefined, "ru");
    expect(currentToast("app")?.message).toEqual({ key: "radar.unhidden" });
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)", "HapticFeedback.notificationOccurred(success)"]);
    expect(sheet().querySelector("[data-radar-unhide]")).toBeNull();
    // The preview the answer did not carry stays.
    expect(readResource<Radar[]>(RADARS_PREVIEWS_KEY)?.[0].preview?.count).toBe(3);
  });

  it("a failed unhide keeps the row, with the error haptic and «Не получилось сохранить»", async () => {
    seed(radar(A, { hidden: 3 }));
    renderSheet();
    await settle();
    state.patchRadar.mockResolvedValue(failure("server", 500));

    await act(async () => fireEvent.click(sheet().querySelector("[data-radar-unhide]")!));
    expect(sheet().querySelector("[data-radar-unhide]")).not.toBeNull();
    expect(haptics()).toContain("HapticFeedback.notificationOccurred(error)");
    expect(currentToast("app")?.message).toEqual({ key: "common.saveFailed" });
  });

  it("the strip: three ghosts while the preview is not there, «Пока ничего…» without finds", async () => {
    seed(normalizeRadar(plain(A))!);
    const view = renderSheet();
    await settle();
    expect(strip().dataset.radarStrip).toBe("loading");
    expect(strip().querySelectorAll("[data-radar-ghost]")).toHaveLength(3);
    expect(strip().querySelector("[data-radar-all]")).toBeNull();
    view.unmount();

    seed(radar(A));
    renderSheet();
    await settle();
    expect(strip().dataset.radarStrip).toBe("none");
    expect(strip().textContent).toBe("Пока ничего — радар пришлёт, как появится");
    // A preview the server could not compute reads the same.
    cleanup();
    seed(radar(A, { preview: null }));
    renderSheet();
    await settle();
    expect(strip().dataset.radarStrip).toBe("none");
  });

  it("the strip's finds: cover, «новое» on an unviewed find, the price (— without one) with its period, district · age, «Все 3 ›»", async () => {
    const items: ListingPreview[] = [
      previewOf({ number: 100001 }),
      previewOf({ number: 100002, viewed: true, price: null, district: null, place: "Чиланзар", posted: { label: "Опубликовано", when: "вчера", at: null } }),
    ];
    seed(radar(A, { preview: { items, count: 3, flow: null } }));
    renderSheet();
    await settle();

    const cards = [...strip().querySelectorAll<HTMLElement>("[data-radar-find]")];
    expect(cards.map((card) => card.dataset.radarFind)).toEqual(["100001", "100002"]);
    expect(cards[0].querySelector("[data-radar-new]")?.textContent).toBe("новое");
    expect(cards[1].querySelector("[data-radar-new]")).toBeNull();
    expect(cards[0].querySelector("b")?.textContent).toBe("$600/мес");
    expect(cards[1].querySelector("b")?.textContent).toBe("—");
    expect(cards[0].textContent).toContain("Юнусабад · сегодня");
    expect(cards[1].textContent).toContain("Чиланзар · вчера");
    expect(cards[0].querySelector("img")).not.toBeNull();
    expect(strip().querySelector("[data-radar-all]")?.textContent).toBe("Все 3");
  });

  it("the strip's age is computed from `posted.at` when the sheet renders and does not follow the minute clock (BR-APP-109)", async () => {
    const restore = freezeClock("2026-11-14T06:45:50Z");
    try {
      const posted = { label: "Опубликовано", when: "сегодня", at: "2026-11-14T06:40:00+00:00" };
      seed(radar(A, { preview: { items: [previewOf({ number: 100001, posted })], count: 1, flow: null } }));
      renderSheet();
      await settle();
      const find = () => strip().querySelector<HTMLElement>('[data-radar-find="100001"]')!;
      expect(find().textContent).toContain("Юнусабад · 5 мин назад");

      await act(async () => vi.advanceTimersByTime(60_000));

      expect(find().textContent).toContain("Юнусабад · 5 мин назад");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      restore();
    }
  });

  it("a find opens the listing over the tab: seen and the preview recorded, the return stored", async () => {
    const item = previewOf({ number: 100001 });
    seed(radar(A, { preview: { items: [item], count: 1, flow: null } }));
    renderSheet();
    await settle();

    fireEvent.click(strip().querySelector("[data-radar-find]")!);
    expect(state.push).toHaveBeenCalledExactlyOnceWith("/listing/100001");
    // The sheet gives way to the listing without a leave (WP-39): legacy's parked sheet plays none (DEC-64).
    expect(document.querySelector('[data-slot="bottom-sheet"]')?.hasAttribute("data-gone")).toBe(true);
    expect(getPreview(100001)?.number).toBe(100001);
    expect(peekRadarReturn(A)).not.toBeNull();
    // Opened in this launch: no longer «новое».
    expect(strip().querySelector("[data-radar-new]")).toBeNull();
  });

  it("the digest hint: the user's hours joined with «и», else «Списком в заданное время»", async () => {
    state.answers.set("settings", ok({ digest_hours: [9, 12, 21] }));
    seed(radar(A));
    const view = renderSheet();
    await settle();
    expect(document.querySelector('[data-radar-mode="digest"] [data-radar-mode-hint]')?.textContent).toBe("Списком в 9 и 12 и 21");
    view.unmount();

    resetResources();
    state.answers.delete("settings");
    seed(radar(A));
    renderSheet();
    await settle();
    expect(document.querySelector('[data-radar-mode="digest"] [data-radar-mode-hint]')?.textContent).toBe("Списком в заданное время");
  });

  it("dev022RadarCountLabel off: «Смотреть найденное · 3» and «Все 3»; on: the plain labels and «Сейчас подходит: 3»", async () => {
    const items = [previewOf({ number: 100001 })];
    seed(radar(A, { preview: { items, count: 3, flow: null } }));
    const view = renderSheet();
    await settle();
    expect(footer()?.querySelector("[data-radar-feed]")?.textContent).toBe("Смотреть найденное · 3");
    expect(footer()?.querySelector("[data-radar-matching]")).toBeNull();
    expect(strip().querySelector("[data-radar-all]")?.textContent).toBe("Все 3");
    view.unmount();

    withDevFlags({ dev022RadarCountLabel: true }, (flags) => renderSheet({ flags }));
    await settle();
    expect(footer()?.querySelector("[data-radar-feed]")?.textContent).toBe("Смотреть найденное");
    expect(footer()?.querySelector("[data-radar-matching]")?.textContent).toBe("Сейчас подходит: 3");
    expect(strip().querySelector("[data-radar-all]")?.textContent).toBe("Смотреть найденное");
  });

  it("an unknown count reads the plain labels with the flag off", async () => {
    seed(radar(A, { preview: { items: [previewOf({ number: 100001 })], count: null, flow: null } }));
    renderSheet();
    await settle();
    expect(footer()?.querySelector("[data-radar-feed]")?.textContent).toBe("Смотреть найденное");
    expect(strip().querySelector("[data-radar-all]")?.textContent).toBe("Смотреть найденное");
  });

  it("«Смотреть найденное»: the feed of the radar's filters with the last search's sort when offered, from=radar; the return stored", async () => {
    feedReference({ cities: [cityOf()], reference: { radars_enabled: true } });
    rememberHref("/", "deal=sale&sort=cheap");
    // The window really moves: a scroll before the return is stored would store 0.
    scrollTo.mockImplementation((_x: number, y: number) => Object.defineProperty(window, "scrollY", { configurable: true, value: y }));
    Object.defineProperty(window, "scrollY", { configurable: true, value: 340 });
    seed(radar(A));
    renderSheet();
    await settle();

    fireEvent.click(footer()!.querySelector("[data-radar-feed]")!);
    const href = state.push.mock.lastCall?.[0] as string;
    expect(href).toBe(radarFeedHref(radar(A), "/?deal=sale&sort=cheap", cityOf()));
    const params = new URL(href, "https://app.homi.loc").searchParams;
    expect(params.get("from")).toBe("radar");
    expect(params.get("sort")).toBe("cheap");
    expect(params.get("price_max")).toBe("600");
    // K3: the tab's position stored for Back, then the feed starts at its top, mounted before or not.
    expect(peekRadarReturn(A)).toEqual({ id: A, scrollY: 340, via: "feed", stripX: 0, sheetY: 0 });
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith(0, 0);
    expect(window.scrollY).toBe(0);
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  });

  it("«Все N» of the strip opens the feed the same way: the return stored, then the top", async () => {
    scrollTo.mockImplementation((_x: number, y: number) => Object.defineProperty(window, "scrollY", { configurable: true, value: y }));
    Object.defineProperty(window, "scrollY", { configurable: true, value: 145 });
    seed(radar(A, { preview: { items: [previewOf({ number: 100001 })], count: 3, flow: null } }));
    renderSheet();
    await settle();

    fireEvent.click(strip().querySelector("[data-radar-all]")!);
    expect(new URL(state.push.mock.lastCall?.[0] as string, "https://app.homi.loc").searchParams.get("from")).toBe("radar");
    expect(peekRadarReturn(A)).toEqual({ id: A, scrollY: 145, via: "feed", stripX: 0, sheetY: 0 });
    expect(window.scrollY).toBe(0);
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  });

  it("a find keeps the tab's scroll: the listing opens over it", async () => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: 145 });
    seed(radar(A, { preview: { items: [previewOf({ number: 100001 })], count: 1, flow: null } }));
    renderSheet();
    await settle();

    fireEvent.click(strip().querySelector("[data-radar-find]")!);
    expect(peekRadarReturn(A)).toEqual({ id: A, scrollY: 145, via: "listing", stripX: 0, sheetY: 0 });
    expect(scrollTo).not.toHaveBeenCalled();
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  });

  it("a find stores the strip's sideways scroll and the sheet's own scroll with the return (WP-38, DEC-64)", async () => {
    seed(radar(A, { preview: { items: [previewOf({ number: 100001 }), previewOf({ number: 100002 })], count: 2, flow: null } }));
    renderSheet();
    await settle();
    const body = strip().closest<HTMLElement>('[data-slot="bottom-sheet-body"]')!;
    Object.defineProperty(strip(), "scrollLeft", { configurable: true, value: 120 });
    Object.defineProperty(body, "scrollTop", { configurable: true, value: 260 });

    fireEvent.click(strip().querySelector("[data-radar-find]")!);

    expect(peekRadarReturn(A)).toEqual({ id: A, scrollY: 0, via: "listing", stripX: 120, sheetY: 260 });
  });

  it("an opening with a return puts the sheet's body and the strip back, each once, the strip once its finds show", async () => {
    const tops: number[] = [];
    const lefts: number[] = [];
    vi.spyOn(Element.prototype, "scrollTop", "set").mockImplementation(function (this: Element, value: number) {
      if (this.matches('[data-slot="bottom-sheet-body"]')) {
        tops.push(value);
      }
    });
    vi.spyOn(Element.prototype, "scrollLeft", "set").mockImplementation(function (this: Element, value: number) {
      if (this.matches('[data-radar-strip="finds"]')) {
        lefts.push(value);
      }
    });
    try {
      seed(radar(A, { preview: { items: [previewOf({ number: 100001 }), previewOf({ number: 100002 })], count: 2, flow: null } }));
      rememberRadarReturn(A, 0, { via: "listing", stripX: 150, sheetY: 220 });
      renderSheet();
      await settle();
      await settle();

      // jsdom keeps no scroll position, so the hold may set it again on later frames: always the same value.
      expect(tops.length).toBeGreaterThan(0);
      expect(new Set(tops)).toEqual(new Set([220]));
      expect(lefts.length).toBeGreaterThan(0);
      expect(new Set(lefts)).toEqual(new Set([150]));
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("«Смотреть найденное» drops the search list's scroll memory (BR-APP-105)", async () => {
    rememberFeedScroll("r1#feed", 900);
    seed(radar(A));
    renderSheet();
    await settle();

    fireEvent.click(footer()!.querySelector("[data-radar-feed]")!);

    expect(hasFeedScroll()).toBe(false);
  });

  it("a sort the radar's search does not offer falls back to new", () => {
    const href = radarFeedHref(radar(A), "/?deal=sale&sort=ppm", cityOf());
    expect(new URL(href, "https://app.homi.loc").searchParams.has("sort")).toBe(false);
    expect(new URL(href, "https://app.homi.loc").searchParams.get("from")).toBe("radar");
  });

  it("the mode rows: a radiogroup «Когда присылать», one tab stop; the arrow keys, Home and End move the focus without a write", async () => {
    seed(radar(A));
    renderSheet();
    await settle();

    const group = screen.getByRole("radiogroup", { name: "Когда присылать" });
    const rows = screen.getAllByRole("radio");
    expect(rows.map((row) => [row.getAttribute("data-radar-mode"), row.tabIndex])).toEqual([
      ["instant", 0],
      ["digest", -1],
    ]);
    const focused = () => document.activeElement?.getAttribute("data-radar-mode");
    rows[0].focus();

    fireEvent.keyDown(group, { key: "ArrowDown" });
    expect(focused()).toBe("digest");
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(focused()).toBe("instant");
    fireEvent.keyDown(group, { key: "ArrowUp" });
    expect(focused()).toBe("digest");
    fireEvent.keyDown(group, { key: "Home" });
    expect(focused()).toBe("instant");
    fireEvent.keyDown(group, { key: "End" });
    expect(focused()).toBe("digest");
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(focused()).toBe("instant");

    expect(state.patchRadar).not.toHaveBeenCalled();
    expect(haptics()).toEqual([]);
    expect(rows.map((row) => row.getAttribute("aria-checked"))).toEqual(["true", "false"]);
  });

  it("a mode change is optimistic; the same mode sends nothing; a failure reverts it", async () => {
    seed(radar(A));
    renderSheet();
    await settle();

    await act(async () => fireEvent.click(document.querySelector('[data-radar-mode="instant"]')!));
    expect(state.patchRadar).not.toHaveBeenCalled();

    let answer: (value: ApiResult<unknown>) => void = () => undefined;
    state.patchRadar.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    fireEvent.click(document.querySelector('[data-radar-mode="digest"]')!);
    expect(document.querySelector('[data-radar-mode="digest"]')?.getAttribute("aria-checked")).toBe("true");
    expect(state.patchRadar).toHaveBeenCalledExactlyOnceWith({ id: A, mode: "digest" }, undefined, "ru");

    await act(async () => answer(failure("server", 500)));
    expect(document.querySelector('[data-radar-mode="instant"]')?.getAttribute("aria-checked")).toBe("true");
    expect(haptics()).toContain("HapticFeedback.notificationOccurred(error)");
    expect(currentToast("app")?.message).toEqual({ key: "common.saveFailed" });
  });

  it("delete: Cancel sends nothing", async () => {
    fake?.uninstall();
    fake = fakeTelegram({ version: "8.0", answers: { confirm: false } });
    seed(radar(A));
    renderSheet();
    await settle();

    await act(async () => fireEvent.click(sheet().querySelector("[data-radar-delete]")!));
    expect(fake.calls.find((call) => call.member === "showConfirm")?.args[0]).toBe("Удалить радар «2-комн. · до $600»?");
    expect(state.deleteRadar).not.toHaveBeenCalled();
    expect(state.back).not.toHaveBeenCalled();
  });

  it("delete: OK removes the radar from both lists, the success haptic, then back(); no toast with the default flags", async () => {
    seed(radar(A), radar(B));
    seedResource(RADARS_KEY, [radar(A), radar(B)]);
    state.deleteRadar.mockResolvedValue(ok({ ask_found: false }));
    renderSheet();
    await settle();

    await act(async () => fireEvent.click(sheet().querySelector("[data-radar-delete]")!));
    expect(state.deleteRadar).toHaveBeenCalledExactlyOnceWith({ id: A }, undefined, "ru");
    expect(readResource<Radar[]>(RADARS_PREVIEWS_KEY)?.map((item) => item.id)).toEqual([B]);
    expect(readResource<Radar[]>(RADARS_KEY)?.map((item) => item.id)).toEqual([B]);
    expect(haptics()).toContain("HapticFeedback.notificationOccurred(success)");
    expect(state.back).toHaveBeenCalledTimes(1);
    // The sheet leaves by itself: the unknown-radar rule does not replace as well.
    expect(state.replace).not.toHaveBeenCalled();
    expect(currentToast("app")).toBeNull();
  });

  it.each([true, false])(
    "delete answered after the user left the sheet (ask_found %s): the haptic and the lists, but no back() and no survey",
    async (askFound) => {
      window.history.replaceState(null, "", `/ru/radars/${A}`);
      seed(radar(A), radar(B));
      let answer: (value: ApiResult<unknown>) => void = () => undefined;
      state.deleteRadar.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
      renderSheet();
      await settle();

      await act(async () => fireEvent.click(sheet().querySelector("[data-radar-delete]")!));
      expect(state.deleteRadar).toHaveBeenCalledTimes(1);
      // × or Telegram's Back while the request runs: the tab is shown.
      window.history.pushState(null, "", "/ru/radars");
      await act(async () => answer(ok({ ask_found: askFound })));

      expect(haptics()).toContain("HapticFeedback.notificationOccurred(success)");
      expect(readResource<Radar[]>(RADARS_PREVIEWS_KEY)?.map((item) => item.id)).toEqual([B]);
      expect(state.back).not.toHaveBeenCalled();
      expect(state.replace).not.toHaveBeenCalled();
    },
  );

  it("delete with ask_found replaces the sheet with the survey; dev016SuccessToastOnDestructive shows «Радар удалён»", async () => {
    seed(radar(A));
    state.deleteRadar.mockResolvedValue(ok({ ask_found: true }));
    withDevFlags({ dev016SuccessToastOnDestructive: true }, (flags) => renderSheet({ flags }));
    await settle();

    await act(async () => fireEvent.click(sheet().querySelector("[data-radar-delete]")!));
    expect(state.replace).toHaveBeenCalledExactlyOnceWith("/radars/found?trigger=delete");
    expect(state.back).not.toHaveBeenCalled();
    expect(currentToast("app")?.message).toEqual({ key: "toast.subDeleted" });
  });

  it("dev016ErrorToastOnFailure alone no longer shows «Радар удалён»", async () => {
    seed(radar(A));
    state.deleteRadar.mockResolvedValue(ok({ ask_found: false }));
    withDevFlags({ dev016ErrorToastOnFailure: true, dev016SuccessToastOnDestructive: false }, (flags) => renderSheet({ flags }));
    await settle();

    await act(async () => fireEvent.click(sheet().querySelector("[data-radar-delete]")!));
    expect(state.back).toHaveBeenCalledTimes(1);
    expect(currentToast("app")).toBeNull();
  });

  it.each([
    [true, { key: "common.saveFailed" }],
    [false, null],
  ] as const)("a failed delete keeps the radar: the error haptic; dev016ErrorToastOnFailure %s, toast %j", async (on, toast) => {
    seed(radar(A));
    state.deleteRadar.mockResolvedValue(failure("server", 500));
    withDevFlags({ dev016ErrorToastOnFailure: on }, (flags) => renderSheet({ flags }));
    await settle();

    await act(async () => fireEvent.click(sheet().querySelector("[data-radar-delete]")!));
    expect(readResource<Radar[]>(RADARS_PREVIEWS_KEY)?.map((item) => item.id)).toEqual([A]);
    expect(haptics()).toContain("HapticFeedback.notificationOccurred(error)");
    expect(currentToast("app")?.message ?? null).toEqual(toast);
    expect(state.back).not.toHaveBeenCalled();
  });

  it("the sheet's switch: a pause with ask_found replaces the sheet with the survey", async () => {
    seed(radar(A));
    state.patchRadar.mockResolvedValue(ok({ radar: plain(A, { active: false }), starter: 0, ask_found: true }));
    renderSheet();
    await settle();

    await act(async () => fireEvent.click(screen.getByRole("switch")));
    expect(state.patchRadar).toHaveBeenCalledExactlyOnceWith({ id: A, active: false }, undefined, "ru");
    expect(state.replace).toHaveBeenCalledExactlyOnceWith("/radars/found?trigger=pause");
    expect(state.push).not.toHaveBeenCalled();
  });

  it("an action answered not_found reads the list again and gives way to the tab", async () => {
    seed(radar(A));
    state.patchRadar.mockResolvedValue(failure("not_found", 404));
    renderSheet();
    await settle();

    await act(async () => fireEvent.click(screen.getByRole("switch")));
    expect(state.sent.filter((call) => call.path === "radars").map((call) => call.query)).toEqual([{ include: "previews" }]);
    expect(state.replace).toHaveBeenCalledWith("/radars");
  });

  it("a radar the loaded list does not hold: replace to the tab once; nothing before the list is there", async () => {
    renderSheet();
    await settle();
    expect(sheet()).not.toBeNull();
    expect(state.replace).not.toHaveBeenCalled();
    expect(dialog().textContent).toContain("Радар");

    cleanup();
    seed(radar(B));
    renderSheet();
    await settle();
    expect(state.replace).toHaveBeenCalledExactlyOnceWith("/radars");
  });

  it("the editor renders next to the sheet, not inside its content, and the sheet stays mounted under it", async () => {
    state.pathname = `/radars/${A}/edit`;
    seed(radar(A));
    renderSheet({ children: <p data-route="radar/edit">editor</p> });
    await settle();
    expect(document.querySelector('[data-route="radar/edit"]')).not.toBeNull();
    expect(sheet().querySelector('[data-route="radar/edit"]')).toBeNull();
    expect(sheet()).not.toBeNull();
  });

  it("a stored return to this radar opens the sheet without the rise and scrolls the tab back; it is forgotten", async () => {
    rememberRadarReturn(A, 480);
    seed(radar(A));
    renderSheet();
    await settle();

    expect(document.querySelector('[data-slot="bottom-sheet"]')?.hasAttribute("data-instant")).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith(0, 480);
    expect(peekRadarReturn(A)).toBeNull();
  });

  it("without a stored return (or one of another radar) the sheet rises and the scroll is left alone", async () => {
    rememberRadarReturn(B, 480);
    seed(radar(A));
    renderSheet();
    await settle();

    expect(document.querySelector('[data-slot="bottom-sheet"]')?.hasAttribute("data-instant")).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(peekRadarReturn(B)).not.toBeNull();
  });

  it("the standalone copy shows only while the address is its own; Back to it opens it without the rise", async () => {
    seed(radar(A, { preview: { items: [previewOf({ number: 100001 })], count: 1, flow: null } }));
    const view = render(withIntl(<RadarSheetRoute id={A} presentation="standalone" />));
    await settle();
    expect(document.querySelector('[data-route="radar"]')?.hasAttribute("data-layer")).toBe(false);

    fireEvent.click(document.querySelector("[data-radar-find]")!);
    state.pathname = "/listing/100001";
    view.rerender(withIntl(<RadarSheetRoute id={A} presentation="standalone" />));
    expect(document.querySelector('[data-route="radar"]')).toBeNull();

    state.pathname = `/radars/${A}`;
    view.rerender(withIntl(<RadarSheetRoute id={A} presentation="standalone" />));
    await settle();
    expect(document.querySelector('[data-route="radar"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="bottom-sheet"]')?.hasAttribute("data-instant")).toBe(true);
    expect(state.replace).not.toHaveBeenCalled();
  });
});
