"use client";

import { useEffect } from "react";

import { forgetLastScreen, trackScreen } from "@/lib/analytics/posthog";
import { pushScreenLayer } from "@/lib/analytics/screens";

/**
 * Names a layer that has no address of its own while it is shown (WP-32): `map/card`, the map's selection card. The
 * top layer's name wins over the address's (`currentScreen`). Registered in an effect, so a route hidden by
 * `<Activity>` (its effects cleaned up) drops it; `active` false drops it too, e.g. while a listing covers the card.
 * Showing sends its pageview; leaving sends none (the address's next change does), and a second showing counts again.
 */
export function useScreenLayer(name: string, active = true): void {
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const pop = pushScreenLayer(name);
    trackScreen(name);
    return () => {
      pop();
      forgetLastScreen();
    };
  }, [name, active]);
}
