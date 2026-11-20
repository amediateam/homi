"use client";

import { cn, leaveRef } from "@homi/ui";
import { useTranslations } from "next-intl";
import { type CSSProperties, type ReactNode, type TouchEvent, useLayoutEffect, useRef, useState } from "react";

import { reportError } from "@/lib/errors/report";
import { type ToastPlacement, useToastPlacement } from "@/lib/ui/shellState";
import { dismissToast, type ShownToast, TOAST_ACTION_MS, type ToastScope, useToast } from "@/lib/ui/toast";

/**
 * The legacy offsets by what is below the toast (`feedback.css:23-29,77-88`; literals there, so no token here): 20 px
 * above the tab bar and the bottom inset; 78 px above them while the view toggle is shown; 16 px above the bottom
 * inset over a sub-page; 88 px above it over the listing's CTA bar.
 */
const APP_BOTTOM: Record<ToastPlacement, string> = {
  tabbar: "bottom-[calc(var(--tabbar-h)+var(--bottom-inset)+20px)]",
  toggle: "bottom-[calc(var(--tabbar-h)+var(--bottom-inset)+78px)]",
  subpage: "bottom-[calc(var(--bottom-inset)+16px)]",
  cta: "bottom-[calc(var(--bottom-inset)+88px)]",
};

/** Inside a sheet (scope `sheet`): above its footer (`--fsheet-foot` of `useSheetChrome`), as legacy `.fsheet-tip .toast`. */
const SHEET_BOTTOM = "bottom-[calc(var(--fsheet-foot,0px)+10px)]";

/** A toast dragged down further than this (px) closes on release; a shorter drag returns it (legacy `Toast.jsx`). */
export const TOAST_DISMISS_DRAG_PX = 36;

/**
 * The drag of a toast (SCR-042): it follows a finger downwards and fades (`max(0.2, 1 − dy/120)`), with no transition
 * while it moves; released past `TOAST_DISMISS_DRAG_PX` it closes, otherwise it returns. Touch only, as legacy.
 */
function useToastDrag(close: () => void) {
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);
  const lastY = useRef(0);

  /** The finger is gone: the toast returns to its place, or, `dismiss`ed, closes. */
  const release = (dismiss: boolean) => {
    startY.current = null;
    lastY.current = 0;
    if (dismiss) {
      close();
    } else {
      setDragY(0);
    }
  };

  const handlers = {
    onTouchStart: (event: TouchEvent) => {
      startY.current = event.touches[0]?.clientY ?? null;
      lastY.current = 0;
    },
    onTouchMove: (event: TouchEvent) => {
      const touch = event.touches[0];
      if (startY.current !== null && touch !== undefined) {
        lastY.current = Math.max(0, touch.clientY - startY.current);
        setDragY(lastY.current);
      }
    },
    onTouchEnd: () => release(lastY.current > TOAST_DISMISS_DRAG_PX),
    // The system took the touch (a Telegram or OS gesture): not a release, so the toast returns.
    onTouchCancel: () => release(false),
  };
  const style: CSSProperties | undefined =
    dragY > 0 ? { transform: `translateY(${dragY}px)`, opacity: Math.max(0.2, 1 - dragY / 120), transition: "none" } : undefined;
  return { handlers, style };
}

/**
 * Legacy `.toast`: its 14 px corners and the action's 10 px are its own, off the radius scale. The shadow is the
 * `--shadow-float` token, which lite graphics flattens, not the one-off `0 8px 24px` at 20 % black of legacy.
 */
const SURFACE = "animate-rise-in rounded-[14px] bg-text/92 text-[14px] font-medium text-bg shadow-(--shadow-float)";

/**
 * The toast's leave (WP-39, BR-APP-112): a copy sinks 10 px and fades over 180 ms. None when a drag took the toast away
 * (the frame's inline transform), when another toast replaced it in the same commit, or when its host went with it.
 */
const toastLeave = leaveRef("toast", { selector: "[data-toast-drag]" });

/**
 * The element that follows the drag. Not the surface itself: its rise-in fills `both` and holds `transform: none`
 * after it ran, which would win over the drag's inline transform.
 */
function DragFrame({ drag, children }: { drag: ReturnType<typeof useToastDrag>; children: ReactNode }) {
  return (
    <div ref={toastLeave} data-toast-drag="" {...drag.handlers} style={drag.style} className="pointer-events-auto touch-none">
      {children}
    </div>
  );
}

function ToastView({ scope, toast }: { scope: ToastScope; toast: ShownToast }) {
  const t = useTranslations();
  const { message } = toast;
  const close = () => dismissToast(scope, toast.id);
  const drag = useToastDrag(close);
  const text = typeof message === "string" ? message : "key" in message ? t(message.key, message.values) : message.text;

  if (typeof message === "object" && "action" in message) {
    const act = () => {
      try {
        void Promise.resolve(message.run()).catch((error: unknown) => reportError(error, { kind: "rejection", source: "toast" }));
      } catch (error) {
        reportError(error, { kind: "error", source: "toast" });
      }
      close();
    };
    return (
      <DragFrame drag={drag}>
        <div data-toast="" className={cn(SURFACE, "flex items-center gap-3 py-1.5 pr-1.5 pl-4")}>
          <span className="line-clamp-3 min-w-0 flex-1 wrap-break-word">{text}</span>
          <button type="button" onClick={act} className="inline-flex shrink-0 items-center gap-[6px] rounded-[10px] px-3 py-2 font-bold active:bg-bg/15">
            {message.action}
            <svg data-toast-ring="" viewBox="0 0 20 20" aria-hidden>
              <circle cx="10" cy="10" r="8" />
              <circle cx="10" cy="10" r="8" pathLength={1} style={{ animationDuration: `${TOAST_ACTION_MS}ms` }} />
            </svg>
          </button>
        </div>
      </DragFrame>
    );
  }
  return (
    <DragFrame drag={drag}>
      <div data-toast="" onClick={close} className={cn(SURFACE, "px-4 py-3")}>
        <span className="line-clamp-3 wrap-break-word">{text}</span>
      </div>
    </DragFrame>
  );
}

/**
 * The toast of one scope (SCR-042, WP-23): a live region that is always in the document, so a toast is announced,
 * and the toast inside it, remounted for every new one. A plain toast closes on tap; one with an action closes after
 * its button ran `run` once — a `run` that throws, or whose promise rejects, is reported and the toast still closes
 * at once. Both can be dragged down and away (`useToastDrag`); the frame around the toast has `touch-action: none`, so
 * the drag never scrolls the page. The app's host sits by what is below it (`useToastPlacement` of the shell state); the `sheet`
 * scope above its sheet's footer. Under reduced motion the toast does not rise in and still follows a drag. The text is
 * clamped to three lines; the button is not. Not the Radix Toast of `@homi/ui`: it pauses on
 * blur, pointer and focus, while SCR-042 keeps strict times (`lib/ui/toast.ts` owns them). An action toast shows its
 * countdown on the button: a 16 px ring whose dash runs out over `TOAST_ACTION_MS` (WP-39, BR-APP-118); the toast is
 * remounted per id, so a replacement restarts the ring with the timer (the fix of LB-APP-085), and under reduced
 * motion the ring stays full. The toast closes when its
 * host is hidden or unmounted, as a closed filters sheet takes its tip along in legacy.
 */
export function ToastHost({ scope = "app" }: { scope?: ToastScope }) {
  const toast = useToast(scope);
  const placement = useToastPlacement();
  useLayoutEffect(() => () => dismissToast(scope), [scope]);

  return (
    <div
      role="status"
      aria-live="polite"
      data-toast-host={scope}
      data-placement={scope === "app" ? placement : undefined}
      className={cn(
        "pointer-events-none fixed inset-x-0 z-(--z-toast) mx-auto max-w-(--feed-max) px-(--gutter)",
        scope === "app" ? APP_BOTTOM[placement] : SHEET_BOTTOM,
      )}
    >
      {toast === null ? null : <ToastView key={toast.id} scope={scope} toast={toast} />}
    </div>
  );
}
