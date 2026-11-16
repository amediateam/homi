import { afterEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  status: "booting" as string,
  me: null as null | { locale: string; locale_chosen: boolean; city_chosen: boolean },
}));
vi.mock("@/lib/session/bootstrap", () => ({ getSession: () => session }));

import { gateState, isGatePending, resetGateState } from "@/features/gates/gateState";

afterEach(() => {
  resetGateState();
  Object.assign(session, { status: "booting", me: null });
});

describe("gateState (D-S-7)", () => {
  it("starts empty for the launch and resets for tests", () => {
    expect(gateState).toEqual({ returnTo: null, localePicked: false, cityPicked: false, onGate: false });
    Object.assign(gateState, { returnTo: "/?listing=5", localePicked: true, cityPicked: true, onGate: true });
    resetGateState();
    expect(gateState).toEqual({ returnTo: null, localePicked: false, cityPicked: false, onGate: false });
  });

  it("the language gate is pending while the ready session needs a locale, until one is picked", () => {
    expect(isGatePending()).toBe(false);

    Object.assign(session, { status: "ready", me: { locale: "ru", locale_chosen: false, city_chosen: false } });
    expect(isGatePending()).toBe(true);

    gateState.localePicked = true;
    expect(isGatePending()).toBe(false);
  });

  it("the city gate does not hold the launch redirect back (BR-APP-055)", () => {
    Object.assign(session, { status: "ready", me: { locale: "ru", locale_chosen: true, city_chosen: false } });
    expect(isGatePending()).toBe(false);
  });

  it("is pending while a gate page is on screen, whatever the session says", () => {
    Object.assign(session, { status: "ready", me: { locale: "ru", locale_chosen: true, city_chosen: true } });
    gateState.onGate = true;
    expect(isGatePending()).toBe(true);
  });

  it("reads nothing of window at module scope (server-safe)", async () => {
    vi.resetModules();
    vi.stubGlobal("window", undefined);
    try {
      const fresh = await import("@/features/gates/gateState");
      expect(fresh.gateState.returnTo).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
