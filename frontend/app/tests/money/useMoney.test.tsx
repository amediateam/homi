import { getMessages } from "@homi/i18n";
import { cleanup, render, renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ me: { currency: "UZS" } as { currency: string } | null }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ me: session.me }) }));

const { useMoney } = await import("@/lib/money/useMoney");
const { ReferenceProvider } = await import("@/lib/reference/ReferenceProvider");
const { EMPTY_REFERENCE } = await import("@/lib/reference/empty");
const { resetReference } = await import("@/lib/reference/useReference");

const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
    {children}
  </NextIntlClientProvider>
);

function rate(usdUzs: number) {
  render(<ReferenceProvider reference={{ loaded: true, data: { ...EMPTY_REFERENCE, rates: { usd_uzs: usdUzs } } }} cities={{ loaded: true, data: [] }} />);
}

afterEach(() => {
  cleanup();
  resetReference();
});

describe("useMoney (WP-22)", () => {
  it("formats in сум with the profile's currency and the reference rate, through the catalogue", () => {
    session.me = { currency: "UZS" };
    rate(12_800);

    const { result } = renderHook(() => useMoney(), { wrapper });

    expect(result.current.isUzs).toBe(true);
    expect(result.current.format(1_000)).toBe("12,8 млн сум");
  });

  it("shows USD without a rate, and a new instance after a currency change", () => {
    session.me = { currency: "UZS" };
    const { result, rerender } = renderHook(() => useMoney(), { wrapper });
    expect(result.current.format(1_200)).toBe("$1\u00a0200");

    rate(12_800);
    rerender();
    const uzs = result.current;
    session.me = { currency: "USD" };
    rerender();

    expect(result.current).not.toBe(uzs);
    expect(result.current.format(1_200)).toBe("$1\u00a0200");
  });
});
