import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { radarsReady, useRadarsEnabled } from "@/features/radars/capability";
import { EMPTY_REFERENCE } from "@/lib/reference/empty";
import type { Reference } from "@/lib/reference/types";
import { resetReference, setReference } from "@/lib/reference/useReference";

import { feedReference } from "../helpers/reference";

afterEach(() => {
  cleanup();
  resetReference();
});

const enabled = (options?: { ready?: boolean }) => renderHook(() => useRadarsEnabled(options)).result.current;

describe("radar seam (WP-24, DEC-51)", () => {
  it("the radar screens exist since WP-30, so the server's switch decides", () => {
    expect(radarsReady).toBe(true);
    feedReference({ reference: { radars_enabled: true } });
    expect(enabled()).toBe(true);

    feedReference({ reference: { radars_enabled: false } });
    expect(enabled()).toBe(false);
  });

  it("missing reference data, a missing switch or one that is not true read as off", () => {
    feedReference({ reference: null });
    expect(enabled()).toBe(false);

    const data: Partial<Reference> = { ...EMPTY_REFERENCE };
    delete data.radars_enabled;
    setReference({ reference: { loaded: true, data: data as Reference }, cities: { loaded: false, data: [] } });
    expect(enabled()).toBe(false);

    feedReference({ reference: { radars_enabled: "true" as unknown as boolean } });
    expect(enabled()).toBe(false);
  });

  it("without the radar screens radars stay off whatever the server says", () => {
    feedReference({ reference: { radars_enabled: true } });
    expect(enabled({ ready: false })).toBe(false);
  });
});
