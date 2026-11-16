import { defaultFilters } from "@homi/search";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { radarsReady, useRadarsEnabled } from "@/features/radars/capability";
import { subscribe, useHasActiveRadar } from "@/features/radars/subscribe";
import { resetReference } from "@/lib/reference/useReference";

import { feedReference } from "../helpers/reference";

afterEach(() => {
  cleanup();
  resetReference();
});

const enabled = (options?: { ready?: boolean }) => renderHook(() => useRadarsEnabled(options)).result.current;

describe("radar seam (WP-24, DEC-51)", () => {
  it("radarsReady is false until WP-30, so radars are off whatever the server says", () => {
    expect(radarsReady).toBe(false);
    feedReference({ reference: { radars_enabled: true } });
    expect(enabled()).toBe(false);
  });

  it("with the screens ready, the server's switch decides; missing reference data reads as off", () => {
    feedReference({ reference: { radars_enabled: true } });
    expect(enabled({ ready: true })).toBe(true);

    feedReference({ reference: { radars_enabled: false } });
    expect(enabled({ ready: true })).toBe(false);

    feedReference({ reference: null });
    expect(enabled({ ready: true })).toBe(false);
  });

  it("the stubs: subscribe resolves { ok: false }, useHasActiveRadar is false", async () => {
    await expect(subscribe(defaultFilters(), "few")).resolves.toEqual({ ok: false });
    await expect(subscribe(defaultFilters(), "filters", "rooms")).resolves.toEqual({ ok: false });
    expect(renderHook(() => useHasActiveRadar(defaultFilters())).result.current).toBe(false);
  });
});
