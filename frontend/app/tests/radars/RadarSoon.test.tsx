import { getMessages } from "@homi/i18n";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BffOptions } from "@/lib/api/browser";
import type { ApiResult } from "@/lib/api/types";

/** One `bffFetch` the screen sent; the test answers it when it wants. */
interface Sent {
  path: string;
  query: BffOptions["query"];
  resolve: (answer: ApiResult<unknown>) => void;
}

type Call = (input: unknown, auth?: unknown, locale?: string) => Promise<ApiResult<unknown>>;

const state = vi.hoisted(() => ({
  sent: [] as Sent[],
  pathname: "/radars",
  push: vi.fn(),
  replace: vi.fn(),
  tab: vi.fn(),
  back: vi.fn(),
  patchRadar: vi.fn<Call>(),
  deleteRadar: vi.fn<Call>(),
}));
vi.mock("@/lib/api/browser", () => ({
  bffFetch: (path: string, options: BffOptions = {}) =>
    new Promise<ApiResult<unknown>>((resolve) => {
      state.sent.push({ path, query: options.query, resolve });
    }),
}));
vi.mock("@/lib/actions/radars", () => ({ patchRadar: state.patchRadar, deleteRadar: state.deleteRadar }));
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: vi.fn(), reauthenticate: vi.fn(async () => false) }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: "ready", renewed: false, me: null }) }));
vi.mock("@/lib/data/sources", () => ({ reportSource: vi.fn() }));
vi.mock("@/lib/navigation/nav", () => ({
  nav: {
    push: (href: string) => state.push(href),
    replace: (href: string) => state.replace(href),
    tab: (href: string) => state.tab(href),
    back: () => state.back(),
  },
}));
vi.mock("@/lib/navigation/useBack", () => ({ useBack: () => ({ canGoBack: true, back: state.back }) }));
vi.mock("next/navigation", () => ({
  usePathname: () => `/ru${state.pathname}`,
  useSearchParams: () => new URLSearchParams(),
}));
/** The counted `Link` needs the App Router; a plain anchor keeps its address. */
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => state.pathname,
  Link: ({ href, ...props }: ComponentProps<"a"> & { href: string }) => <a href={href} {...props} />,
}));

import { normalizeRadar } from "@/features/radars/normalize";
import { RadarScreen, resetAdoptedRenders } from "@/features/radars/RadarScreen";
import { RadarSheetRoute } from "@/features/radars/RadarSheetRoute";
import { rememberRadarReturn, peekRadarReturn, clearRadarReturn } from "@/features/radars/radarReturn";
import { resetRadarSwitches } from "@/features/radars/RadarTiles";
import { RADARS_PREVIEWS_KEY } from "@/features/radars/useRadars";
import { TopBar } from "@/features/shell/TopBar";
import { readResource, resetResources } from "@/lib/data/useResource";
import { resetReference } from "@/lib/reference/useReference";
import { refreshHandlerFor, rememberHref } from "@/lib/ui/shellState";
import { currentToast, dismissToast } from "@/lib/ui/toast";

import { feedReference } from "../helpers/reference";

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
    preview: { items: [], count: 3, flow: null },
    ...overrides,
  };
}

const ok = (data: unknown): ApiResult<unknown> => ({ ok: true, data, meta: { source: "stub" } });
const DISABLED: ApiResult<never> = { ok: false, error: "radars_disabled", status: 403, code: "radars_disabled", method: "PATCH", path: "radars/:id" };
const radarReads = () => state.sent.filter((call) => call.path === "radars");
const answer = (call: Sent | undefined, value: ApiResult<unknown>) => act(async () => call?.resolve(value));

function withIntl(children: ReactNode) {
  return (
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      {children}
    </NextIntlClientProvider>
  );
}

let renderCount = 0;
/** A server render of its own per call, so every test starts as the first entry of the tab. */
const nextRender = () => `render-${++renderCount}`;

function tab(props: Partial<ComponentProps<typeof RadarScreen>> = {}) {
  return withIntl(
    <>
      <TopBar variant="radars" />
      <RadarScreen renderId={nextRender()} serverOff={false} {...props} />
    </>,
  );
}

const root = () => document.querySelector<HTMLElement>('[data-route="radars"]')!;
const radarState = () => root().querySelector<HTMLElement>("[data-radar-state]")?.dataset.radarState ?? null;
const plus = () => screen.queryByRole("link", { name: "Новый радар" });

let fake: FakeTelegram | null = null;

beforeEach(() => {
  fake = fakeTelegram({ version: "8.0" });
  state.sent.length = 0;
  state.pathname = "/radars";
  for (const mock of [state.push, state.replace, state.tab, state.back, state.patchRadar, state.deleteRadar]) {
    mock.mockReset();
  }
  resetResources();
  resetAdoptedRenders();
  resetRadarSwitches();
  clearRadarReturn();
  dismissToast("app");
  rememberHref("/", "");
});

afterEach(() => {
  cleanup();
  resetReference();
  fake?.uninstall();
  fake = null;
});

describe("the radar tab while radars are switched off (DEC-51, SCR-026)", () => {
  it.each([
    ["radars_enabled false", { radars_enabled: false }],
    ["radars_enabled missing", {}],
  ])("%s: the two texts, no button, no «+», no radar request, a pull does nothing", (_, reference) => {
    feedReference({ reference });
    render(tab());

    expect(radarState()).toBe("soon");
    expect(root().textContent).toContain("Радар скоро заработает");
    expect(root().textContent).toContain("Мы включим уведомления о новых объявлениях в ближайшее время.");
    expect(root().querySelectorAll("button, a")).toHaveLength(0);
    expect(root().querySelector("[data-radar-animation]")).toBeNull();
    expect(plus()).toBeNull();
    expect(state.sent).toEqual([]);
    expect(refreshHandlerFor("/radars")).toBeUndefined();
  });

  it("before the reference data reaches the client the server's view decides; nothing is requested either way", () => {
    feedReference({ reference: null });
    const view = render(tab({ serverOff: true }));
    expect(radarState()).toBe("soon");

    view.unmount();
    render(tab({ serverOff: false }));
    expect(radarState()).toBe("loading");
    expect(state.sent).toEqual([]);
    expect(refreshHandlerFor("/radars")).toBeDefined();
  });

  it("the reference data wins over the server's view once it is there", async () => {
    feedReference({ reference: { radars_enabled: true } });
    render(tab({ serverOff: true }));

    expect(radarState()).toBe("loading");
    expect(radarReads().map((call) => call.query)).toEqual([{ include: "previews" }]);
    await answer(radarReads()[0], ok([]));
    expect(radarState()).toBe("empty");
  });

  it("radars_enabled true: the normal tab — one request with the previews, «+», the empty state's button, a pull reads again", async () => {
    feedReference({ reference: { radars_enabled: true } });
    render(tab());

    expect(plus()).not.toBeNull();
    expect(radarState()).toBe("loading");
    expect(radarReads().map((call) => call.query)).toEqual([{ include: "previews" }]);
    await answer(radarReads()[0], ok([]));

    expect(radarState()).toBe("empty");
    expect(root().querySelector('[data-radar-state="empty"] [data-radar-animation]')).not.toBeNull();
    rememberHref("/", "deal=sale&rooms_min=2");
    fireEvent.click(screen.getByRole("button", { name: "Включить радар" }));
    expect(state.push).toHaveBeenCalledExactlyOnceWith("/radars/new?deal=sale&rooms_min=2");
    const pull = refreshHandlerFor("/radars")!();
    expect(radarReads()).toHaveLength(2);
    await answer(radarReads()[1], ok([raw(A)]));
    await pull;
    expect(root().querySelectorAll("[data-radar-tile]")).toHaveLength(1);
  });

  it("the radar sheet address with radars off: one replace to the tab and nothing rendered", () => {
    feedReference({ reference: { radars_enabled: false } });
    state.pathname = `/radars/${A}`;
    const { container } = render(withIntl(<RadarSheetRoute id={A} presentation="layer" />));

    expect(state.replace).toHaveBeenCalledExactlyOnceWith("/radars");
    expect(container.innerHTML).toBe("");
    expect(document.querySelector('[data-route="radar"]')).toBeNull();
    expect(state.sent).toEqual([]);
  });

  it("a switch answered radars_disabled although the reference said on: reverted, «Радар скоро заработает», the error haptic", async () => {
    feedReference({ reference: { radars_enabled: true } });
    render(tab({ initial: [normalizeRadar(raw(A))!] }));
    let settle: (value: ApiResult<unknown>) => void = () => undefined;
    state.patchRadar.mockImplementation(() => new Promise((resolve) => (settle = resolve)));

    const toggle = screen.getByRole("switch", { name: "Присылать в чат" });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(state.patchRadar).toHaveBeenCalledWith({ id: A, active: false }, undefined, "ru");

    await act(async () => settle(DISABLED));
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
    expect(readResource<{ active: boolean }[]>(RADARS_PREVIEWS_KEY)?.[0].active).toBe(true);
    expect(currentToast("app")?.message).toEqual({ key: "radar.soon.title" });
    expect(fake?.calls.some((call) => call.member === "HapticFeedback.notificationOccurred" && call.args[0] === "error")).toBe(true);
  });
});

describe("the radar tab's states and actions (SCR-026)", () => {
  beforeEach(() => {
    feedReference({ reference: { radars_enabled: true } });
  });

  it("a failed list with nothing cached: the tall error state; «Повторить» reads again", async () => {
    render(tab());
    await answer(radarReads()[0], { ok: false, error: "offline", status: 0, method: "GET", path: "radars" });

    expect(root().querySelector('[data-slot="error-state"]')?.getAttribute("data-kind")).toBe("offline");
    expect(root().textContent).toContain("Нет связи");
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(radarReads()).toHaveLength(2);
    await answer(radarReads()[1], ok([raw(A)]));
    expect(root().querySelectorAll("[data-radar-tile]")).toHaveLength(1);
  });

  it("a server error state reads «Не загрузилось»", async () => {
    render(tab());
    await answer(radarReads()[0], { ok: false, error: "server", status: 500, method: "GET", path: "radars" });
    expect(root().textContent).toContain("Не загрузилось");
    expect(root().querySelector('[data-slot="error-state"]')?.getAttribute("data-kind")).toBe("server");
  });

  it("the server's read renders the tiles at once, with no request; a tile tap is a light impact and pushes its sheet", () => {
    rememberRadarReturn(B, 120);
    render(tab({ initial: [normalizeRadar(raw(A))!, normalizeRadar(raw(B, { active: false }))!] }));

    expect(radarReads()).toHaveLength(0);
    expect(root().querySelectorAll("[data-radar-tile]")).toHaveLength(2);
    fireEvent.click(document.querySelector(`[data-radar-tile="${B}"] [data-radar-open]`)!);
    expect(state.push).toHaveBeenCalledExactlyOnceWith(`/radars/${B}`);
    // A tile tap opens the sheet with its rise: a stored return is forgotten.
    expect(peekRadarReturn(B)).toBeNull();
    expect(fake?.calls.filter((call) => call.member === "HapticFeedback.impactOccurred").map((call) => call.args[0])).toEqual(["light"]);
  });

  it("a new server render of the tab is adopted; the same render shown again changes nothing", () => {
    const first = nextRender();
    const view = render(withIntl(<RadarScreen renderId={first} serverOff={false} initial={[normalizeRadar(raw(A))!]} />));
    expect(root().querySelectorAll("[data-radar-tile]")).toHaveLength(1);

    const second = nextRender();
    view.rerender(withIntl(<RadarScreen renderId={second} serverOff={false} initial={[normalizeRadar(raw(A))!, normalizeRadar(raw(B))!]} />));
    expect(root().querySelectorAll("[data-radar-tile]")).toHaveLength(2);

    view.rerender(withIntl(<RadarScreen renderId={first} serverOff={false} initial={[normalizeRadar(raw(A))!]} />));
    expect(root().querySelectorAll("[data-radar-tile]")).toHaveLength(2);
    expect(radarReads()).toHaveLength(0);
  });

  it("a new render without a server read (header mode) reads the list again through /bff, over what is shown", async () => {
    const view = render(withIntl(<RadarScreen renderId={nextRender()} serverOff={false} />));
    await answer(radarReads()[0], ok([raw(A)]));
    expect(radarReads()).toHaveLength(1);

    view.rerender(withIntl(<RadarScreen renderId={nextRender()} serverOff={false} />));
    expect(radarReads()).toHaveLength(2);
    expect(root().querySelectorAll("[data-radar-tile]")).toHaveLength(1);
  });

  it("switching on with starter > 0: «Радар снова включён. {count}, которые вы не видели, — в чате с ботом»", async () => {
    render(tab({ initial: [normalizeRadar(raw(A, { active: false }))!] }));
    const answer = raw(A, { active: true });
    delete answer.preview;
    state.patchRadar.mockResolvedValue(ok({ radar: answer, starter: 3, ask_found: false }));

    await act(async () => fireEvent.click(screen.getByRole("switch")));
    expect(state.patchRadar).toHaveBeenCalledExactlyOnceWith({ id: A, active: true }, undefined, "ru");
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
    expect(currentToast("app")?.message).toEqual({ key: "subs.resumed", values: { count: "3 объявления" } });
    expect(state.push).not.toHaveBeenCalled();
  });

  it("a pause answered with ask_found pushes the survey from a tile", async () => {
    render(tab({ initial: [normalizeRadar(raw(A))!] }));
    state.patchRadar.mockResolvedValue(ok({ radar: raw(A, { active: false }), starter: 0, ask_found: true }));

    await act(async () => fireEvent.click(screen.getByRole("switch")));
    expect(state.push).toHaveBeenCalledExactlyOnceWith("/radars/found?trigger=pause");
    expect(state.replace).not.toHaveBeenCalled();
    expect(currentToast("app")).toBeNull();
  });

  it("no_chat on switching on: reverted, «Радар не включён — …»", async () => {
    render(tab({ initial: [normalizeRadar(raw(A, { active: false }))!] }));
    state.patchRadar.mockResolvedValue({ ok: false, error: "conflict", status: 409, code: "no_chat", method: "PATCH", path: "radars/:id" });

    await act(async () => fireEvent.click(screen.getByRole("switch")));
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
    expect(currentToast("app")?.message).toEqual({ key: "toast.noChat" });
  });

  it("any other failure reverts with the error haptic and no toast (legacy); a second press while one runs is ignored", async () => {
    render(tab({ initial: [normalizeRadar(raw(A))!] }));
    let settle: (value: ApiResult<unknown>) => void = () => undefined;
    state.patchRadar.mockImplementation(() => new Promise((resolve) => (settle = resolve)));

    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("switch"));
    expect(state.patchRadar).toHaveBeenCalledTimes(1);
    await act(async () => settle({ ok: false, error: "source_unavailable", status: 503, code: "source_unavailable", method: "PATCH", path: "radars/:id" }));

    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
    expect(currentToast("app")).toBeNull();
    expect(fake?.calls.some((call) => call.member === "HapticFeedback.notificationOccurred" && call.args[0] === "error")).toBe(true);
  });
});
