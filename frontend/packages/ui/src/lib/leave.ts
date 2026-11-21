"use client";

import { type RefObject, useLayoutEffect } from "react";

import { prefersReducedMotion } from "../hooks/prefersReducedMotion";

/**
 * The leave of a sheet, a sub-page, a toast or a tip (WP-39, BR-APP-112; legacy `lib/leave.js` since
 * `index-YX9bFVws.js`). When the node goes, a lifeless copy of it — class `leave`, `aria-hidden`, `inert` — plays the
 * way out through the Web Animations API and is removed. The component waits for nothing: its state changes at once,
 * and the copy is only a picture. The copy is taken in a cleanup, while the node still shows; whether it plays is
 * decided in a microtask, after the commit.
 *
 * HOMI differs from legacy in three places. Its layers are routes, and Next keeps a hidden route in the document
 * with `display: none`, so "gone" is "removed or no longer shown", not only "removed". Its sheet and backdrop are
 * siblings in a portal, so the backdrop's copy is taken with the sheet's (`backdropRef`). And a copy goes into one
 * layer at the end of `body` with the node's box, since the node's own parent may be hidden with it; the layer has
 * `display: contents`, so a copy stacks by its own `z-index` like the node did.
 *
 * A copy looks like the node and answers to none of its names: it keeps its classes and only the `data-*` attributes
 * a stylesheet rule reads (`styledData`), loses every `id`, and its `data-slot` gets the suffix `-leave`. So for the
 * length of a leave neither the app nor a test's selector meets two of anything.
 *
 * No leave: under reduced motion; in lite graphics (`html.lite`); when a gesture took the node away (`data-gone`,
 * or an inline transform on it or on a child); when the node still shows after the commit; when what holds it went
 * or was hidden with it; when another node of its kind shows that did not before (a sheet replaced by a sheet, a
 * toast by a toast).
 */
export type LeaveKind = "sheet" | "subpage" | "toast" | "tip";

export interface LeaveOptions {
  /** The nodes of this kind; the default covers sheets and sub-pages. */
  selector?: string;
  /** The sheet's backdrop: its copy fades to transparent beside the sheet's. */
  backdrop?: HTMLElement | null;
}

/** The longest a copy stays, whatever its animations report (ms). */
export const LEAVE_MAX_MS = 600;

const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";
const EASE_SHEET = "cubic-bezier(0.3, 0, 0.2, 1)";

/** Legacy's keyframe and timing per kind; every one fills forwards, so the copy rests at its end until removed. */
export const LEAVE_MOTION: Record<LeaveKind, { frame: Keyframe; duration: number; easing: string }> = {
  sheet: { frame: { transform: "translateY(100%)" }, duration: 280, easing: EASE_SHEET },
  subpage: { frame: { transform: "translateX(24%)", opacity: 0 }, duration: 200, easing: EASE_IN },
  toast: { frame: { transform: "translateY(10px)", opacity: 0 }, duration: 180, easing: EASE_IN },
  tip: { frame: { transform: "translateY(-6px) scale(0.92)", opacity: 0 }, duration: 160, easing: EASE_IN },
};

/** The backdrop of a sheet: its colour to transparent over the sheet's 280 ms. */
export const LEAVE_BACKDROP = { frame: { backgroundColor: "transparent" } satisfies Keyframe, duration: 280, easing: "ease-out" };

const SELECTORS: Partial<Record<LeaveKind, string>> = {
  sheet: '[data-slot="bottom-sheet"]',
  subpage: '[data-slot="subpage"]',
};

/** What names the live node to the app and its tests; a copy never answers to them, whatever the stylesheets say. */
const IDENTITY = ["id", "data-route", "data-layer", "data-probe", "data-toast", "data-toast-drag"];

/** The `data-*` attributes stylesheet rules read: a name with the values read, or `true` when any value counts. */
type StyledData = Map<string, Set<string> | true>;

/** An attribute selector on a `data-*` name; the first group is a backslash when the bracket is an escaped class name. */
const DATA_SELECTOR = /(\\)?\[(data-[\w-]+)(?:\s*([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?[^\]]*\]/g;

let styledCache: { sheets: number; styled: StyledData | null } | null = null;

function collectStyled(rules: CSSRuleList, styled: StyledData): void {
  for (const rule of Array.from(rules)) {
    const { selectorText, cssRules } = rule as CSSRule & { selectorText?: unknown; cssRules?: CSSRuleList };
    if (typeof selectorText === "string") {
      for (const match of selectorText.matchAll(DATA_SELECTOR)) {
        const [, escaped, name, operator, double, single, bare] = match;
        if (escaped || name === undefined) {
          continue;
        }
        const value = double ?? single ?? bare;
        const known = styled.get(name);
        if (operator !== "=" || value === undefined) {
          styled.set(name, true);
        } else if (known !== true) {
          styled.set(name, (known ?? new Set<string>()).add(value));
        }
      }
    }
    // Grouping rules (`@media`, `@layer`, `@supports`) and nested style rules.
    if (cssRules && cssRules.length > 0) {
      collectStyled(cssRules, styled);
    }
  }
}

/**
 * Which `data-*` attributes the document's stylesheets read, scanned once per set of stylesheets. `null` when one of
 * them cannot be read (served from another origin): a copy then keeps its attributes, as legacy's does.
 */
function styledData(): StyledData | null {
  const sheets = Array.from(document.styleSheets);
  if (styledCache && styledCache.sheets === sheets.length) {
    return styledCache.styled;
  }
  const styled: StyledData = new Map();
  let readable = true;
  for (const sheet of sheets) {
    try {
      collectStyled(sheet.cssRules, styled);
    } catch {
      readable = false;
    }
  }
  styledCache = { sheets: sheets.length, styled: readable ? styled : null };
  return styledCache.styled;
}

const LAYER = "data-leave-layer";

function motionOff(): boolean {
  return prefersReducedMotion() || document.documentElement.classList.contains("lite");
}

function moved(element: Element): boolean {
  return element instanceof HTMLElement && ("gone" in element.dataset || element.style.transform !== "");
}

/** A gesture already took the node away: the drag of a sheet, the swipe of a sub-page, the drag of a toast. */
function byGesture(node: HTMLElement): boolean {
  return moved(node) || Array.from(node.children).some(moved);
}

/** In the document, and neither it nor an ancestor has `display: none`. */
function shown(node: Element): boolean {
  if (!node.isConnected) {
    return false;
  }
  for (let element: Element | null = node; element; element = element.parentElement) {
    if (getComputedStyle(element).display === "none") {
      return false;
    }
  }
  return true;
}

/** The `z-index` the node paints at: its own, or the nearest ancestor's that sets one. */
function stackLevel(node: Element): string | null {
  for (let element: Element | null = node; element; element = element.parentElement) {
    const level = getComputedStyle(element).zIndex;
    if (level !== "" && level !== "auto") {
      return level;
    }
  }
  return null;
}

function leaveLayer(): HTMLElement {
  let layer = document.querySelector<HTMLElement>(`[${LAYER}]`);
  if (!layer) {
    layer = document.createElement("div");
    layer.setAttribute(LAYER, "");
    layer.style.display = "contents";
    document.body.appendChild(layer);
  }
  return layer;
}

function lifeless(copy: HTMLElement, kind: string): void {
  const styled = styledData();
  const slot = copy.getAttribute("data-slot");
  for (const element of [copy, ...Array.from(copy.querySelectorAll("*"))]) {
    for (const name of element.getAttributeNames()) {
      if (IDENTITY.includes(name)) {
        element.removeAttribute(name);
      } else if (name.startsWith("data-") && styled !== null) {
        const values = styled.get(name);
        if (values === undefined || (values !== true && !values.has(element.getAttribute(name) ?? ""))) {
          element.removeAttribute(name);
        }
      }
    }
  }
  if (slot) {
    copy.setAttribute("data-slot", `${slot}-leave`);
  }
  copy.setAttribute("data-leave", kind);
  copy.classList.add("leave");
  copy.setAttribute("aria-hidden", "true");
  copy.setAttribute("inert", "");
}

function animate(element: HTMLElement, motion: { frame: Keyframe; duration: number; easing: string }): Animation[] {
  if (typeof element.animate !== "function") {
    return [];
  }
  return [element.animate([motion.frame], { duration: motion.duration, easing: motion.easing, fill: "forwards" })];
}

/**
 * Takes a copy of `node` and, once the commit is over, plays the leave on it unless a rule above says no. Call it
 * from a cleanup (of a layout effect or of a ref callback) while the node is still in the document.
 */
export function playLeave(node: HTMLElement, kind: LeaveKind, options: LeaveOptions = {}): void {
  if (typeof document === "undefined" || motionOff() || byGesture(node) || !shown(node)) {
    return;
  }
  const holder = node.parentElement;
  const selector = options.selector ?? SELECTORS[kind];
  const kindBefore = selector ? new Set(Array.from(document.querySelectorAll(selector)).filter(shown)) : null;
  const box = node.getBoundingClientRect();
  const level = stackLevel(node);
  const scrolls: Array<[number, number, number]> = [];
  node.querySelectorAll("*").forEach((child, index) => {
    if (child.scrollTop || child.scrollLeft) {
      scrolls.push([index, child.scrollTop, child.scrollLeft]);
    }
  });
  const own = [node.scrollTop, node.scrollLeft] as const;
  const copy = node.cloneNode(true) as HTMLElement;
  const dim = options.backdrop ? (options.backdrop.cloneNode(false) as HTMLElement) : null;

  queueMicrotask(() => {
    if (shown(node) || !holder || !shown(holder)) {
      return;
    }
    if (selector && kindBefore) {
      const replaced = Array.from(document.querySelectorAll(selector)).some(
        (other) => other !== node && !kindBefore.has(other) && !other.closest(`[${LAYER}]`) && shown(other),
      );
      if (replaced) {
        return;
      }
    }
    const layer = leaveLayer();
    const copies = dim ? [dim, copy] : [copy];
    if (dim) {
      lifeless(dim, "backdrop");
      layer.appendChild(dim);
    }
    lifeless(copy, kind);
    Object.assign(copy.style, {
      position: "fixed",
      inset: "auto",
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
      margin: "0",
      maxWidth: "none",
      maxHeight: "none",
    });
    if (level !== null) {
      copy.style.zIndex = level;
    }
    layer.appendChild(copy);
    const inside = copy.querySelectorAll("*");
    for (const [index, top, left] of scrolls) {
      const child = inside[index];
      if (child) {
        child.scrollTop = top;
        child.scrollLeft = left;
      }
    }
    copy.scrollTop = own[0];
    copy.scrollLeft = own[1];

    const animations = [...(dim ? animate(dim, LEAVE_BACKDROP) : []), ...animate(copy, LEAVE_MOTION[kind])];
    const remove = () => {
      for (const one of copies) {
        one.remove();
      }
    };
    if (animations.length === 0) {
      remove();
      return;
    }
    void Promise.all(animations.map((animation) => animation.finished)).then(remove, remove);
    window.setTimeout(remove, LEAVE_MAX_MS);
  });
}

/**
 * The node of `ref` leaves when its component unmounts or its route is hidden. A mark a gesture left on a node that
 * is shown again (`data-gone`) is dropped, so its next close leaves.
 *
 * - `closest`: the node is the nearest ancestor of `ref`'s element that matches. A layout effect runs before the ref
 *   of a parent element is attached, so a component rendered inside the leaving node names it through one of its own
 *   elements (`BottomSheet`'s frame through its header).
 * - `backdropRef` is read when the effect runs: by the cleanup the backdrop's own ref may already be detached.
 */
export function useLeave(
  ref: RefObject<HTMLElement | null>,
  kind: LeaveKind,
  { closest, backdropRef, selector }: { closest?: string; backdropRef?: RefObject<HTMLElement | null>; selector?: string } = {},
): void {
  useLayoutEffect(() => {
    const node = closest ? (ref.current?.closest<HTMLElement>(closest) ?? null) : ref.current;
    if (!node) {
      return undefined;
    }
    node.removeAttribute("data-gone");
    const backdrop = backdropRef?.current ?? null;
    return () => playLeave(node, kind, { backdrop, selector });
  }, [ref, kind, closest, backdropRef, selector]);
}

/** A ref callback whose cleanup plays the leave (React 19); keep the returned function stable across renders. */
export function leaveRef(kind: LeaveKind, options?: LeaveOptions): (node: HTMLElement | null) => (() => void) | undefined {
  return (node) => (node ? () => playLeave(node, kind, options) : undefined);
}

/**
 * The layer around `inside` goes without a leave: the radar sheet closed for a listing opened from it (legacy's
 * parked sheet plays none; DEC-64).
 */
export function skipLeave(inside: Element | null): void {
  inside?.closest<HTMLElement>('[data-slot="bottom-sheet"], [data-slot="subpage"]')?.setAttribute("data-gone", "");
}
