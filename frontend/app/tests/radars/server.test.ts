// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/lib/api/types";

/** What the server part did, in order: the reference read, the cookie read, `io()`, the radar read. */
const state = vi.hoisted(() => ({
  steps: [] as string[],
  reference: { loaded: true, data: { radars_enabled: true } } as { loaded: boolean; data: Record<string, unknown> },
  token: "cookie-token" as string | null,
  radars: vi.fn<(query: URLSearchParams) => Promise<ApiResult<unknown>>>(),
}));
vi.mock("next/root-params", () => ({ locale: async () => "uz" }));
vi.mock("next/cache", () => ({
  io: async () => {
    state.steps.push("io");
  },
}));
vi.mock("@/lib/reference/server", () => ({
  getReference: async (locale: string) => {
    state.steps.push(`reference:${locale}`);
    return state.reference;
  },
}));
vi.mock("@/lib/session/server", () => ({
  getSessionToken: async () => {
    state.steps.push("cookie");
    return state.token;
  },
}));
vi.mock("@/lib/api/server", () => ({
  serverApi: async () => ({
    radars: (query: URLSearchParams) => {
      state.steps.push(`radars?${query.toString()}`);
      return state.radars(query);
    },
  }),
}));
/** The client halves are tested in `RadarSoon.test.tsx` and `RadarSheet.test.tsx`; here only the props. */
vi.mock("@/features/radars/RadarScreen", () => ({ RadarScreen: () => null }));
vi.mock("@/features/radars/RadarSheetRoute", () => ({ RadarSheetRoute: () => null }));
vi.mock("@/features/shell/SourceReporter", () => ({ SourceReporter: () => null }));

const { OFF_RENDER_ID, readRadarTab } = await import("@/features/radars/server");

const A = "01JD0000000000000000000001";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const raw = { id: A, active: true, mode: "weekly", hidden: 2, created_at: "2026-11-10T06:00:00+00:00", filters: { city: "tashkent" }, preview: null };

beforeEach(() => {
  state.steps.length = 0;
  state.reference = { loaded: true, data: { radars_enabled: true } };
  state.token = "cookie-token";
  state.radars.mockReset();
  state.radars.mockResolvedValue({ ok: true, data: [raw, { id: "bad" }], meta: { source: "stub" } });
});

describe("readRadarTab (SCR-026, DEC-44, DEC-51)", () => {
  it.each([
    ["radars_enabled false", { loaded: true, data: { radars_enabled: false } }],
    ["radars_enabled missing", { loaded: true, data: {} }],
    ["the reference data not read", { loaded: false, data: { radars_enabled: true } }],
  ])("%s: the soon state — no cookie read, no radar request", async (_, reference) => {
    state.reference = reference;
    expect(await readRadarTab()).toEqual({ renderId: OFF_RENDER_ID, serverOff: true });
    expect(state.steps).toEqual(["reference:uz"]);
    expect(state.radars).not.toHaveBeenCalled();
  });

  it("with the cookie: one GET /radars?include=previews, normalised, the source passed on; the render id drawn after io()", async () => {
    const read = await readRadarTab();

    expect(state.steps).toEqual(["reference:uz", "cookie", "io", "radars?include=previews"]);
    expect(read.serverOff).toBe(false);
    expect(read.renderId).toMatch(UUID);
    expect(read.source).toBe("stub");
    expect(read.initial).toEqual([
      { id: A, active: true, mode: "instant", hidden: 2, filters: expect.objectContaining({ city: "tashkent" }), createdAt: "2026-11-10T06:00:00+00:00", preview: null },
    ]);
    expect((await readRadarTab()).renderId).not.toBe(read.renderId);
  });

  it("without the cookie (header mode) nothing is read: the browser reads through /bff", async () => {
    state.token = null;
    const read = await readRadarTab();

    expect(state.steps).toEqual(["reference:uz", "cookie", "io"]);
    expect(read).toEqual({ renderId: expect.stringMatching(UUID), serverOff: false });
  });

  it.each(["unauthorized", "server", "offline"])("a failed read (%s) leaves the list to the browser", async (error) => {
    state.radars.mockResolvedValue({ ok: false, error, status: 500, method: "GET", path: "radars" } as never);
    const read = await readRadarTab();

    expect(read.initial).toBeUndefined();
    expect(read.serverOff).toBe(false);
  });
});
