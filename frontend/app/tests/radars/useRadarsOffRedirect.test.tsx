import { act, cleanup, render, renderHook } from "@testing-library/react";
import { Activity } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("@/lib/navigation/nav", () => ({
  nav: { replace: (href: string) => state.replace(href), push: (href: string) => state.push(href) },
}));

import { useRadarsOffRedirect } from "@/features/radars/useRadarsOffRedirect";
import { resetReference } from "@/lib/reference/useReference";

import { feedReference } from "../helpers/reference";

beforeEach(() => {
  state.replace.mockReset();
  state.push.mockReset();
  resetReference();
});

afterEach(() => {
  cleanup();
  resetReference();
});

/** A sheet route that renders nothing while the hook says so, as the four radar sheet routes do. */
function SheetRoute() {
  return useRadarsOffRedirect() ? null : <p data-testid="sheet">sheet</p>;
}

const sheet = () => document.querySelector('[data-testid="sheet"]');

describe("useRadarsOffRedirect (DEC-51)", () => {
  it("does nothing before the reference data is there: no replace, the sheet renders", () => {
    feedReference({ reference: null });
    const { result } = renderHook(() => useRadarsOffRedirect());

    expect(result.current).toBe(false);
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("replaces the address with the tab once when radars are switched off, and renders nothing", () => {
    feedReference({ reference: { radars_enabled: false } });
    const { result, rerender } = renderHook(() => useRadarsOffRedirect());

    expect(result.current).toBe(true);
    expect(state.replace).toHaveBeenCalledExactlyOnceWith("/radars");

    // A re-render and a refresh of the reference data with radars still off do not replace again.
    rerender();
    act(() => feedReference({ reference: { radars_enabled: false } }));
    expect(result.current).toBe(true);
    expect(state.replace).toHaveBeenCalledTimes(1);
    expect(state.push).not.toHaveBeenCalled();
  });

  it("does nothing while radars are on", () => {
    feedReference({ reference: { radars_enabled: true } });
    const { result, rerender } = renderHook(() => useRadarsOffRedirect());
    rerender();

    expect(result.current).toBe(false);
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("replaces when the reference data arrives with radars off; the sheet goes away", () => {
    feedReference({ reference: null });
    render(<SheetRoute />);
    expect(sheet()).not.toBeNull();
    expect(state.replace).not.toHaveBeenCalled();

    act(() => feedReference({ reference: { radars_enabled: false } }));
    expect(sheet()).toBeNull();
    expect(state.replace).toHaveBeenCalledExactlyOnceWith("/radars");
  });

  it("leaves the sheet alone when the reference data arrives with radars on", () => {
    feedReference({ reference: null });
    render(<SheetRoute />);

    act(() => feedReference({ reference: { radars_enabled: true } }));
    expect(sheet()).not.toBeNull();
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("a copy mounted again while radars are off replaces again (a stale link a second time)", () => {
    feedReference({ reference: { radars_enabled: false } });
    const first = render(<SheetRoute />);
    first.unmount();
    render(<SheetRoute />);

    expect(state.replace).toHaveBeenCalledTimes(2);
    expect(state.replace.mock.calls).toEqual([["/radars"], ["/radars"]]);
  });

  it("a cached copy shown again redirects anew; hidden, it does nothing (preserving-ui-state.md)", () => {
    feedReference({ reference: { radars_enabled: false } });
    const cached = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <SheetRoute />
      </Activity>
    );
    const { rerender } = render(cached("visible"));
    expect(state.replace).toHaveBeenCalledTimes(1);

    rerender(cached("hidden"));
    expect(state.replace).toHaveBeenCalledTimes(1);

    rerender(cached("visible"));
    expect(state.replace).toHaveBeenCalledTimes(2);
  });
});
