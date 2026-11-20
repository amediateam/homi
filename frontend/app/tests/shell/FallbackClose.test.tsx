import { getMessages } from "@homi/i18n";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FallbackClose } from "@/features/shell/FallbackClose";
import { announceSdk } from "@/lib/telegram/sdk";

let fake: FakeTelegram | null = null;

afterEach(() => {
  cleanup();
  fake?.uninstall();
  fake = null;
});

function tree(onClose: () => void) {
  return (
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      <FallbackClose onClose={onClose} />
    </NextIntlClientProvider>
  );
}

const cross = () => document.querySelector<HTMLButtonElement>("[data-fallback-close]");

describe("FallbackClose (WP-36, TMA-047)", () => {
  it("renders nothing on the server, so the cross appears after hydration only", () => {
    expect(renderToString(tree(() => {}))).toBe("");
  });

  it("is there without the SDK: a round 44 px glass button «Закрыть» under the top inset, at 88 %", () => {
    render(tree(() => {}));

    const button = cross()!;
    expect(button.getAttribute("aria-label")).toBe("Закрыть");
    expect(button.getAttribute("type")).toBe("button");
    for (const name of ["glass", "fixed", "top-[calc(var(--top-inset)+10px)]", "right-[12px]", "size-[44px]", "rounded-pill", "opacity-[0.88]"]) {
      expect(button.classList.contains(name), name).toBe(true);
    }
    expect(button.querySelector("svg.lucide-x")).not.toBeNull();
  });

  it("is absent while the SDK is there", () => {
    fake = fakeTelegram({ version: "8.0" });
    render(tree(() => {}));
    expect(cross()).toBeNull();
  });

  it("goes when the SDK arrives late", () => {
    render(tree(() => {}));
    expect(cross()).not.toBeNull();

    fake = fakeTelegram({ version: "8.0" });
    act(() => announceSdk());

    expect(cross()).toBeNull();
  });

  it("a tap calls the close once", () => {
    const onClose = vi.fn();
    render(tree(onClose));

    act(() => cross()!.click());

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
