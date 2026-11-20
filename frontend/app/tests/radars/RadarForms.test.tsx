import { getMessages } from "@homi/i18n";
import { defaultFilters, normalizeFilters, type SearchFilters } from "@homi/search";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Activity, type ReactNode, Suspense } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LiveStats } from "@/features/filters/useLiveStats";
import type { Radar } from "@/features/radars/normalize";
import type { SubscribeOptions, SubscribeResult } from "@/features/radars/subscribe";
import type { ToastScope } from "@/lib/ui/toast";
import type { RadarList } from "@/features/radars/useRadars";
import type { ActionResult } from "@/lib/actions/run";

type Subscribe = (filters: SearchFilters, entry: string, relaxed?: string | null, options?: SubscribeOptions) => Promise<SubscribeResult>;
type SaveEdit = (id: string, filters: SearchFilters, relaxed?: string | null, options?: SubscribeOptions) => Promise<SubscribeResult>;

const state = vi.hoisted(() => ({
  search: "",
  pathname: "/radars/new",
  /** What `currentAddress()` answers: the tests move it to show that the user left the sheet. */
  address: "/ru/radars/new",
  bfcacheId: "open-1",
  back: vi.fn(),
  replace: vi.fn(),
  patchMe: vi.fn(),
  updateSettings: vi.fn<(input: unknown) => Promise<ActionResult<unknown>>>(),
  live: { count: null, flow: null } as LiveStats,
  subscribe: vi.fn<Subscribe>(),
  saveEdit: vi.fn<SaveEdit>(),
  refetch: vi.fn(() => Promise.resolve()),
  list: { radars: undefined, status: "loading", error: null } as Pick<RadarList, "radars" | "status" | "error">,
  listOptions: [] as unknown[],
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/ru/radars/new",
  useSearchParams: () => new URLSearchParams(state.search),
  useRouter: () => ({ bfcacheId: state.bfcacheId }),
}));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@/lib/navigation/address", () => ({ currentAddress: () => state.address }));
vi.mock("@/lib/navigation/useBack", () => ({ useBack: () => ({ canGoBack: true, back: state.back }) }));
vi.mock("@/lib/navigation/nav", () => ({ nav: { replace: (href: string) => state.replace(href) } }));
vi.mock("@/lib/navigation/useLayerState", () => ({ useLayerState: () => ({ value: null, open: vi.fn(), close: vi.fn() }) }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ me: null, status: "ready", patchMe: state.patchMe }) }));
vi.mock("@/lib/actions/settings", () => ({ updateSettings: state.updateSettings }));
vi.mock("@/features/filters/useLiveStats", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/filters/useLiveStats")>()),
  useLiveStats: () => state.live,
}));
/** The flow is `useSubscribe()`'s (tested in `tests/radars/subscribe.test.ts`); the forms only call it. */
vi.mock("@/features/radars/subscribe", () => ({
  useSubscribe: () => ({ subscribe: state.subscribe, saveEdit: state.saveEdit, relax: vi.fn() }),
}));
vi.mock("@/features/radars/match", () => ({ useHasActiveRadar: () => false }));
/** The tab's list (tested in `tests/radars/useRadars.test.tsx`): the editor only looks its radar up in it. */
vi.mock("@/features/radars/useRadars", () => ({
  useRadars: (options: unknown) => {
    state.listOptions.push(options);
    return { ...state.list, refreshing: false, refetch: state.refetch, replace: vi.fn(), remove: vi.fn() };
  },
}));

import { RadarCreateSheet } from "@/features/radars/RadarCreateSheet";
import { RadarEditSheet } from "@/features/radars/RadarEditSheet";
import { resetReference } from "@/lib/reference/useReference";
import { rememberHref } from "@/lib/ui/shellState";

import { cityOf, feedReference } from "../helpers/reference";
import { shownText } from "../helpers/shown";

const ID = "01JD0000000000000000000001";
const OTHER = "01JD0000000000000000000002";
const TASHKENT = cityOf();
const SAMARKAND = cityOf({ code: "samarkand", name: "Самарканд", zones: [], districts: [], has_metro: false, has_median: false });

function radarOf(overrides: Partial<Radar> = {}): Radar {
  return {
    id: ID,
    active: true,
    mode: "instant",
    hidden: 0,
    filters: normalizeFilters({ ...defaultFilters("rent_long", "tashkent"), rooms_min: 2, price_max: 600 }),
    createdAt: null,
    ...overrides,
  };
}

const intl = (children: ReactNode) => (
  <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
    {children}
  </NextIntlClientProvider>
);

function create(presentation: "layer" | "standalone" = "layer") {
  return render(intl(<RadarCreateSheet presentation={presentation} />));
}

const editor = (params: Promise<{ id: string }>, presentation: "layer" | "standalone") =>
  intl(
    <Suspense fallback={null}>
      <RadarEditSheet params={params} presentation={presentation} />
    </Suspense>,
  );

/**
 * The editor reads its id with `use(params)`: the page passes one promise, here already marked fulfilled as React
 * marks a promise it has read (as `tests/listing/ListingLayer.test.tsx` does). `again()` re-renders the same copy.
 */
async function edit(id = ID, presentation: "layer" | "standalone" = "layer") {
  const params = Object.assign(Promise.resolve({ id }), { status: "fulfilled", value: { id } });
  const view = render(editor(params, presentation));
  await act(async () => undefined);
  return { again: () => view.rerender(editor(params, presentation)) };
}

/** The toast scope a failure would use, read as `present()` reads it when the answer arrives. */
function scopeOf(options: SubscribeOptions | undefined): ToastScope {
  const scope = options?.scope ?? "app";
  return typeof scope === "function" ? scope() : scope;
}

/** A copy that `<Activity>` can hide and show again with its state, as Next keeps a cached route. */
const cached = (node: ReactNode, hidden: boolean) => <Activity mode={hidden ? "hidden" : "visible"}>{node}</Activity>;

/** The pending request of a form: resolve it later with `answer`. */
function pending(spy: typeof state.subscribe | typeof state.saveEdit) {
  let answer: (result: SubscribeResult) => void = () => undefined;
  spy.mockReturnValue(new Promise((done) => (answer = done)));
  return { answer: (result: SubscribeResult) => act(async () => answer(result)) };
}

const sheet = () => screen.getByRole("dialog");
const footer = () => sheet().querySelector<HTMLElement>('[data-slot="filters-footer"]')!;
const actions = () => [...footer().querySelectorAll("[data-action]")].map((node) => node.getAttribute("data-action"));
const action = (name: string) => footer().querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!;
const sections = (route: string) =>
  [...sheet().querySelectorAll(`[data-route="${route}"] > [data-section]`)].map((node) => node.getAttribute("data-section"));
const settle = () => act(async () => undefined);
/** The filters and the entry of the one subscribe the sheet asked for. */
function subscribed(): { filters: SearchFilters; entry: string } {
  expect(state.subscribe).toHaveBeenCalledTimes(1);
  const [filters, entry] = state.subscribe.mock.calls[0];
  return { filters, entry };
}

let fake: FakeTelegram | null = null;
const impacts = () => (fake?.calls ?? []).filter((entry) => entry.member === "HapticFeedback.impactOccurred").map((entry) => entry.args[0]);

beforeEach(() => {
  state.search = "city=tashkent";
  state.pathname = "/radars/new";
  state.address = "/ru/radars/new?city=tashkent";
  state.bfcacheId = "open-1";
  state.live = { count: null, flow: null };
  state.list = { radars: [radarOf()], status: "success", error: null };
  state.listOptions.length = 0;
  for (const spy of [state.back, state.replace, state.patchMe, state.updateSettings, state.subscribe, state.saveEdit, state.refetch]) {
    spy.mockClear();
  }
  state.subscribe.mockResolvedValue({ ok: true });
  state.saveEdit.mockResolvedValue({ ok: true });
  feedReference({ cities: [TASHKENT, SAMARKAND], stats: [], reference: { radars_enabled: true } });
  rememberHref("/", "");
  window.localStorage.clear();
  fake = fakeTelegram({ version: "8.0" });
});

afterEach(() => {
  cleanup();
  resetReference();
  rememberHref("/", "");
  fake?.uninstall();
  fake = null;
  vi.restoreAllMocks();
});

describe("RadarForms: titles and buttons per mode (SCR-029, SCR-030)", () => {
  it("new radar: «Новый радар», only «Включить радар», no «Опубликовано»", () => {
    create();

    expect(screen.getByRole("dialog", { name: "Новый радар" }).getAttribute("data-variant")).toBe("full");
    expect(actions()).toEqual(["subscribe"]);
    expect(action("subscribe").textContent).toBe("Включить радар");
    expect(sections("radars/new")).not.toContain("posted");
    expect(sections("radars/new")).toContain("price");
    expect(within(sheet()).queryByRole("button", { name: /Показать/ })).toBeNull();
  });

  it("editor: «Условия радара», only «Сохранить», no «Опубликовано»", async () => {
    await edit();

    expect(screen.getByRole("dialog", { name: "Условия радара" }).getAttribute("data-variant")).toBe("full");
    expect(actions()).toEqual(["save"]);
    expect(action("save").textContent).toBe("Сохранить");
    expect(sections("radar/edit")).not.toContain("posted");
    expect(within(sheet()).queryByRole("button", { name: /Показать/ })).toBeNull();
  });

  it("the copies carry their data-route, with data-layer in @sheet only; the direct load's server HTML holds the new sheet", async () => {
    create("layer");
    expect(sheet().querySelector('[data-route="radars/new"]')?.getAttribute("data-layer")).toBe("sheet");
    cleanup();

    create("standalone");
    expect(sheet().querySelector('[data-route="radars/new"]')?.hasAttribute("data-layer")).toBe(false);
    cleanup();

    const html = renderToString(intl(<RadarCreateSheet presentation="standalone" />));
    expect(html).toContain('data-route="radars/new"');

    await edit(ID, "layer");
    expect(sheet().querySelector('[data-route="radar/edit"]')?.getAttribute("data-layer")).toBe("sheet");
  });

  it.each([
    ["new", null, ""],
    ["new", 14, "Сейчас подходит: 14"],
    ["edit", null, ""],
    ["edit", 3, "Сейчас подходит: 3"],
  ] as const)("%s: the count line with count %s reads «%s»", async (mode, count, text) => {
    state.live = { count, flow: null };
    if (mode === "new") {
      create();
    } else {
      await edit();
    }

    expect(shownText(footer().querySelector('[data-slot="matching-now"]'))).toBe(text);
  });
});

describe("RadarForms: the new radar", () => {
  it("starts from the address's search, city included, and subscribes the draft from the `empty` entry", async () => {
    state.search = "city=samarkand&deal=sale&rooms_min=2";
    create();

    fireEvent.click(action("subscribe"));
    // A failure shows in the sheet while the user is still on it (read when the answer arrives).
    expect(scopeOf(state.subscribe.mock.calls[0][3])).toBe("sheet");
    await settle();
    const { filters, entry } = subscribed();
    expect(filters).toEqual(normalizeFilters({ ...defaultFilters("sale", "samarkand"), rooms_min: 2 }));
    expect(entry).toBe("empty");
    expect(state.subscribe.mock.calls[0][2]).toBeNull();
  });

  it("a bare address starts from the shell's last search", async () => {
    rememberHref("/", "city=samarkand&price_max=500&sort=cheap");
    state.search = "";
    create();

    fireEvent.click(action("subscribe"));
    await settle();
    expect(subscribed().filters).toEqual(normalizeFilters({ ...defaultFilters("rent_long", "samarkand"), price_max: 500 }));
  });

  it.each([
    ["entry=return", "return"],
    ["entry=feed", "feed"],
    ["", "empty"],
    ["entry=filters", "empty"],
    ["entry=prompt", "empty"],
    ["entry=", "empty"],
  ])("the address «%s» creates with the entry %s (BR-APP-073)", async (query, expected) => {
    state.search = `city=tashkent&${query}`;
    create();

    fireEvent.click(action("subscribe"));
    await settle();
    expect(subscribed().entry).toBe(expected);
  });

  it("a medium impact, the button disabled while the request runs, one request for two taps; `ok` closes the sheet", async () => {
    let resolve: (result: SubscribeResult) => void = () => undefined;
    state.subscribe.mockReturnValue(new Promise((done) => (resolve = done)));
    create();

    fireEvent.click(action("subscribe"));
    expect(impacts()).toEqual(["medium"]);
    expect(action("subscribe").disabled).toBe(true);
    fireEvent.click(action("subscribe"));
    expect(state.subscribe).toHaveBeenCalledTimes(1);
    expect(state.back).not.toHaveBeenCalled();

    await act(async () => resolve({ ok: true }));
    expect(state.back).toHaveBeenCalledTimes(1);
  });

  it("a failure keeps the sheet with its draft and gives the button back", async () => {
    state.subscribe.mockResolvedValue({ ok: false });
    state.search = "city=tashkent&rooms_min=3";
    create();

    fireEvent.click(action("subscribe"));
    await settle();
    expect(state.back).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Новый радар" })).toBeTruthy();
    expect(action("subscribe").disabled).toBe(false);

    fireEvent.click(action("subscribe"));
    await settle();
    expect(state.subscribe).toHaveBeenCalledTimes(2);
    expect(state.subscribe.mock.calls[1][0]).toEqual(expect.objectContaining({ rooms_min: 3 }));
  });

  it("a sheet left while the request runs (Back, ×) is not closed again by its `ok`; its failure toast goes to the app's host", async () => {
    const request = pending(state.subscribe);
    create();

    fireEvent.click(action("subscribe"));
    expect(scopeOf(state.subscribe.mock.calls[0][3])).toBe("sheet");
    state.address = "/ru";
    expect(scopeOf(state.subscribe.mock.calls[0][3])).toBe("app");
    await request.answer({ ok: true });
    expect(state.back).not.toHaveBeenCalled();
    expect(action("subscribe").disabled).toBe(false);
  });

  it("a copy hidden while the request runs and shown again is not closed by the old answer", async () => {
    const request = pending(state.subscribe);
    const view = render(cached(intl(<RadarCreateSheet presentation="layer" />), false));

    fireEvent.click(action("subscribe"));
    view.rerender(cached(intl(<RadarCreateSheet presentation="layer" />), true));
    view.rerender(cached(intl(<RadarCreateSheet presentation="layer" />), false));
    expect(action("subscribe").disabled).toBe(false);
    expect(scopeOf(state.subscribe.mock.calls[0][3])).toBe("app");
    await request.answer({ ok: true });
    expect(state.back).not.toHaveBeenCalled();
  });

  it("the standalone copy yields while a @sheet copy shows (a directly loaded picker closed at depth 0) and comes back after it", () => {
    const both = (hidden: boolean) => (
      <>
        {intl(<RadarCreateSheet presentation="standalone" />)}
        {cached(intl(<RadarCreateSheet presentation="layer" />), hidden)}
      </>
    );
    const standalone = () => document.querySelectorAll('[data-route="radars/new"]:not([data-layer])');
    const view = render(intl(<RadarCreateSheet presentation="standalone" />));
    expect(standalone()).toHaveLength(1);

    view.rerender(both(false));
    expect(standalone()).toHaveLength(0);
    expect(document.querySelectorAll('[data-route="radars/new"][data-layer="sheet"]')).toHaveLength(1);

    view.rerender(both(true));
    expect(standalone()).toHaveLength(1);
  });

  it("a relax chip's code goes with the subscribe", async () => {
    state.live = {
      count: 2,
      flow: { week: 1, days: 7, options: [{ code: "price_up", label: "Цена до $700", rate: "≈5 в день", count: 35, filters: { city: "tashkent", price_max: 700 } }] },
    };
    create();

    fireEvent.click(footer().querySelector('[data-relax="price_up"]')!);
    fireEvent.click(action("subscribe"));
    await settle();
    expect(state.subscribe.mock.calls[0][0]).toEqual(expect.objectContaining({ price_max: 700 }));
    expect(state.subscribe.mock.calls[0][2]).toBe("price_up");
  });
});

describe("RadarForms: the editor", () => {
  it("starts from the radar's filters and saves the draft under the radar's id; `ok` closes the editor", async () => {
    await edit();

    fireEvent.click(action("save"));
    expect(impacts()).toEqual(["medium"]);
    expect(scopeOf(state.saveEdit.mock.calls[0][3])).toBe("sheet");
    await settle();
    expect(state.saveEdit).toHaveBeenCalledExactlyOnceWith(ID, radarOf().filters, null, { scope: expect.any(Function), confirm: expect.any(Function) });
    expect(state.back).toHaveBeenCalledTimes(1);
    expect(state.listOptions[0]).toEqual(expect.objectContaining({ previews: true }));
  });

  it("finds its radar in either case of the id", async () => {
    await edit(ID.toLowerCase());

    fireEvent.click(action("save"));
    await settle();
    expect(state.saveEdit.mock.calls[0][0]).toBe(ID);
  });

  it("the button is disabled while saving; a failure keeps the editor open", async () => {
    let resolve: (result: SubscribeResult) => void = () => undefined;
    state.saveEdit.mockReturnValue(new Promise((done) => (resolve = done)));
    await edit();

    fireEvent.click(action("save"));
    expect(action("save").disabled).toBe(true);
    fireEvent.click(action("save"));
    expect(state.saveEdit).toHaveBeenCalledTimes(1);

    await act(async () => resolve({ ok: false }));
    expect(state.back).not.toHaveBeenCalled();
    expect(action("save").disabled).toBe(false);
    expect(screen.getByRole("dialog", { name: "Условия радара" })).toBeTruthy();
  });

  it("an editor left while saving (Back to the radar sheet) is not closed again by its `ok`; its failure toast goes to the app's host", async () => {
    const request = pending(state.saveEdit);
    state.address = `/ru/radars/${ID}/edit`;
    await edit();

    fireEvent.click(action("save"));
    expect(scopeOf(state.saveEdit.mock.calls[0][3])).toBe("sheet");
    state.address = `/ru/radars/${ID}`;
    expect(scopeOf(state.saveEdit.mock.calls[0][3])).toBe("app");
    await request.answer({ ok: true });
    expect(state.back).not.toHaveBeenCalled();
    expect(action("save").disabled).toBe(false);
  });

  it("an editor hidden while saving and shown again is not closed by the old answer", async () => {
    const request = pending(state.saveEdit);
    const params = Object.assign(Promise.resolve({ id: ID }), { status: "fulfilled", value: { id: ID } });
    const view = render(cached(editor(params, "layer"), false));
    await settle();

    fireEvent.click(action("save"));
    view.rerender(cached(editor(params, "layer"), true));
    view.rerender(cached(editor(params, "layer"), false));
    expect(action("save").disabled).toBe(false);
    await request.answer({ ok: true });
    expect(state.back).not.toHaveBeenCalled();
  });

  it("the standalone copy renders only on its own address (Back from a direct load leaves it in `children`)", async () => {
    state.pathname = `/radars/${ID}`;
    state.list = { radars: [radarOf({ id: OTHER })], status: "success", error: null };
    await edit(ID, "standalone");
    expect(document.querySelector('[data-route="radar/edit"]')).toBeNull();
    expect(state.replace).not.toHaveBeenCalled();
    expect(state.listOptions.at(-1)).toEqual(expect.objectContaining({ enabled: false }));
    cleanup();

    state.pathname = `/radars/${ID.toLowerCase()}/edit`;
    state.list = { radars: [radarOf()], status: "success", error: null };
    await edit(ID, "standalone");
    expect(sheet().querySelector('[data-route="radar/edit"]')?.hasAttribute("data-layer")).toBe(false);
  });

  it("before the list is there: the title, a spinner and data-route, no request of its own", async () => {
    state.list = { radars: undefined, status: "loading", error: null };
    await edit();

    const frame = screen.getByRole("dialog", { name: "Условия радара" }).querySelector<HTMLElement>('[data-route="radar/edit"]')!;
    expect(frame.getAttribute("data-state")).toBe("loading");
    expect(within(frame).getByRole("status", { name: "Загрузка…" }).getAttribute("data-slot")).toBe("spinner");
    expect(state.replace).not.toHaveBeenCalled();
    expect(state.refetch).not.toHaveBeenCalled();
  });

  it("a failed list shows its error; «Повторить» reads it again", async () => {
    state.list = { radars: undefined, status: "error", error: { ok: false, error: "offline", status: 0, method: "GET", path: "radars" } };
    await edit();

    expect(sheet().querySelector('[data-route="radar/edit"]')?.getAttribute("data-state")).toBe("error");
    expect(within(sheet()).getByText("Нет связи")).toBeTruthy();
    fireEvent.click(within(sheet()).getByRole("button", { name: /Повторить/ }));
    expect(state.refetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a radar the loaded list does not hold", OTHER],
    ["an id that is no ULID", "nope"],
  ])("%s: one replace to the tab", async (_case, id) => {
    const view = await edit(id);
    view.again();
    await settle();

    expect(state.replace).toHaveBeenCalledExactlyOnceWith("/radars");
    expect(state.saveEdit).not.toHaveBeenCalled();
  });

  it("a radar that leaves the list while the editor is open sends it to the tab", async () => {
    const view = await edit();
    expect(state.replace).not.toHaveBeenCalled();

    state.list = { radars: [radarOf({ id: OTHER })], status: "success", error: null };
    view.again();
    await settle();
    expect(state.replace).toHaveBeenCalledExactlyOnceWith("/radars");
  });
});

describe("RadarForms: radars switched off (DEC-51)", () => {
  it("the new-radar sheet renders nothing and gives way to the tab once", () => {
    feedReference({ cities: [TASHKENT], stats: [], reference: { radars_enabled: false } });
    create();

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector('[data-route="radars/new"]')).toBeNull();
    expect(state.replace).toHaveBeenCalledExactlyOnceWith("/radars");
  });

  it("the editor renders nothing and gives way to the tab once", async () => {
    feedReference({ cities: [TASHKENT], stats: [], reference: { radars_enabled: false } });
    await edit();

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector('[data-route="radar/edit"]')).toBeNull();
    expect(state.replace).toHaveBeenCalledExactlyOnceWith("/radars");
  });

  it("before the reference data is there both still render (the server HTML of a direct load)", async () => {
    feedReference({ cities: [TASHKENT], stats: [], reference: null });
    create();
    expect(document.querySelector('[data-route="radars/new"]')).toBeTruthy();
    cleanup();

    state.list = { radars: undefined, status: "idle", error: null };
    await edit();
    expect(document.querySelector('[data-route="radar/edit"]')).toBeTruthy();
    expect(state.replace).not.toHaveBeenCalled();
  });
});
