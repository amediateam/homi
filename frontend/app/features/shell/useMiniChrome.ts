import { useEffect } from "react";

import { tg } from "@/lib/telegram";

/** How far the page must scroll one way from the turning point to collapse or expand the chrome (`03` §1.2). */
export const MINI_CHROME_DELTA_PX = 24;

/** Within this distance of the top the chrome is always expanded. */
export const MINI_CHROME_TOP_ZONE_PX = 60;

const CLASS = "chrome-mini";

/**
 * Collapsed or not, and the turning point the delta is measured from: the highest point reached while expanded, the
 * lowest while collapsed. Module state, so `expandChrome()` of a tap moves the same turning point.
 */
let mini = false;
let anchor = 0;

function setMini(value: boolean): void {
  if (value !== mini) {
    mini = value;
    document.documentElement.classList.toggle(CLASS, value);
  }
}

/**
 * The collapsing chrome of the search list (WP-23, SCR-006, legacy `useMiniChrome`): while `enabled`, scrolling down
 * more than 24 px past the turning point adds `html.chrome-mini`, scrolling up more than 24 px removes it, and within
 * 60 px of the top the chrome is always expanded. The scroll is read once per frame from a passive listener. The
 * listener lives in an effect, so leaving the list, a hidden route (`preserving-ui-state.md`) or `enabled = false`
 * removes it and the class.
 */
export function useMiniChrome(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    mini = document.documentElement.classList.contains(CLASS);
    anchor = window.scrollY;
    let frame = 0;

    const update = () => {
      frame = 0;
      const y = window.scrollY;
      if (y < MINI_CHROME_TOP_ZONE_PX) {
        setMini(false);
        anchor = y;
      } else if (mini) {
        anchor = Math.max(anchor, y);
        if (anchor - y > MINI_CHROME_DELTA_PX) {
          setMini(false);
          anchor = y;
        }
      } else {
        anchor = Math.min(anchor, y);
        if (y - anchor > MINI_CHROME_DELTA_PX) {
          setMini(true);
          anchor = y;
        }
      }
    };
    const onScroll = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(update);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      document.documentElement.classList.remove(CLASS);
      mini = false;
    };
  }, [enabled]);
}

/**
 * The first tap on collapsed chrome (a tab, the view toggle, the mini title) only expands it (`03` §1.2): removes
 * `chrome-mini` with a light impact (TMA-025) and returns `true`, and the caller then stops; returns `false` when the
 * chrome was not collapsed.
 */
export function expandChrome(): boolean {
  const root = document.documentElement;
  if (!root.classList.contains(CLASS)) {
    return false;
  }
  root.classList.remove(CLASS);
  mini = false;
  anchor = window.scrollY;
  tg.haptic.impact();
  return true;
}
