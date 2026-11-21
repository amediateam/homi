import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  push: vi.fn(),
  tab: vi.fn(),
  track: vi.fn(),
  share: vi.fn(async () => undefined),
  list: { ok: true, data: { items: [], max: 2, can_add: true, past: 0 }, meta: { source: "stub" } } as unknown,
  hold: null as Promise<void> | null,
  owners: null as string | null,
}));

vi.mock("@/lib/session/bootstrap", () => ({ refresh: vi.fn(async () => undefined), reauthenticate: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({
  bffFetch: async () => {
    await state.hold;
    return state.list;
  },
}));
vi.mock("@/lib/navigation/nav", () => ({
  nav: {
    push: state.push,
    tab: (href: string) => {
      state.tab(href);
      window.history.replaceState(null, "", `/ru${href}`);
    },
    replace: vi.fn(),
    back: vi.fn(),
  },
}));
vi.mock("@/lib/analytics/events", () => ({ track: state.track }));
vi.mock("@/lib/brand", async (original) => {
  const actual = (await original()) as { brand: { links: Record<string, unknown> } };
  return {
    brand: {
      ...actual.brand,
      // Read at each use, so a test can drop the bot name.
      get botUsername() {
        return process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "";
      },
      links: {
        ...actual.brand.links,
        get owners() {
          return { ru: state.owners, uz: state.owners, en: state.owners };
        },
      },
    },
  };
});

import { LandlordBlock } from "@/features/owner/entry/LandlordBlock";
import { OwnerEntryLine, OwnerEntryRow } from "@/features/owner/entry/OwnerEntry";
import { resetResources } from "@/lib/data/useResource";
import { resetReference } from "@/lib/reference/useReference";

import { feedReference } from "../helpers/reference";
import { withIntl } from "../settings/harness";

let fake: FakeTelegram | null = null;

function mount(node: React.ReactNode, cabinetOn = true) {
  feedReference({ reference: { owner_enabled: cabinetOn } as never });
  render(withIntl(node));
}

beforeEach(() => {
  for (const mock of [state.push, state.tab, state.track, state.share]) {
    mock.mockClear();
  }
  state.list = { ok: true, data: { items: [], max: 2, can_add: true, past: 0 }, meta: { source: "stub" } };
  state.hold = null;
  state.owners = null;
  resetResources();
  window.history.replaceState(null, "", "/ru");
  fake = fakeTelegram({ version: "8.0" });
  vi.stubEnv("NEXT_PUBLIC_TELEGRAM_BOT_USERNAME", "homi_bot");
});

afterEach(() => {
  cleanup();
  resetReference();
  fake?.uninstall();
  fake = null;
  vi.unstubAllEnvs();
});

describe("the invitations into the cabinet (WP-82, BR-APP-115, DEC-89)", () => {
  it("render nothing while the cabinet is off", () => {
    mount(
      <>
        <OwnerEntryRow />
        <OwnerEntryLine src="empty" />
        <OwnerEntryLine src="listing" />
      </>,
      false,
    );
    expect(document.querySelector("[data-owner-entry]")).toBeNull();
  });

  it("the row and the two lines with their texts", () => {
    mount(
      <>
        <OwnerEntryRow />
        <OwnerEntryLine src="empty" />
        <OwnerEntryLine src="listing" />
      </>,
    );
    expect(document.querySelector('[data-owner-entry="feed_end"]')?.textContent).toBe("Сдаёте квартиру? Разместите бесплатно");
    expect(document.querySelector('[data-owner-entry="empty"]')?.textContent).toBe("Сдаёте квартиру? Разместите бесплатно ›");
    expect(document.querySelector('[data-owner-entry="listing"]')?.textContent).toBe("Тоже сдаёте квартиру? Разместите бесплатно ›");
  });

  it("a tap: the event with its src, then a new form while the account can add one", async () => {
    mount(<OwnerEntryRow />);
    await act(async () => fireEvent.click(document.querySelector('[data-owner-entry="feed_end"]')!));
    expect(state.track).toHaveBeenCalledWith("owner_entry", { src: "feed_end" });
    expect(state.push).toHaveBeenCalledWith("/owner/new");
  });

  it("a full account presses Settings, then opens «Мои объявления»; an error opens a new form", async () => {
    state.list = { ok: true, data: { items: [], max: 2, can_add: false, past: 0 }, meta: { source: "stub" } };
    mount(<OwnerEntryLine src="listing" />);
    await act(async () => fireEvent.click(document.querySelector('[data-owner-entry="listing"] button')!));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    expect(state.tab).toHaveBeenCalledWith("/settings");
    expect(state.push).toHaveBeenCalledWith("/settings/owner");

    cleanup();
    state.push.mockClear();
    state.list = { ok: false, error: "offline", status: 0, method: "GET", path: "owner/listings" };
    mount(<OwnerEntryLine src="empty" />);
    await act(async () => fireEvent.click(document.querySelector('[data-owner-entry="empty"] button')!));
    expect(state.push).toHaveBeenCalledWith("/owner/new");
  });

  it("a tap right after a fast opening opens nothing twice (review)", async () => {
    mount(<OwnerEntryRow />);
    const row = document.querySelector('[data-owner-entry="feed_end"]')!;
    await act(async () => fireEvent.click(row));
    await act(async () => fireEvent.click(row));
    expect(state.push).toHaveBeenCalledTimes(1);
    expect(state.track).toHaveBeenCalledTimes(1);
  });

  it("a double tap opens once and sends one event (fix of LB-APP-084)", async () => {
    let release = () => undefined as void;
    state.hold = new Promise<void>((resolve) => (release = resolve));
    mount(<OwnerEntryRow />);
    const row = document.querySelector('[data-owner-entry="feed_end"]')!;
    fireEvent.click(row);
    fireEvent.click(row);
    await act(async () => release());
    expect(state.track).toHaveBeenCalledTimes(1);
    expect(state.push).toHaveBeenCalledTimes(1);
  });
});

describe("the survey's landlord block (BR-APP-116, DEC-91)", () => {
  const buttons = () => [...document.querySelectorAll("[data-landlord-to]")].map((node) => [node.getAttribute("data-landlord-to"), node.textContent]);

  it("renders nothing while the cabinet is off", () => {
    mount(<LandlordBlock src="homi" />, false);
    expect(document.querySelector("[data-landlord]")).toBeNull();
  });

  it("without the owners' page: one «Отправить хозяину» with the bot message", async () => {
    const shared = vi.spyOn(await import("@/lib/telegram").then((module) => module.tg), "shareText").mockResolvedValue();
    mount(<LandlordBlock src="elsewhere" />);
    expect(document.querySelector("[data-landlord]")?.textContent).toContain("Съезжаете со старой квартиры?");
    expect(buttons()).toEqual([["bot", "Отправить хозяину"]]);
    fireEvent.click(document.querySelector('[data-landlord-to="bot"]')!);
    expect(state.track).toHaveBeenCalledWith("landlord_share", { src: "elsewhere", to: "bot" });
    expect(shared).toHaveBeenCalledWith(expect.stringMatching(/^Здравствуйте! Я съезжаю\..*https:\/\/t\.me\/homi_bot\?start=owner_new$/));
    shared.mockRestore();
  });

  it("with the owners' page: the page with ?s=tenant, and the bot link as the second button", async () => {
    state.owners = "https://homi.uz/ru/owners";
    const shared = vi.spyOn(await import("@/lib/telegram").then((module) => module.tg), "shareText").mockResolvedValue();
    mount(<LandlordBlock src="homi" />);
    expect(buttons()).toEqual([
      ["page", "Отправить хозяину"],
      ["bot", "Отправить ссылку на бота"],
    ]);
    fireEvent.click(document.querySelector('[data-landlord-to="page"]')!);
    expect(shared).toHaveBeenCalledWith(expect.stringContaining("https://homi.uz/ru/owners?s=tenant"));
    expect(state.track).toHaveBeenCalledWith("landlord_share", { src: "homi", to: "page" });
    shared.mockRestore();
  });

  it("with neither a page nor a bot there is no block", () => {
    vi.stubEnv("NEXT_PUBLIC_TELEGRAM_BOT_USERNAME", "");
    mount(<LandlordBlock src="homi" />);
    expect(document.querySelector("[data-landlord]")).toBeNull();
  });
});
