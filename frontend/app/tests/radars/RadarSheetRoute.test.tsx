import { act, cleanup, render } from "@testing-library/react";
import { Activity, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Radar } from "@/features/radars/normalize";

const state = vi.hoisted(() => ({
  pathname: "/radars/01JD0000000000000000000001",
  off: false,
  /** The tab's list as `useRadars({ previews: true })` answers it; `undefined` while it is read. */
  list: undefined as Radar[] | undefined,
  replace: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@/lib/navigation/nav", () => ({ nav: { replace: (href: string) => state.replace(href) } }));
vi.mock("@/features/radars/useRadarsOffRedirect", () => ({ useRadarsOffRedirect: () => state.off }));
/** The list is `useRadars`'s (tested in `tests/radars/useRadars.test.tsx`); the route only looks its radar up in it. */
vi.mock("@/features/radars/useRadars", () => ({
  useRadars: () => ({ radars: state.list, status: state.list === undefined ? "loading" : "success", error: null }),
}));
/** The sheet itself is tested in `tests/radars/RadarSheet.test.tsx`; here it shows what the route hands it. */
vi.mock("@/features/radars/RadarSheet", () => ({
  RadarSheet: ({ radar, presentation, instant, children }: { radar?: Radar; presentation: string; instant?: boolean; children?: ReactNode }) => (
    <>
      <div
        data-route="radar"
        data-layer={presentation === "layer" ? "sheet" : undefined}
        data-instant={instant ? "" : undefined}
        data-radar={radar === undefined ? "" : `${radar.id}:${radar.active ? "on" : "paused"}`}
      />
      {children}
    </>
  ),
}));

import { normalizeRadar } from "@/features/radars/normalize";
import { clearRadarReturn, peekRadarReturn, rememberRadarReturn } from "@/features/radars/radarReturn";
import { RadarSheetRoute } from "@/features/radars/RadarSheetRoute";

const A = "01JD0000000000000000000001";

function radarOf(id: string, active = true): Radar {
  return normalizeRadar({
    id,
    active,
    mode: "instant",
    hidden: 0,
    created_at: null,
    filters: { city: "tashkent", deal: "rent_long", rooms_min: 2 },
    preview: { items: [], count: 3, flow: null },
  })!;
}

const editor = <p data-route="radar/edit">editor</p>;

/** The two route trees as Next renders them: `children` (the standalone copy) and `@sheet` (the layer copy, or none). */
function tree({ standalone, layer }: { standalone?: ReactNode | false; layer?: { child?: ReactNode; hidden?: boolean } | false }) {
  return (
    <>
      {standalone === false || standalone === undefined ? null : (
        <div data-slot-name="children">
          <RadarSheetRoute id={A} presentation="standalone">
            {standalone === true ? null : standalone}
          </RadarSheetRoute>
        </div>
      )}
      {layer === false || layer === undefined ? null : (
        <div data-slot-name="sheet">
          <Activity mode={layer.hidden ? "hidden" : "visible"}>
            <RadarSheetRoute id={A} presentation="layer">
              {layer.child}
            </RadarSheetRoute>
          </Activity>
        </div>
      )}
    </>
  );
}

/** The radar sheets on screen: an `<Activity>`-hidden copy keeps its DOM under a `display: none` element. */
function visibleSheets(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-route="radar"]')].filter((node) => {
    for (let at: HTMLElement | null = node; at !== null; at = at.parentElement) {
      if (at.style.display === "none") {
        return false;
      }
    }
    return true;
  });
}

const settle = () => act(async () => undefined);
const scrollTo = vi.fn();

beforeEach(() => {
  state.pathname = `/radars/${A}`;
  state.off = false;
  state.list = [radarOf(A)];
  state.replace.mockReset();
  scrollTo.mockReset();
  vi.stubGlobal("scrollTo", scrollTo);
  clearRadarReturn();
});

afterEach(() => {
  cleanup();
  clearRadarReturn();
  vi.unstubAllGlobals();
});

describe("RadarSheetRoute: the layer copy shows only on its own address (K1)", () => {
  it("a find's listing hides the sheet; Back brings it back without the rise and the tab scrolls back", async () => {
    const view = render(tree({ layer: {} }));
    await settle();
    expect(visibleSheets()).toHaveLength(1);
    expect(visibleSheets()[0].hasAttribute("data-instant")).toBe(false);

    // The find: the return stored, the listing intercepted into `@overlay` while `@sheet` keeps this copy.
    rememberRadarReturn(A, 480);
    state.pathname = "/listing/100012";
    view.rerender(tree({ layer: {} }));
    await settle();
    expect(visibleSheets()).toHaveLength(0);
    expect(scrollTo).not.toHaveBeenCalled();

    state.pathname = `/radars/${A}`;
    view.rerender(tree({ layer: {} }));
    await settle();
    expect(visibleSheets()).toHaveLength(1);
    expect(visibleSheets()[0].hasAttribute("data-instant")).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith(0, 480);
    expect(peekRadarReturn(A)).toBeNull();
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("the editor's address is the sheet's own: the sheet stays under its editor", async () => {
    state.pathname = `/radars/${A}/edit`;
    render(tree({ layer: { child: editor } }));
    await settle();

    expect(visibleSheets()).toHaveLength(1);
    expect(document.querySelector('[data-route="radar/edit"]')).not.toBeNull();
  });

  it("another radar's address or the survey's: nothing, and no replace to the tab", async () => {
    for (const pathname of ["/radars/01JD0000000000000000000002", "/radars/found", "/radars", "/"]) {
      state.pathname = pathname;
      render(tree({ layer: { child: editor } }));
      await settle();
      expect(visibleSheets()).toHaveLength(0);
      expect(document.querySelector('[data-route="radar/edit"]')).toBeNull();
      cleanup();
    }
    expect(state.replace).not.toHaveBeenCalled();
  });
});

describe("RadarSheetRoute: the standalone copy yields to a shown layer copy (confirmed[3], K2)", () => {
  it("the editor opened from a directly loaded sheet: one sheet, the layer copy's, without the rise; Back shows the standalone copy again without the rise", async () => {
    const view = render(tree({ standalone: true }));
    await settle();
    expect(visibleSheets()).toHaveLength(1);
    expect(visibleSheets()[0].hasAttribute("data-instant")).toBe(false);

    // «Изменить условия»: the push is intercepted into `@sheet`, the `children` slot keeps the standalone tree.
    state.pathname = `/radars/${A}/edit`;
    view.rerender(tree({ standalone: true, layer: { child: editor } }));
    await settle();
    expect(visibleSheets()).toHaveLength(1);
    expect(visibleSheets()[0].getAttribute("data-layer")).toBe("sheet");
    expect(visibleSheets()[0].hasAttribute("data-instant")).toBe(true);

    // Back to the direct load: `@sheet` shows its default again and `<Activity>` hides the layer copy.
    state.pathname = `/radars/${A}`;
    view.rerender(tree({ standalone: true, layer: { hidden: true } }));
    await settle();
    expect(visibleSheets()).toHaveLength(1);
    expect(visibleSheets()[0].hasAttribute("data-layer")).toBe(false);
    expect(visibleSheets()[0].hasAttribute("data-instant")).toBe(true);
  });

  it("Back from a directly loaded editor: the replace to the sheet is intercepted; the standalone editor and sheet leave, one sheet stays", async () => {
    state.pathname = `/radars/${A}/edit`;
    const view = render(tree({ standalone: editor }));
    await settle();
    expect(visibleSheets()).toHaveLength(1);
    expect(document.querySelector('[data-route="radar/edit"]')).not.toBeNull();

    state.pathname = `/radars/${A}`;
    view.rerender(tree({ standalone: editor, layer: {} }));
    await settle();
    expect(visibleSheets()).toHaveLength(1);
    expect(visibleSheets()[0].getAttribute("data-layer")).toBe("sheet");
    expect(document.querySelector('[data-route="radar/edit"]')).toBeNull();
  });

  it("a hidden layer copy does not count: a directly loaded sheet shows while another route keeps one under <Activity>", async () => {
    render(tree({ standalone: true, layer: { hidden: true } }));
    await settle();

    expect(visibleSheets()).toHaveLength(1);
    expect(visibleSheets()[0].hasAttribute("data-layer")).toBe(false);
    expect(visibleSheets()[0].hasAttribute("data-instant")).toBe(false);
  });
});

describe("RadarSheetRoute: the stored return waits for the list (confirmed[5])", () => {
  it("Back while the list is read again: no scroll yet, the return kept, the last radar shown; the scroll once the list is there", async () => {
    state.list = [radarOf(A, false)];
    const view = render(tree({ layer: {} }));
    await settle();
    expect(visibleSheets()[0].getAttribute("data-radar")).toBe(`${A}:paused`);

    // «Смотреть найденное»: the return stored, the feed pushed; a radar write there drops the hidden list.
    rememberRadarReturn(A, 300);
    state.pathname = "/";
    view.rerender(tree({ layer: { hidden: true } }));
    await settle();
    state.list = undefined;

    state.pathname = `/radars/${A}`;
    view.rerender(tree({ layer: {} }));
    await settle();
    expect(visibleSheets()).toHaveLength(1);
    expect(visibleSheets()[0].hasAttribute("data-instant")).toBe(true);
    expect(visibleSheets()[0].getAttribute("data-radar")).toBe(`${A}:paused`);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(peekRadarReturn(A)).not.toBeNull();

    state.list = [radarOf(A, true)];
    view.rerender(tree({ layer: {} }));
    await settle();
    expect(visibleSheets()[0].getAttribute("data-radar")).toBe(`${A}:on`);
    expect(scrollTo).toHaveBeenCalledWith(0, 300);
    expect(peekRadarReturn(A)).toBeNull();
    expect(state.replace).not.toHaveBeenCalled();
  });
});
