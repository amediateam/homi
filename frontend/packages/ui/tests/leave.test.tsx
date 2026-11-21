import { cleanup, render } from "@testing-library/react";
import { Activity, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LEAVE_BACKDROP, LEAVE_MAX_MS, LEAVE_MOTION, type LeaveKind, leaveRef, playLeave, skipLeave, useLeave } from "../src/index";

interface Played {
  target: HTMLElement;
  frames: Keyframe[];
  timing: KeyframeAnimationOptions;
  finish: () => void;
}

let played: Played[] = [];
let reduced = false;

beforeEach(() => {
  played = [];
  reduced = false;
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduced && query.includes("reduce"), media: query }));
  // jsdom has no Web Animations: every call is recorded and finishes when the test says so.
  Element.prototype.animate = function animate(this: HTMLElement, frames: Keyframe[], timing: KeyframeAnimationOptions) {
    let finish = () => undefined as void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    played.push({ target: this, frames, timing, finish });
    return { finished } as unknown as Animation;
  } as unknown as typeof Element.prototype.animate;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, "animate");
  document.documentElement.classList.remove("lite");
  document.body.innerHTML = "";
});

const layer = () => document.querySelector<HTMLElement>("[data-leave-layer]");
const copies = () => Array.from(document.querySelectorAll<HTMLElement>("[data-leave]"));
/** The decision is taken in a microtask after the commit. */
const settle = () => Promise.resolve().then(() => Promise.resolve());

function node(markup: string): HTMLElement {
  const holder = document.createElement("div");
  holder.innerHTML = markup;
  document.body.appendChild(holder);
  return holder.firstElementChild as HTMLElement;
}

/** The cleanup runs while the node shows; the commit then removes it. */
async function leaveByRemoval(target: HTMLElement, kind: LeaveKind, options?: Parameters<typeof playLeave>[2]): Promise<void> {
  playLeave(target, kind, options);
  target.remove();
  await settle();
}

describe("playLeave: the copy", () => {
  it("puts a lifeless copy with the node's scroll into the leave layer and plays the kind's motion on it", async () => {
    const sheet = node('<div data-slot="bottom-sheet" id="s1" data-route="filters" class="z"><div data-slot="bottom-sheet-body" id="b1" data-probe="x">text</div></div>');
    sheet.querySelector("#b1")!.scrollTop = 40;
    sheet.querySelector("#b1")!.scrollLeft = 7;

    await leaveByRemoval(sheet, "sheet");

    expect(layer()?.style.display).toBe("contents");
    expect(layer()?.parentElement).toBe(document.body);
    const [copy] = copies();
    expect(copy).toBeDefined();
    expect(copy!.parentElement).toBe(layer());
    expect(copy!.classList.contains("leave")).toBe(true);
    expect(copy!.getAttribute("aria-hidden")).toBe("true");
    expect(copy!.hasAttribute("inert")).toBe(true);
    expect(copy!.getAttribute("data-leave")).toBe("sheet");
    // It does not answer to the names of the live node: no id, no route marker, another slot name, and inside it
    // no `data-*` attribute that no stylesheet reads.
    expect(copy!.getAttribute("data-slot")).toBe("bottom-sheet-leave");
    expect(copy!.hasAttribute("id")).toBe(false);
    expect(copy!.hasAttribute("data-route")).toBe(false);
    expect(copy!.classList.contains("z")).toBe(true);
    const body = copy!.firstElementChild!;
    expect(body.getAttributeNames()).toEqual([]);
    expect(body.textContent).toBe("text");
    expect(document.querySelectorAll('[data-slot="bottom-sheet"], [data-slot="bottom-sheet-body"], [data-probe], #b1')).toHaveLength(0);
    expect(body.scrollTop).toBe(40);
    expect(body.scrollLeft).toBe(7);
    expect(copy!.style.position).toBe("fixed");

    expect(played).toHaveLength(1);
    expect(played[0]!.target).toBe(copy);
    expect(played[0]!.frames).toEqual([LEAVE_MOTION.sheet.frame]);
    expect(played[0]!.timing).toEqual({ duration: 280, easing: "cubic-bezier(0.3, 0, 0.2, 1)", fill: "forwards" });
  });

  it.each([
    ["sheet", { transform: "translateY(100%)" }, 280, "cubic-bezier(0.3, 0, 0.2, 1)"],
    ["subpage", { transform: "translateX(24%)", opacity: 0 }, 200, "cubic-bezier(0.4, 0, 1, 1)"],
    ["toast", { transform: "translateY(10px)", opacity: 0 }, 180, "cubic-bezier(0.4, 0, 1, 1)"],
    ["tip", { transform: "translateY(-6px) scale(0.92)", opacity: 0 }, 160, "cubic-bezier(0.4, 0, 1, 1)"],
  ] as const)("%s leaves by legacy's keyframe, duration and curve", async (kind, frame, duration, easing) => {
    await leaveByRemoval(node("<div>x</div>"), kind);

    expect(played).toHaveLength(1);
    expect(played[0]!.frames).toEqual([frame]);
    expect(played[0]!.timing).toEqual({ duration, easing, fill: "forwards" });
  });

  it("the copy stands at the node's box, at the level the node painted at", async () => {
    const host = node('<div style="z-index: 60"><div><div data-toast-drag="">toast</div></div></div>');
    const toast = host.querySelector<HTMLElement>("[data-toast-drag]")!;
    toast.getBoundingClientRect = () => ({ left: 16, top: 500, width: 358, height: 44, right: 374, bottom: 544, x: 16, y: 500, toJSON: () => ({}) });

    await leaveByRemoval(toast, "toast");

    const { style } = copies()[0]!;
    expect([style.position, style.left, style.top, style.width, style.height]).toEqual(["fixed", "16px", "500px", "358px", "44px"]);
    expect([style.margin, style.maxWidth, style.maxHeight]).toEqual(["0px", "none", "none"]);
    // The toast has no level of its own: its host's is taken.
    expect(style.zIndex).toBe("60");
  });

  it("a node with its own level keeps it, whatever its ancestors say", async () => {
    const host = node('<div style="z-index: 60"><div data-slot="bottom-sheet" style="z-index: 50">sheet</div></div>');

    await leaveByRemoval(host.firstElementChild as HTMLElement, "sheet");

    expect(copies()[0]!.style.zIndex).toBe("50");
  });

  it("a sheet's backdrop leaves beside it: its colour to transparent over the same 280 ms", async () => {
    const sheet = node('<div data-slot="bottom-sheet">x</div>');
    const backdrop = node('<div data-slot="bottom-sheet-overlay" id="dim" class="bg-dim"><b>never copied</b></div>');
    playLeave(sheet, "sheet", { backdrop });
    sheet.remove();
    backdrop.remove();
    await settle();

    const [dim, copy] = copies();
    expect(dim!.getAttribute("data-leave")).toBe("backdrop");
    expect(dim!.getAttribute("data-slot")).toBe("bottom-sheet-overlay-leave");
    expect(dim!.hasAttribute("id")).toBe(false);
    expect(dim!.childElementCount).toBe(0);
    expect(copy!.getAttribute("data-leave")).toBe("sheet");
    expect(played.map((one) => one.target)).toEqual([dim, copy]);
    expect(played[0]!.frames).toEqual([LEAVE_BACKDROP.frame]);
    expect(played[0]!.timing).toEqual({ duration: 280, easing: "ease-out", fill: "forwards" });
  });

  it("removes the copy when every animation finished", async () => {
    await leaveByRemoval(node("<div>x</div>"), "toast");
    expect(copies()).toHaveLength(1);

    played[0]!.finish();
    await settle();
    expect(copies()).toHaveLength(0);
  });

  it(`removes the copy after ${LEAVE_MAX_MS} ms at the latest, whatever the animations report`, async () => {
    await leaveByRemoval(node("<div>x</div>"), "subpage");

    vi.advanceTimersByTime(LEAVE_MAX_MS - 1);
    expect(copies()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(copies()).toHaveLength(0);
  });

  it("a node hidden with its route, still in the document, leaves too (Next keeps a hidden route)", async () => {
    const sheet = node('<div data-slot="bottom-sheet">x</div>');
    playLeave(sheet, "sheet");
    sheet.style.display = "none";
    await settle();

    expect(sheet.isConnected).toBe(true);
    expect(copies()).toHaveLength(1);
  });

  it("without the Web Animations API nothing is left behind", async () => {
    Reflect.deleteProperty(Element.prototype, "animate");
    await leaveByRemoval(node("<div>x</div>"), "toast");

    expect(copies()).toHaveLength(0);
  });
});

describe("playLeave: what a copy keeps of the node's `data-*` attributes", () => {
  function styles(css: string): HTMLStyleElement {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    return style;
  }

  afterEach(() => {
    document.head.querySelectorAll("style").forEach((style) => style.remove());
  });

  it("only what a stylesheet rule reads: a name for any value, or a name with the value read", async () => {
    styles(`
      [data-scrolled] .header { border-color: red; }
      .data-\\[state\\=open\\]\\:animate-rise[data-state="open"] { animation: none; }
      @media (min-width: 1px) { [data-save][data-phase="done"] { background: green; } }
      .\\[\\&_\\[data-escaped\\=x\\]\\]\\:opacity-45 [data-strip=finds] { opacity: 0.45; }
      [data-size^="comp"] { height: 36px; }
    `);
    const sheet = node(
      '<div data-slot="bottom-sheet" data-scrolled="" data-state="open" data-variant="full">' +
        '<button data-slot="bottom-sheet-close" data-action="apply" data-save="" data-phase="done" data-state="closed">ok</button>' +
        '<i data-strip="finds" data-escaped="x" data-size="compact" data-phase="busy" data-testid="t"></i>' +
        "</div>",
    );

    await leaveByRemoval(sheet, "sheet");

    const [copy] = copies();
    const names = (element: Element) => element.getAttributeNames().filter((name) => name.startsWith("data-")).sort();
    // `data-variant` is read by no rule; `data-leave` and the renamed slot are the copy's own.
    expect(names(copy!)).toEqual(["data-leave", "data-scrolled", "data-slot", "data-state"]);
    // The button: its slot and its test hook go; `data-state="closed"` is a value no rule reads.
    expect(names(copy!.children[0]!)).toEqual(["data-phase", "data-save"]);
    // An escaped bracket inside a class name is not an attribute selector; `^=` counts for any value.
    expect(names(copy!.children[1]!)).toEqual(["data-size", "data-strip"]);
  });

  it("a stylesheet added later is read too", async () => {
    await leaveByRemoval(node('<div><b data-late="1">x</b></div>'), "toast");
    expect(copies()[0]!.firstElementChild!.hasAttribute("data-late")).toBe(false);
    vi.advanceTimersByTime(LEAVE_MAX_MS);

    styles("[data-late] { color: red; }");
    await leaveByRemoval(node('<div><b data-late="1">x</b></div>'), "toast");
    expect(copies()[0]!.firstElementChild!.hasAttribute("data-late")).toBe(true);
  });

  it("each sheet is scanned once: one that comes and goes is read alone, and one swapped for another at the same count is read", async () => {
    const main = styles("[data-main] { color: red; }");
    let reads = 0;
    const rules = Object.getOwnPropertyDescriptor(CSSStyleSheet.prototype, "cssRules")!;
    Object.defineProperty(main.sheet, "cssRules", {
      configurable: true,
      get() {
        reads += 1;
        return rules.get!.call(this);
      },
    });

    await leaveByRemoval(node('<div><b data-main="">x</b></div>'), "toast");
    vi.advanceTimersByTime(LEAVE_MAX_MS);
    // A scroll-lock style that comes and goes, as Radix's while a sheet is open.
    const lock = styles("body[data-scroll-locked] { overflow: hidden; }");
    await leaveByRemoval(node('<div><b data-main="">x</b></div>'), "toast");
    vi.advanceTimersByTime(LEAVE_MAX_MS);
    lock.remove();
    await leaveByRemoval(node('<div><b data-main="">x</b></div>'), "toast");
    vi.advanceTimersByTime(LEAVE_MAX_MS);
    expect(reads).toBe(1);

    // Another sheet takes the place of the one that went: the count is the same, and the new one is still read.
    const extra = styles("[data-extra] { color: blue; }");
    void extra;
    const late = styles("i { color: green; }");
    late.remove();
    styles("[data-swapped] { color: green; }");
    await leaveByRemoval(node('<div><b data-swapped="1" data-main="">x</b></div>'), "toast");
    const kept = copies()[0]!.firstElementChild!;
    expect(kept.hasAttribute("data-swapped")).toBe(true);
    expect(kept.hasAttribute("data-main")).toBe(true);
  });

  it("when a stylesheet cannot be read, the copy keeps its attributes but never the node's names", async () => {
    const style = styles("[data-x] { color: red; }");
    Object.defineProperty(style.sheet, "cssRules", {
      configurable: true,
      get: () => {
        throw new DOMException("cross-origin", "SecurityError");
      },
    });
    const second = styles("b { color: blue; }");

    await leaveByRemoval(node('<div data-slot="bottom-sheet" data-route="filters"><b id="x" data-anything="1" data-toast="">x</b></div>'), "sheet");

    const inner = copies()[0]!.firstElementChild!;
    expect(inner.getAttribute("data-anything")).toBe("1");
    expect(inner.hasAttribute("id")).toBe(false);
    expect(inner.hasAttribute("data-toast")).toBe(false);
    expect(copies()[0]!.hasAttribute("data-route")).toBe(false);
    expect(copies()[0]!.getAttribute("data-slot")).toBe("bottom-sheet-leave");
    void second;
  });
});

describe("playLeave: no leave", () => {
  it("under reduced motion", async () => {
    reduced = true;
    await leaveByRemoval(node("<div>x</div>"), "sheet");
    expect(copies()).toHaveLength(0);
  });

  it("in lite graphics", async () => {
    document.documentElement.classList.add("lite");
    await leaveByRemoval(node("<div>x</div>"), "sheet");
    expect(copies()).toHaveLength(0);
  });

  it("when a gesture took the node away: `data-gone`, an inline transform, or either on a child", async () => {
    await leaveByRemoval(node('<div data-gone="">x</div>'), "sheet");
    await leaveByRemoval(node('<div style="transform: translateY(300px)">x</div>'), "sheet");
    await leaveByRemoval(node('<div><span data-gone="">x</span></div>'), "sheet");
    await leaveByRemoval(node('<div><span style="transform: translateY(20px)">x</span></div>'), "toast");

    expect(copies()).toHaveLength(0);
    expect(played).toHaveLength(0);
  });

  it("a transform deeper than a child is not a gesture", async () => {
    await leaveByRemoval(node('<div><p><span style="transform: translateY(-30%)">3</span></p></div>'), "sheet");
    expect(copies()).toHaveLength(1);
  });

  it("when the node still shows after the commit (an effect that ran again)", async () => {
    const sheet = node("<div>x</div>");
    playLeave(sheet, "sheet");
    await settle();

    expect(copies()).toHaveLength(0);
  });

  it("when the node was already hidden", async () => {
    const sheet = node('<div style="display: none">x</div>');
    await leaveByRemoval(sheet, "sheet");
    expect(copies()).toHaveLength(0);
  });

  it("when what holds it went with it, or was hidden with it", async () => {
    const gone = node("<div>x</div>");
    playLeave(gone, "toast");
    gone.parentElement!.remove();
    await settle();

    const hidden = node("<div>x</div>");
    playLeave(hidden, "toast");
    hidden.parentElement!.style.display = "none";
    await settle();

    expect(copies()).toHaveLength(0);
  });

  it("when another node of its kind shows that did not before: a sheet replaced by a sheet", async () => {
    const first = node('<div data-slot="bottom-sheet">one</div>');
    playLeave(first, "sheet");
    first.remove();
    node('<div data-slot="bottom-sheet">two</div>');
    await settle();

    expect(copies()).toHaveLength(0);
  });

  it("a sheet that showed before and stays is not a replacement, and a hidden one that is shown is", async () => {
    const stays = node('<div data-slot="bottom-sheet">below</div>');
    const top = node('<div data-slot="bottom-sheet">top</div>');
    await leaveByRemoval(top, "sheet");
    expect(copies()).toHaveLength(1);
    expect(stays.isConnected).toBe(true);

    vi.advanceTimersByTime(LEAVE_MAX_MS);
    const waiting = node('<div data-slot="bottom-sheet" style="display: none">waiting</div>');
    const closing = node('<div data-slot="bottom-sheet">closing</div>');
    playLeave(closing, "sheet");
    closing.remove();
    waiting.style.display = "";
    await settle();
    expect(copies()).toHaveLength(0);
  });

  it("a toast replaced by a toast, by the caller's selector", async () => {
    const first = node('<div data-toast-drag="">one</div>');
    playLeave(first, "toast", { selector: "[data-toast-drag]" });
    first.remove();
    node('<div data-toast-drag="">two</div>');
    await settle();

    expect(copies()).toHaveLength(0);
  });
});

function Sheet({ gone = false }: { gone?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLeave(ref, "sheet");
  return (
    <div ref={ref} data-slot="bottom-sheet" data-gone={gone ? "" : undefined}>
      sheet
    </div>
  );
}

function Inside() {
  const ref = useRef<HTMLParagraphElement>(null);
  useLeave(ref, "sheet", { closest: '[data-slot="bottom-sheet"]' });
  return <p ref={ref}>inside</p>;
}

describe("useLeave, leaveRef, skipLeave", () => {
  it("the node leaves when its component unmounts", async () => {
    const view = render(<Sheet />);
    view.unmount();
    await settle();

    expect(copies()).toHaveLength(1);
    expect(copies()[0]!.textContent).toBe("sheet");
  });

  it("and when its route is hidden, once; shown again it is armed anew", async () => {
    const view = render(
      <Activity mode="visible">
        <Sheet />
      </Activity>,
    );
    view.rerender(
      <Activity mode="hidden">
        <Sheet />
      </Activity>,
    );
    await settle();
    expect(copies()).toHaveLength(1);

    vi.advanceTimersByTime(LEAVE_MAX_MS);
    view.rerender(
      <Activity mode="visible">
        <Sheet />
      </Activity>,
    );
    await settle();
    expect(copies()).toHaveLength(0);
    view.rerender(
      <Activity mode="hidden">
        <Sheet />
      </Activity>,
    );
    await settle();
    expect(copies()).toHaveLength(1);
  });

  it("a mark a gesture left is dropped when the node is shown, so the next close leaves", async () => {
    const view = render(<Sheet gone />);
    expect(document.querySelector('[data-slot="bottom-sheet"]')!.hasAttribute("data-gone")).toBe(false);
    view.unmount();
    await settle();
    expect(copies()).toHaveLength(1);
  });

  it("`closest`: a component inside the leaving node names it through its own element", async () => {
    const view = render(
      <div data-slot="bottom-sheet">
        <Inside />
      </div>,
    );
    view.unmount();
    await settle();

    expect(copies()).toHaveLength(1);
    expect(copies()[0]!.getAttribute("data-slot")).toBe("bottom-sheet-leave");
  });

  it("leaveRef: the cleanup of a ref callback plays the leave", async () => {
    const ref = leaveRef("toast");
    const view = render(<div ref={ref}>toast</div>);
    view.unmount();
    await settle();

    expect(copies()).toHaveLength(1);
    expect(played[0]!.frames).toEqual([LEAVE_MOTION.toast.frame]);
  });

  it("skipLeave marks the sheet or the sub-page around an element, and that close plays nothing", async () => {
    const sheet = node('<div data-slot="bottom-sheet"><div><button>find</button></div></div>');
    skipLeave(sheet.querySelector("button"));
    expect(sheet.hasAttribute("data-gone")).toBe(true);
    await leaveByRemoval(sheet, "sheet");
    expect(copies()).toHaveLength(0);

    const page = node('<section data-slot="subpage"><i>x</i></section>');
    skipLeave(page.querySelector("i"));
    expect(page.hasAttribute("data-gone")).toBe(true);
    skipLeave(null);
  });
});
