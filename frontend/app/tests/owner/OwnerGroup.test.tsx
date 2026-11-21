import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  backBy: vi.fn(async () => 1),
  track: vi.fn(),
  owner: { pending: 0, has_listings: true, waitlisted: false } as { pending: number; has_listings: boolean; waitlisted: boolean },
  list: null as unknown,
  where: "settings",
  reads: 0,
}));

vi.mock("@/lib/session/SessionProvider", () => {
  const session = () => ({ status: "ready", me: { owner: state.owner } });
  return { useSession: session, useOptionalSession: session };
});
vi.mock("@/lib/session/bootstrap", () => ({ refresh: vi.fn(async () => undefined), reauthenticate: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({
  bffFetch: async () => {
    state.reads += 1;
    return state.list === null ? { ok: false, error: "server", status: 500, method: "GET", path: "owner/listings" } : { ok: true, data: state.list, meta: { source: "stub" } };
  },
}));
vi.mock("@/lib/navigation/nav", () => ({ nav: { push: state.push, replace: state.replace, back: state.back, tab: vi.fn() } }));
vi.mock("@/lib/navigation/history", () => ({ backBy: state.backBy }));
vi.mock("@/lib/analytics/events", () => ({ track: state.track }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(`where=${state.where}`) }));
vi.mock("@/features/shell/RouteSheet", () => ({
  RouteSheet: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div data-sheet-title={title}>{children}</div>
  ),
}));

import { OwnerLimitSheet } from "@/features/owner/OwnerLimitSheet";
import { OwnerGroup } from "@/features/owner/settings/OwnerGroup";
import { resetResources } from "@/lib/data/useResource";
import { resetReference } from "@/lib/reference/useReference";

import { feedReference } from "../helpers/reference";
import { withIntl } from "../settings/harness";

let fake: FakeTelegram | null = null;
const row = (id: string) => document.querySelector<HTMLButtonElement>(`[data-settings-row="${id}"]`);
const valueOf = (id: string) => row(id)?.querySelector("[data-settings-value]")?.textContent ?? null;

const item = (status: string, fields: Record<string, unknown> = {}) => ({ id: `01JF00000000000000000000${status.length}${Object.keys(fields).length}`, status, withdrawn: false, held: false, form: {}, photos: [], stats: null, ...fields });
const listOf = (items: unknown[], canAdd = true) => ({ items, max: 2, can_add: canAdd, past: 0 });

async function mount(cabinetOn: boolean) {
  feedReference({ reference: { owner_enabled: cabinetOn, owner: { listings_limit: 2, photos_limit: 10 } } as never });
  render(withIntl(<OwnerGroup />));
  await act(async () => undefined);
}

beforeEach(() => {
  for (const mock of [state.push, state.replace, state.back, state.backBy, state.track]) {
    mock.mockClear();
  }
  state.owner = { pending: 0, has_listings: true, waitlisted: false };
  state.list = listOf([item("active")]);
  state.reads = 0;
  resetResources();
  fake = fakeTelegram({ version: "8.0" });
});

afterEach(() => {
  cleanup();
  resetReference();
  fake?.uninstall();
  fake = null;
});

describe("OwnerGroup × the cabinet switch × has_listings (WP-82, SCR-032, DEC-81)", () => {
  it.each([
    [true, true, ["owner-new", "owner-mine"], 1],
    [true, false, ["owner-new"], 0],
    [false, true, ["owner-mine"], 1],
    [false, false, [], 0],
  ])("cabinet %s, has listings %s → rows %j, %i list read", async (cabinetOn, hasListings, rows, reads) => {
    state.owner = { pending: 0, has_listings: hasListings, waitlisted: false };
    await mount(cabinetOn);

    expect([...document.querySelectorAll("[data-settings-row]")].map((node) => node.getAttribute("data-settings-row"))).toEqual(rows);
    expect(document.querySelector('[data-settings-group="owner"]') !== null).toBe(rows.length > 0);
    // Default (a): the list is read only for a user with listings.
    expect(state.reads).toBe(reads);
  });
});

describe("OwnerGroup rows", () => {
  it("«Сдать квартиру»: «Бесплатно» and the form; at the limit «2 из 2» and the limit sheet", async () => {
    await mount(true);
    expect(valueOf("owner-new")).toBe("Бесплатно");
    fireEvent.click(row("owner-new")!);
    expect(state.push).toHaveBeenLastCalledWith("/owner/new");

    cleanup();
    resetResources();
    state.list = listOf([item("active"), item("paused")], false);
    await mount(true);
    expect(valueOf("owner-new")).toBe("2 из 2");
    fireEvent.click(row("owner-new")!);
    expect(state.push).toHaveBeenLastCalledWith("/owner/limit?where=settings");
  });

  it("a failed list read is silent: «Бесплатно», the form", async () => {
    state.list = null;
    await mount(true);
    expect(valueOf("owner-new")).toBe("Бесплатно");
  });

  it("«Мои объявления»: the red counter of the pending requests, named by «ждут ответа: N»", async () => {
    state.owner = { pending: 3, has_listings: true, waitlisted: false };
    await mount(true);
    const counter = row("owner-mine")?.querySelector("[data-settings-count]");
    expect(counter?.textContent).toBe("3");
    expect(counter?.getAttribute("aria-label")).toBe("ждут ответа: 3");
    fireEvent.click(row("owner-mine")!);
    expect(state.push).toHaveBeenLastCalledWith("/settings/owner");
  });

  it("«Мои объявления» without pending: the running listings, else «Черновик», else empty", async () => {
    state.list = listOf([item("active"), item("paused"), item("draft")]);
    await mount(true);
    expect(valueOf("owner-mine")).toBe("2");

    cleanup();
    resetResources();
    state.list = listOf([item("draft"), item("rented")]);
    await mount(true);
    expect(valueOf("owner-mine")).toBe("Черновик");

    cleanup();
    resetResources();
    state.list = listOf([item("rented")]);
    await mount(true);
    expect(valueOf("owner-mine")).toBeNull();
  });
});

describe("OwnerLimitSheet (SCR-049, BR-APP-089)", () => {
  it("from settings: «Мои объявления» goes back over the sheet, then pushes the list; the event names where", async () => {
    state.where = "settings";
    feedReference({ reference: { owner_enabled: true } as never });
    render(withIntl(<OwnerLimitSheet presentation="layer" />));
    await act(async () => undefined);

    expect(document.querySelector("[data-sheet-title]")?.getAttribute("data-sheet-title")).toBe("Сдаются 2 из 2 квартир");
    expect(state.track).toHaveBeenCalledWith("owner_limit_sheet", { where: "settings" });
    await act(async () => fireEvent.click(document.querySelector('[data-action="mine"]')!));
    expect(state.backBy).toHaveBeenCalledWith(1);
    expect(state.push).toHaveBeenCalledWith("/settings/owner");
  });

  it("a direct load (no step behind) replaces the sheet with the list", async () => {
    state.where = "settings";
    state.backBy.mockResolvedValueOnce(0);
    render(withIntl(<OwnerLimitSheet presentation="standalone" />));
    await act(async () => fireEvent.click(document.querySelector('[data-action="mine"]')!));
    expect(state.replace).toHaveBeenCalledWith("/settings/owner");
  });

  it("from the list: «Понятно» goes back", async () => {
    state.where = "mine";
    render(withIntl(<OwnerLimitSheet presentation="layer" />));
    fireEvent.click(document.querySelector('[data-action="ok"]')!);
    expect(state.back).toHaveBeenCalled();
    expect(state.track).toHaveBeenCalledWith("owner_limit_sheet", { where: "mine" });
  });
});
