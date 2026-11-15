import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BootGuard } from "@/features/shell/BootGuard";

const host = window as unknown as { __homiBoot?: { ok: boolean; watching: boolean } };

afterEach(() => {
  cleanup();
  delete host.__homiBoot;
});

describe("BootGuard (TMA-003)", () => {
  it("hands over from the boot watchdog in its first effect", () => {
    host.__homiBoot = { ok: false, watching: false };

    render(<BootGuard />);

    expect(host.__homiBoot.ok).toBe(true);
    expect(host.__homiBoot.watching).toBe(false);
  });

  it("does nothing without the boot script", () => {
    expect(() => render(<BootGuard />)).not.toThrow();
  });
});
