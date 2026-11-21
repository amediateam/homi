"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { track } from "@/lib/analytics/events";
import { useSession } from "@/lib/session/SessionProvider";
import { tg } from "@/lib/telegram";
import { showToast } from "@/lib/ui/toast";

import { homeOfferDue, recordVisitDay, setHomeOffered } from "./homeScreen";
import { canTakeSlot, getNudgeSlot, type NudgeEnv, releaseSlot, subscribeNudgeSlot, takeSlot, useNudgeSlot } from "./store";

/** The calm before the offer (legacy `HOME_OFFER_DELAY_MS`). */
export const HOME_OFFER_DELAY_MS = 4_000;
/** The card hides itself this long after it rendered, without an event. */
export const HOME_SHOW_MS = 10_000;

/** The day of this launch is recorded once, when the session is first ready. */
let recorded = false;

export interface HomeOffer {
  /** The card holds the slot and renders while the host's rule lets a nudge render. */
  visible: boolean;
  /** 10 s on screen: hide, no event. */
  expire: () => void;
  /** ×: hide, `home_screen_closed`. */
  close: () => void;
  /** «Добавить»: hide, then Telegram's own dialog. */
  add: () => void;
}

/** The host's rule for the home slot, with the slot read now (BR-APP-046 as of `index-DY_DH7h-.js`). */
function calm(env: NudgeEnv): boolean {
  return env.allowed && !env.toast && canTakeSlot("home", getNudgeSlot());
}

/**
 * The home-screen offer (WP-31, BR-APP-045, SCR-041), mounted by `NudgeHost`. It records the launch's visit day once,
 * when the session is ready, and offers the card when all hold: Telegram 8.0 or later, three visit days, not offered
 * yet, and the calm of the home slot — the feed list, nothing open, no follow nudge or its candidate, no return banner
 * or pending return check, no toast. After 4 s of the same calm it asks Telegram for the status (1.5 s at most, else
 * `unknown`), and only for `missed` it takes the slot, tracks `home_screen_offered` and writes `offered: true` — the
 * fix of LB-APP-040. A return banner or a follow nudge that takes the slot while the card is up hides it without an
 * event and writes `offered: false` again, so the offer comes back at a later calm (the home part of LB-APP-049).
 * Telegram's "added" event, from anywhere, tracks `home_screen_added`, hides the card and shows «Значок HOMI
 * добавлен на экран телефона».
 */
export function useHomeScreenOffer(env: NudgeEnv): HomeOffer {
  const { status } = useSession();
  const slot = useNudgeSlot();
  const [ticket, setTicket] = useState<number | null>(null);
  const held = useRef<number | null>(null);
  const latestEnv = useRef(env);
  useEffect(() => {
    latestEnv.current = env;
  });
  const supported = tg.isVersionAtLeast("8.0");

  useEffect(() => {
    if (status === "ready" && !recorded) {
      recorded = true;
      recordVisitDay();
    }
  }, [status]);

  const hide = useCallback(() => {
    const taken = held.current;
    held.current = null;
    setTicket(null);
    if (taken !== null) {
      releaseSlot("home", taken);
    }
  }, []);

  useEffect(() => {
    if (!supported) {
      return undefined;
    }
    return tg.homeScreen.onAdded(() => {
      track("home_screen_added");
      hide();
      showToast({ key: "home.added" });
    });
  }, [supported, hide]);

  // A higher nudge takes the slot from the card: hidden, no event, to be offered again later. One subscription for the
  // hook's life, reading the held ticket, so a displacement right after the take is not missed.
  useEffect(
    () =>
      subscribeNudgeSlot(() => {
        const { active } = getNudgeSlot();
        if (held.current !== null && active !== null && active !== "home") {
          held.current = null;
          setTicket(null);
          setHomeOffered(false);
        }
      }),
    [],
  );

  const waiting = supported && status === "ready" && ticket === null && calm(env) && homeOfferDue();
  useEffect(() => {
    if (!waiting) {
      return undefined;
    }
    let live = true;
    const timer = setTimeout(() => {
      if (!calm(latestEnv.current) || !homeOfferDue()) {
        return;
      }
      void tg.homeScreen.status().then((answer) => {
        if (!live || answer !== "missed" || !calm(latestEnv.current)) {
          return;
        }
        const taken = takeSlot("home");
        if (taken === null) {
          return;
        }
        held.current = taken;
        setTicket(taken);
        track("home_screen_offered");
        setHomeOffered(true);
      });
    }, HOME_OFFER_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [waiting]);

  return {
    visible: ticket !== null && slot.active === "home",
    expire: hide,
    close: () => {
      track("home_screen_closed");
      hide();
    },
    add: () => {
      tg.haptic.impact("medium");
      hide();
      tg.homeScreen.add();
    },
  };
}

/** Tests only. */
export function resetHomeOffer(): void {
  recorded = false;
}
