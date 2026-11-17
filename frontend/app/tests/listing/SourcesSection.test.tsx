import { getMessages } from "@homi/i18n";
import { SWIPE_BACK_EXCLUDED } from "@homi/ui";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SourcesSection } from "@/features/listing/sections/SourcesSection";
import { clearTracked, recentTracked } from "@/lib/analytics/events";

import { detailsOf } from "../helpers/details";

type SourcesProps = ComponentProps<typeof SourcesSection>;

const TWO = [
  { handle: "stub_channel_a", url: "https://t.me/stub_channel_a/4001" },
  { handle: "stub_channel_b", url: "https://t.me/stub_channel_b/7001" },
];

function tree(props: Partial<SourcesProps> = {}) {
  return (
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      <SourcesSection number={100001} sources={TWO} originalText={detailsOf().original.text} {...props}>
        <p data-body="">the original text</p>
      </SourcesSection>
    </NextIntlClientProvider>
  );
}

const chips = () => [...document.querySelectorAll<HTMLButtonElement>("button[data-source-chip]")];
const toggle = () => document.querySelector<HTMLButtonElement>("button[data-original-toggle]");
const body = () => document.querySelector("[data-original]");

let fake: FakeTelegram;
const haptics = () =>
  fake.calls.filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);
const opened = () => fake.calls.filter((entry) => entry.member === "openTelegramLink").map((entry) => entry.args[0]);

beforeEach(() => {
  window.history.replaceState(null, "", "/ru/listing/100001");
  fake = fakeTelegram();
});

afterEach(() => {
  cleanup();
  fake.uninstall();
  clearTracked();
});

describe("SourcesSection (03 SCR-018, block 12)", () => {
  it("shows «Источник» and a chip per channel, in a row that scrolls sideways and keeps swipes back out", () => {
    render(tree());

    expect(document.querySelector('[data-section="sources"] h2')?.textContent).toBe("Источник");
    expect(chips().map((chip) => chip.textContent)).toEqual(["@stub_channel_a", "@stub_channel_b"]);
    const row = chips()[0].parentElement!;
    expect(row.hasAttribute("data-scroll-x")).toBe(true);
    expect(row.hasAttribute("data-no-swipe")).toBe(true);
    expect(chips()[0].closest(SWIPE_BACK_EXCLUDED)).toBe(row);
  });

  it("a chip opens its post with the light haptic and logs original_opened from `sources`", () => {
    render(tree());
    fireEvent.click(chips()[1]);

    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
    expect(opened()).toEqual(["https://t.me/stub_channel_b/7001"]);
    expect(recentTracked()).toEqual([{ name: "original_opened", props: { listing_id: 100001, src: "sources" } }]);
  });

  it("a chip off the allowed hosts still shows; its open is refused and nothing is logged", () => {
    render(tree({ sources: [{ handle: "elsewhere", url: "https://evil.example/post/1" }] }));
    fireEvent.click(chips()[0]);

    expect(chips().map((chip) => chip.textContent)).toEqual(["@elsewhere"]);
    expect(opened()).toEqual([]);
    expect(recentTracked()).toEqual([]);
  });

  it("«Текст оригинала» starts closed and opens and closes its body in place with the light haptic", () => {
    render(tree());

    expect(toggle()?.textContent).toBe("Текст оригинала");
    expect(toggle()?.getAttribute("aria-expanded")).toBe("false");
    expect(body()).toBeNull();

    fireEvent.click(toggle()!);
    expect(toggle()?.getAttribute("aria-expanded")).toBe("true");
    expect(body()?.textContent).toBe("the original text");
    expect(toggle()?.getAttribute("aria-controls")).toBe(body()?.id);

    fireEvent.click(toggle()!);
    expect(toggle()?.getAttribute("aria-expanded")).toBe("false");
    expect(body()).toBeNull();
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)", "HapticFeedback.impactOccurred(light)"]);
  });

  it("is closed again for a new number, also when the section stays mounted", () => {
    const { rerender } = render(tree());
    fireEvent.click(toggle()!);
    expect(body()).not.toBeNull();

    rerender(tree({ number: 100002 }));
    expect(toggle()?.getAttribute("aria-expanded")).toBe("false");
    expect(body()).toBeNull();

    rerender(tree({ number: 100001 }));
    expect(body()).toBeNull();
  });

  it.each([null, "", " \n"])("has no disclosure for the original text %j", (originalText) => {
    render(tree({ originalText }));

    expect(toggle()).toBeNull();
    expect(chips()).toHaveLength(2);
  });

  it("without channels shows the disclosure alone; without either renders nothing", () => {
    render(tree({ sources: [] }));
    expect(chips()).toEqual([]);
    expect(document.querySelector("[data-scroll-x]")).toBeNull();
    expect(toggle()).not.toBeNull();

    cleanup();
    const { container } = render(tree({ sources: [], originalText: null }));
    expect(container.innerHTML).toBe("");
  });
});
