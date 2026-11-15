import { renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/actions/run";

const reauthenticate = vi.fn<() => Promise<boolean>>();
vi.mock("@/lib/session/bootstrap", () => ({ reauthenticate: () => reauthenticate() }));
const reportSource = vi.fn();
vi.mock("@/lib/data/sources", () => ({ reportSource: (...args: unknown[]) => reportSource(...args) }));

const { useAction } = await import("@/lib/actions/useAction");
const { clearAuth, setCookieAuth, setHeaderAuth } = await import("@/lib/session/store");

const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="uz" messages={{}}>
    {children}
  </NextIntlClientProvider>
);

const success: ActionResult<{ favorite: boolean }> = { ok: true, data: { favorite: true }, meta: { source: "stub" } };
const unauthorized: ActionResult<never> = { ok: false, error: "unauthorized", status: 401, method: "ACTION", path: "session" };

beforeEach(() => {
  reauthenticate.mockReset();
  reportSource.mockReset();
});

afterEach(() => clearAuth());

describe("useAction (WP-22)", () => {
  it("cookie mode passes no token, header mode passes it; both pass the locale; the source is reported", async () => {
    const action = vi.fn<(input: number, auth?: { token?: string }, locale?: string) => Promise<ActionResult<{ favorite: boolean }>>>(async () => success);
    const { result } = renderHook(() => useAction(action), { wrapper });

    setCookieAuth(null);
    await expect(result.current(42)).resolves.toEqual(success);
    setHeaderAuth("header-token", null);
    await result.current(42);

    expect(action.mock.calls).toEqual([
      [42, undefined, "uz"],
      [42, { token: "header-token" }, "uz"],
    ]);
    expect(reportSource).toHaveBeenCalledWith("stub");
  });

  it("unauthorized re-authenticates once and repeats with the new token", async () => {
    setHeaderAuth("old-token", null);
    const action = vi.fn<(input: number, auth?: { token?: string }, locale?: string) => Promise<ActionResult<{ favorite: boolean }>>>();
    action.mockResolvedValueOnce(unauthorized).mockResolvedValueOnce(success);
    reauthenticate.mockImplementation(async () => {
      setHeaderAuth("new-token", null);
      return true;
    });
    const { result } = renderHook(() => useAction(action), { wrapper });

    await expect(result.current(42)).resolves.toEqual(success);
    expect(action.mock.calls.map((call) => call[1])).toEqual([{ token: "old-token" }, { token: "new-token" }]);
    expect(reauthenticate).toHaveBeenCalledTimes(1);
  });

  it("a second unauthorized is returned without a third call", async () => {
    setCookieAuth(null);
    const action = vi.fn(async () => unauthorized);
    reauthenticate.mockResolvedValue(true);
    const { result } = renderHook(() => useAction(action), { wrapper });

    await expect(result.current(42)).resolves.toEqual(unauthorized);
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("an action that cannot be reached resolves offline instead of throwing", async () => {
    setCookieAuth(null);
    const action = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const { result } = renderHook(() => useAction(action), { wrapper });

    await expect(result.current(42)).resolves.toMatchObject({ ok: false, error: "offline", status: 0 });
  });
});
