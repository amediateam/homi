import { getMessages } from "@homi/i18n";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Activity, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FoundInput, FoundWhereInput } from "@/lib/actions/surveys";
import type { ApiResult } from "@/lib/api/types";

const state = vi.hoisted(() => ({
  search: "trigger=pause",
  bot: null as string | null,
  back: vi.fn(),
  replace: vi.fn(),
  sendFound: vi.fn<(input: FoundInput) => Promise<ApiResult<null>>>(),
  sendFoundWhere: vi.fn<(input: FoundWhereInput) => Promise<ApiResult<null>>>(),
  locales: [] as string[],
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/ru/radars/found",
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => "/radars/found" }));
vi.mock("@/lib/navigation/useBack", () => ({ useBack: () => ({ canGoBack: true, back: state.back }) }));
vi.mock("@/lib/navigation/nav", () => ({ nav: { replace: (href: string) => state.replace(href) } }));
vi.mock("@/lib/actions/surveys", () => ({ sendFound: state.sendFound, sendFoundWhere: state.sendFoundWhere }));
/** `invokeAction` is tested in `tests/actions/useAction.test.tsx`; here it only passes the input to the action. */
vi.mock("@/lib/actions/useAction", () => ({
  invokeAction: (action: (input: unknown) => Promise<unknown>, input: unknown, locale: string) => {
    state.locales.push(locale);
    return action(input);
  },
}));
vi.mock("@/lib/deeplinks/build", () => ({
  botStartUrl: (payload: string) => (state.bot === null ? null : `https://t.me/${state.bot}?start=${payload}`),
}));

import { FoundSheet } from "@/features/radars/FoundSheet";
import { tg } from "@/lib/telegram";
import { resetReference } from "@/lib/reference/useReference";
import { currentToast, dismissToast } from "@/lib/ui/toast";

import { feedReference } from "../helpers/reference";

const OK: ApiResult<null> = { ok: true, data: null, meta: {} } as ApiResult<null>;

const intl = (children: ReactNode) => (
  <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
    {children}
  </NextIntlClientProvider>
);

const survey = (presentation: "layer" | "standalone" = "layer") => intl(<FoundSheet presentation={presentation} />);

const sheet = () => screen.getByRole("dialog");
const content = () => sheet().querySelector<HTMLElement>('[data-route="radars/found"]')!;
const step = () => content().getAttribute("data-step");
const rows = (kind: "found" | "where") => [...content().querySelectorAll(`[data-${kind}]`)].map((row) => row.getAttribute(`data-${kind}`));
const tap = (kind: "found" | "where", code: string) => fireEvent.click(content().querySelector(`[data-${kind}="${code}"]`)!);
const toastKey = () => {
  const message = currentToast("app")?.message;
  return typeof message === "object" && message !== null && "key" in message ? message.key : null;
};

let fake: FakeTelegram | null = null;
const haptics = () =>
  (fake?.calls ?? [])
    .filter((entry) => entry.member.startsWith("HapticFeedback."))
    .map((entry) => `${entry.member.slice("HapticFeedback.".length)}:${String(entry.args[0])}`);

beforeEach(() => {
  state.search = "trigger=pause";
  state.bot = null;
  state.locales.length = 0;
  for (const spy of [state.back, state.replace, state.sendFound, state.sendFoundWhere]) {
    spy.mockReset();
  }
  state.sendFound.mockResolvedValue(OK);
  state.sendFoundWhere.mockResolvedValue(OK);
  feedReference({ reference: { radars_enabled: true } });
  fake = fakeTelegram({ version: "8.0" });
});

afterEach(() => {
  cleanup();
  dismissToast("app");
  resetReference();
  fake?.uninstall();
  fake = null;
  vi.restoreAllMocks();
});

describe("FoundSheet: the question (SCR-031)", () => {
  it("«Нашли жильё?» with its text and the four answers; no ×", () => {
    render(survey());

    expect(screen.getByRole("dialog", { name: "Нашли жильё?" })).toBeTruthy();
    expect(within(sheet()).getByText("Подскажите одной кнопкой — так мы поймём, помогает ли HOMI искать.")).toBeTruthy();
    expect(rows("found")).toEqual(["homi", "elsewhere", "searching", "stopped"]);
    expect(within(content()).getByRole("button", { name: "Да, через HOMI" })).toBeTruthy();
    expect(sheet().querySelector('[data-slot="bottom-sheet-close"]')).toBeNull();
    expect(step()).toBe("ask");
    expect(content().getAttribute("data-layer")).toBe("sheet");
  });

  it("each row carries the legacy icon in its 38 px disc", () => {
    render(survey());
    const icons = () =>
      [...content().querySelectorAll("button svg")].map((icon) => [...icon.classList].find((name) => name.startsWith("lucide-")));
    expect(icons()).toEqual(["lucide-party-popper", "lucide-house", "lucide-search", "lucide-ban"]);

    tap("found", "elsewhere");
    expect(icons()).toEqual([
      "lucide-send",
      "lucide-shopping-bag",
      "lucide-globe",
      "lucide-handshake",
      "lucide-users",
      "lucide-signpost",
      "lucide-ellipsis",
    ]);
  });

  it("the direct load renders in place, already in the server HTML", () => {
    const html = renderToString(survey("standalone"));
    expect(html).toContain('data-route="radars/found"');
    expect(html).toContain('data-found="homi"');

    render(survey("standalone"));
    expect(content().hasAttribute("data-layer")).toBe(false);
  });

  it.each([
    ["searching", "found.thanksSearching"],
    ["stopped", "found.thanksStopped"],
  ] as const)("«%s»: sends the answer with the trigger, closes, then the thank-you toast %s", (answer, key) => {
    state.search = "trigger=delete";
    render(survey());

    tap("found", answer);
    expect(state.sendFound).toHaveBeenCalledExactlyOnceWith({ answer, trigger: "delete" });
    expect(state.locales).toEqual(["ru"]);
    expect(state.back).toHaveBeenCalledTimes(1);
    expect(toastKey()).toBe(key);
    expect(haptics()).toEqual(["impactOccurred:light"]);
  });

  it("«Да, через HOMI»: the `homi` code, a light impact and the success haptic, then the congratulations", () => {
    render(survey());

    tap("found", "homi");
    expect(state.sendFound).toHaveBeenCalledExactlyOnceWith({ answer: "homi", trigger: "pause" });
    expect(haptics()).toEqual(["impactOccurred:light", "notificationOccurred:success"]);
    expect(state.back).not.toHaveBeenCalled();
    expect(step()).toBe("done");
    expect(screen.getByRole("dialog", { name: "Поздравляем с новосельем!" })).toBeTruthy();
    const image = content().querySelector("img")!;
    expect(image.getAttribute("src")).toBe("/brand/hooray.svg");
    expect([image.getAttribute("width"), image.getAttribute("height")]).toEqual(["132", "132"]);
    expect(within(content()).getByText(/Если HOMI помог/)).toBeTruthy();
    expect(toastKey()).toBeNull();
  });

  it("«Да, в другом месте»: «Где нашли?» with the seven places in order, the body scrolled to the top", () => {
    render(survey());
    const body = sheet().querySelector<HTMLElement>('[data-slot="bottom-sheet-body"]')!;
    body.scrollTop = 120;

    tap("found", "elsewhere");
    expect(state.sendFound).toHaveBeenCalledExactlyOnceWith({ answer: "elsewhere", trigger: "pause" });
    expect(step()).toBe("where");
    expect(screen.getByRole("dialog", { name: "Где нашли?" })).toBeTruthy();
    expect(rows("where")).toEqual(["telegram", "olx", "site", "agent", "friends", "street", "other"]);
    expect(within(content()).getByRole("button", { name: "Другой сайт (Uybor, Uysot…)" })).toBeTruthy();
    expect(body.scrollTop).toBe(0);
    expect(state.back).not.toHaveBeenCalled();
  });
});

describe("FoundSheet: where it was found", () => {
  it.each(["telegram", "olx", "site", "agent", "friends", "street", "other"] as const)(
    "«%s»: sends the code, closes, «Поздравляем! 🎉 Спасибо, что рассказали»",
    (where) => {
      render(survey());
      tap("found", "elsewhere");

      tap("where", where);
      expect(state.sendFoundWhere).toHaveBeenCalledExactlyOnceWith({ where });
      expect(state.back).toHaveBeenCalledTimes(1);
      expect(toastKey()).toBe("found.thanksYes");
      expect(haptics()).toEqual(["impactOccurred:light", "impactOccurred:light"]);
    },
  );
});

describe("FoundSheet: fire and forget", () => {
  it("does not wait for the answer: a pending or failed request changes nothing, rows are never disabled", async () => {
    state.sendFound.mockReturnValue(new Promise(() => undefined));
    state.sendFoundWhere.mockResolvedValue({ ok: false, error: "server", status: 500, method: "POST", path: "surveys/found/where" });
    render(survey());

    tap("found", "elsewhere");
    expect(step()).toBe("where");
    expect([...content().querySelectorAll("button")].every((button) => !button.disabled)).toBe(true);

    tap("where", "olx");
    await act(async () => undefined);
    expect(state.back).toHaveBeenCalledTimes(1);
    expect(toastKey()).toBe("found.thanksYes");
  });

  it("two taps on a final answer step back once", () => {
    render(survey());

    tap("found", "searching");
    tap("found", "searching");
    expect(state.back).toHaveBeenCalledTimes(1);
  });
});

describe("FoundSheet: the congratulations", () => {
  it("without HOMI's bot there is no «Рассказать друзьям»; «Готово» closes", () => {
    render(survey());
    tap("found", "homi");

    expect(content().querySelector('[data-action="share"]')).toBeNull();
    fireEvent.click(within(content()).getByRole("button", { name: "Готово" }));
    expect(state.back).toHaveBeenCalledTimes(1);
  });

  it("with the bot: «Рассказать друзьям» shares the `s_friend` link with the share text, then closes", () => {
    state.bot = "homi_bot";
    const share = vi.spyOn(tg, "shareUrl").mockResolvedValue(undefined);
    render(survey());
    tap("found", "homi");

    fireEvent.click(within(content()).getByRole("button", { name: "Рассказать друзьям" }));
    expect(share).toHaveBeenCalledExactlyOnceWith("https://t.me/homi_bot?start=s_friend", expect.stringContaining("Квартира нашлась через HOMI"));
    expect(state.back).toHaveBeenCalledTimes(1);
    expect(haptics()).toEqual(["impactOccurred:light", "notificationOccurred:success", "impactOccurred:light"]);
  });
});

describe("FoundSheet: the trigger", () => {
  it.each([
    ["no trigger", ""],
    ["an unknown trigger", "trigger=other"],
  ])("%s: one replace to the tab, the frame without rows (its server HTML still holds data-route)", (_case, search) => {
    state.search = search;
    expect(renderToString(survey("standalone"))).toContain('data-route="radars/found"');

    const { rerender } = render(survey());
    rerender(survey());
    expect(state.replace).toHaveBeenCalledExactlyOnceWith("/radars");
    expect(rows("found")).toEqual([]);
  });

  it("a second ask_found while the survey is open replaces the trigger and keeps the step", () => {
    const { rerender } = render(survey());
    tap("found", "elsewhere");

    state.search = "trigger=delete";
    rerender(survey());
    expect(step()).toBe("where");
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("an answer reads the trigger the address has at the tap", () => {
    const { rerender } = render(survey());
    state.search = "trigger=delete";
    rerender(survey());

    tap("found", "stopped");
    expect(state.sendFound).toHaveBeenCalledExactlyOnceWith({ answer: "stopped", trigger: "delete" });
  });

  it("a copy hidden with its cached route starts over at the question when shown again", () => {
    const cached = (mode: "visible" | "hidden") => intl(<Activity mode={mode}>{<FoundSheet presentation="layer" />}</Activity>);
    const { rerender } = render(cached("visible"));
    tap("found", "elsewhere");
    expect(step()).toBe("where");

    rerender(cached("hidden"));
    rerender(cached("visible"));
    expect(step()).toBe("ask");
  });
});

describe("FoundSheet: radars switched off (DEC-51)", () => {
  it("renders nothing and gives way to the tab once", () => {
    feedReference({ reference: { radars_enabled: false } });
    const { rerender } = render(survey());
    rerender(survey());

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector('[data-route="radars/found"]')).toBeNull();
    expect(state.replace).toHaveBeenCalledExactlyOnceWith("/radars");
  });

  it("before the reference data is there it still renders", () => {
    feedReference({ reference: null });
    render(survey());

    expect(rows("found")).toHaveLength(4);
    expect(state.replace).not.toHaveBeenCalled();
  });
});
