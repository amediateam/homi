import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ prepared: true, pathname: "/", locale: "ru" }));
vi.mock("next-intl", () => ({ useLocale: () => state.locale }));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ prepared: state.prepared }) }));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => state.pathname }));

import { FragmentGuard } from "@/features/shell/FragmentGuard";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("FragmentGuard (TMA-009)", () => {
  it("removes a launch fragment that a navigation brought back", () => {
    window.history.replaceState(null, "", "/ru#tgWebAppData=query_id%3D1");
    const view = render(<FragmentGuard />);
    expect(window.location.hash).toBe("");

    // A locale switch keeps next-intl's pathname.
    window.history.replaceState(null, "", "/uz#tgWebAppData=query_id%3D1");
    state.locale = "uz";
    view.rerender(<FragmentGuard />);
    expect(window.location.hash).toBe("");
  });

  it("leaves other fragments, and waits until the launch is prepared", () => {
    window.history.replaceState(null, "", "/ru#section");
    render(<FragmentGuard />);
    expect(window.location.hash).toBe("#section");
    cleanup();

    state.prepared = false;
    window.history.replaceState(null, "", "/ru#tgWebAppData=1");
    render(<FragmentGuard />);
    expect(window.location.hash).toBe("#tgWebAppData=1");
  });
});
