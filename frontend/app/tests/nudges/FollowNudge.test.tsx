import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { defaultFilters, type SearchFilters } from "@homi/search";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ subscribe: vi.fn(), order: [] as string[] }));
/** The flow is `useSubscribe()`'s (tested in `tests/radars/subscribe.test.ts`); the card only calls it. */
vi.mock("@/features/radars/subscribe", () => ({
  useSubscribe: () => ({
    subscribe: (...args: unknown[]) => {
      state.order.push("subscribe");
      return state.subscribe(...args);
    },
    saveEdit: vi.fn(),
    relax: vi.fn(),
  }),
}));

import { type LiveFlow, normalizeFlow } from "@/features/filters/flow";
import { FOLLOW_SHOW_MS } from "@/features/nudges/constants";
import { FollowNudge, type FollowNudgeProps } from "@/features/nudges/FollowNudge";
import { releaseSlot, resetNudgeSlot, takeSlot } from "@/features/nudges/store";

import { withDevFlags } from "../helpers/flags";
import { translator } from "../helpers/listing";

const LOCALES: readonly Locale[] = ["ru", "uz", "en"];
const CUSTOM: SearchFilters = { ...defaultFilters("rent_long", "tashkent"), rooms_min: 2, rooms_max: 2 };

function wrap(node: ReactNode, locale: Locale = "ru") {
  return (
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
      {node}
    </NextIntlClientProvider>
  );
}

function props(overrides: Partial<FollowNudgeProps> = {}): FollowNudgeProps {
  return { filters: CUSTOM, flow: null, onShown: vi.fn(), onExpire: vi.fn(), onClose: vi.fn(), onEnable: vi.fn(), ...overrides };
}

const card = () => document.querySelector<HTMLElement>('[data-nudge="follow"]');
const flowLine = () => document.querySelector('[data-slot="nudge-flow"]')?.textContent ?? null;

let fake: FakeTelegram | null = null;
const haptics = () =>
  (fake?.calls ?? []).filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);

beforeEach(() => {
  vi.useFakeTimers();
  state.subscribe.mockReset();
  state.subscribe.mockResolvedValue({ ok: true });
  state.order.length = 0;
  resetNudgeSlot();
  fake = fakeTelegram({ version: "8.0" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  resetNudgeSlot();
  fake?.uninstall();
  fake = null;
});

describe("FollowNudge (SCR-040)", () => {
  it.each(LOCALES)("%s: the radar icon, the title, the hint, «Включить» and a named ×", (locale) => {
    const t = translator(locale);
    render(wrap(<FollowNudge {...props()} />, locale));
    const root = card()!;
    expect(root.getAttribute("role")).toBe("status");
    expect(root.querySelector("svg")).not.toBeNull();
    expect(root.querySelector("b")?.textContent).toBe(t("nudge.title"));
    expect(root.textContent).toContain(t("nudge.what"));
    expect(root.querySelector('[data-action="enable"]')?.textContent).toBe(t("nudge.enable"));
    expect(root.querySelector('[data-action="close"]')?.getAttribute("aria-label")).toBe(t("common.close"));
  });

  it("stands 12 px from the column's edges above the tab bar, on the nudge level of the ladder", () => {
    render(wrap(<FollowNudge {...props()} />));
    const frame = card()!.parentElement!;
    expect(frame.className).toContain("z-(--z-nudge)");
    expect(frame.className).toContain("px-[12px]");
    expect(frame.className).toContain("bottom-[calc(var(--tabbar-h)+var(--bottom-inset)+78px)]");
    expect(card()!.className).toContain("rounded-[18px]");
    expect(card()!.className).toContain("animate-rise-in");
  });

  it.each(LOCALES)("%s: the flow line — none, none yet, a week's count, a day's count (BR-APP-044, LB-APP-006)", (locale) => {
    const t = translator(locale);
    const cases: [LiveFlow | null, string | null][] = [
      [null, null],
      [normalizeFlow(undefined), null],
      [normalizeFlow({}), null],
      [normalizeFlow({ week: 3, days: 0 }), null],
      [{ week: 0, days: 7, options: [] }, t("nudge.none")],
      [{ week: 3, days: 7, options: [] }, t("alert.week", { n: 3 })],
      [{ week: 21, days: 7, options: [] }, t("alert.day", { n: 3 })],
    ];
    for (const [flow, line] of cases) {
      render(wrap(<FollowNudge {...props({ flow })} />, locale));
      expect(flowLine()).toBe(line);
      expect(card()!.querySelector("b")?.textContent).toBe(t("nudge.title"));
      cleanup();
    }
  });

  it("words the flow line in the sheet's vocabulary with dev021OneFlowVocabulary (LB-APP-033)", () => {
    const t = translator("ru");
    withDevFlags({ dev021OneFlowVocabulary: true }, (flags) => {
      render(wrap(<FollowNudge {...props({ flow: { week: 3, days: 7, options: [] }, flags })} />));
    });
    expect(flowLine()).toBe(t("sheet.flowWeek", { n: 3 }));
  });

  it("hides itself 10 s after it mounted; a re-render keeps the timer, a remount starts it afresh", () => {
    const first = vi.fn();
    const view = render(wrap(<FollowNudge {...props({ onExpire: first })} />));
    act(() => vi.advanceTimersByTime(5000));
    const latest = vi.fn();
    view.rerender(wrap(<FollowNudge {...props({ onExpire: latest })} />));
    act(() => vi.advanceTimersByTime(FOLLOW_SHOW_MS - 5001));
    expect(latest).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(latest).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    cleanup();

    const again = vi.fn();
    const remounted = render(wrap(<FollowNudge {...props({ onExpire: again })} />));
    act(() => vi.advanceTimersByTime(6000));
    remounted.unmount();
    render(wrap(<FollowNudge {...props({ onExpire: again })} />));
    act(() => vi.advanceTimersByTime(FOLLOW_SHOW_MS - 1));
    expect(again).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(again).toHaveBeenCalledTimes(1);
  });

  it("× closes it; a tap on the card itself does nothing", () => {
    const p = props();
    render(wrap(<FollowNudge {...p} />));
    fireEvent.click(card()!);
    expect(p.onClose).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector('[data-action="close"]')!);
    expect(p.onClose).toHaveBeenCalledTimes(1);
    expect(p.onEnable).not.toHaveBeenCalled();
    expect(state.subscribe).not.toHaveBeenCalled();
    expect(haptics()).toEqual([]);
  });

  it("«Включить»: a medium impact, the host ends the nudge, then the radar is turned on with entry «prompt»", () => {
    const onEnable = vi.fn(() => state.order.push("enable"));
    render(wrap(<FollowNudge {...props({ onEnable })} />));
    fireEvent.click(document.querySelector('[data-action="enable"]')!);
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(medium)"]);
    expect(state.order).toEqual(["enable", "subscribe"]);
    expect(state.subscribe).toHaveBeenCalledWith(CUSTOM, "prompt");
  });

  it("marks itself shown once, on its first render in the slot (LB-APP-050)", () => {
    const onShown = vi.fn();
    const outside = render(wrap(<FollowNudge {...props({ onShown })} />));
    expect(onShown).not.toHaveBeenCalled();
    outside.unmount();

    const ticket = takeSlot("follow")!;
    const view = render(wrap(<FollowNudge {...props({ onShown })} />));
    view.rerender(wrap(<FollowNudge {...props({ onShown })} />));
    view.unmount();
    render(wrap(<FollowNudge {...props({ onShown })} />));
    expect(onShown).toHaveBeenCalledTimes(1);
    releaseSlot("follow", ticket);
  });
});
