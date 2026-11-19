import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/lib/api/types";

const state = vi.hoisted(() => ({
  sent: [] as { path: string; resolve: (answer: ApiResult<unknown>) => void }[],
  status: "booting" as string,
}));
vi.mock("@/lib/api/browser", () => ({
  bffFetch: (path: string) =>
    new Promise<ApiResult<unknown>>((resolve) => {
      state.sent.push({ path, resolve });
    }),
}));
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: vi.fn(), reauthenticate: vi.fn() }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: state.status }) }));

const { digestHours, useSettings } = await import("@/features/settings/useSettings");
const { resetResources } = await import("@/lib/data/useResource");

beforeEach(() => {
  state.sent.length = 0;
  state.status = "booting";
  resetResources();
});

afterEach(() => cleanup());

describe("useSettings (WP-30)", () => {
  it("reads GET /settings through /bff once the session is ready, and only while enabled", async () => {
    const { result, rerender } = renderHook(({ enabled }: { enabled: boolean }) => useSettings({ enabled }), { initialProps: { enabled: true } });
    expect(state.sent).toHaveLength(0);

    state.status = "ready";
    rerender({ enabled: false });
    expect(state.sent).toHaveLength(0);

    rerender({ enabled: true });
    expect(state.sent.map((call) => call.path)).toEqual(["settings"]);
    await act(async () => state.sent[0].resolve({ ok: true, data: { digest_hours: [9, 19] }, meta: { source: "stub" } }));

    expect(result.current.status).toBe("success");
    expect(digestHours(result.current.settings)).toEqual([9, 19]);
  });
});
