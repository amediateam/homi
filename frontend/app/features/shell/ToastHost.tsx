"use client";

import { cn } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useLayoutEffect } from "react";

import { reportError } from "@/lib/errors/report";
import { dismissToast, type ShownToast, type ToastScope, useToast } from "@/lib/ui/toast";

/**
 * The legacy offsets (`feedback.css`): above the tab bar and the floating controls over it; inside the filters sheet,
 * above its footer (`--fsheet-foot` of `useSheetChrome`).
 */
const BOTTOM: Record<ToastScope, string> = {
  app: "bottom-[calc(var(--tabbar-h)+var(--bottom-inset)+78px)]",
  sheet: "bottom-[calc(var(--fsheet-foot,0px)+10px)]",
};

/**
 * Legacy `.toast`: its 14 px corners and the action's 10 px are its own, off the radius scale. The shadow is the
 * `--shadow-float` token, which lite graphics flattens, not the one-off `0 8px 24px` at 20 % black of legacy.
 */
const SURFACE = "pointer-events-auto animate-rise-in rounded-[14px] bg-text/92 text-[14px] font-medium text-bg shadow-(--shadow-float)";

function ToastView({ scope, toast }: { scope: ToastScope; toast: ShownToast }) {
  const t = useTranslations();
  const { message } = toast;
  const close = () => dismissToast(scope, toast.id);
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
      <div data-toast="" className={cn(SURFACE, "flex items-center gap-3 py-1.5 pr-1.5 pl-4")}>
        <span className="line-clamp-3 min-w-0 flex-1 wrap-break-word">{text}</span>
        <button type="button" onClick={act} className="shrink-0 rounded-[10px] px-3 py-2 font-bold active:bg-bg/15">
          {message.action}
        </button>
      </div>
    );
  }
  return (
    <div data-toast="" onClick={close} className={cn(SURFACE, "px-4 py-3")}>
      <span className="line-clamp-3 wrap-break-word">{text}</span>
    </div>
  );
}

/**
 * The toast of one scope (SCR-042, WP-23): a live region that is always in the document, so a toast is announced,
 * and the toast inside it, remounted for every new one. A plain toast closes on tap; one with an action closes after
 * its button ran `run` once — a `run` that throws, or whose promise rejects, is reported and the toast still closes
 * at once. The text is clamped to three lines; the button is not. Not the Radix Toast of `@homi/ui`: it pauses on
 * blur, pointer and focus, while SCR-042 keeps strict times (`lib/ui/toast.ts` owns them). The toast closes when its
 * host is hidden or unmounted, as a closed filters sheet takes its tip along in legacy.
 */
export function ToastHost({ scope = "app" }: { scope?: ToastScope }) {
  const toast = useToast(scope);
  useLayoutEffect(() => () => dismissToast(scope), [scope]);

  return (
    <div
      role="status"
      aria-live="polite"
      data-toast-host={scope}
      className={cn("pointer-events-none fixed inset-x-0 z-(--z-toast) mx-auto max-w-(--feed-max) px-(--gutter)", BOTTOM[scope])}
    >
      {toast === null ? null : <ToastView key={toast.id} scope={scope} toast={toast} />}
    </div>
  );
}
