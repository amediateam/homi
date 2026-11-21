"use client";

import { prefersReducedMotion } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { brand } from "@/lib/brand";
import { tg } from "@/lib/telegram";

import { trackMascotTap } from "../events";

export const CONFETTI_PIECES = 12;
export const CONFETTI_MS = 1100;
export const CONFETTI_STAGGER_MS = 25;
/** The haptic pattern: success at once, a heavy impact at 260 ms, a medium one at 420 ms. */
export const HAPTIC_HEAVY_MS = 260;
export const HAPTIC_MEDIUM_MS = 420;
/** A mascot tap repeats the celebration at most once per this time. */
export const MASCOT_REPEAT_MS = 800;

const COLORS = ["var(--accent)", "var(--good)", "var(--warn)", "var(--danger)"];

function playHaptics(): ReturnType<typeof setTimeout>[] {
  tg.haptic.success();
  return [setTimeout(() => tg.haptic.impact("heavy"), HAPTIC_HEAVY_MS), setTimeout(() => tg.haptic.impact("medium"), HAPTIC_MEDIUM_MS)];
}

/**
 * The celebration of the done step (WP-81, SCR-056, BR-APP-096): 12 confetti pieces (1.1 s on `--ease-out`) staggered
 * by 25 ms and HOMI's mascot button (`brand.assets.hooray`, DEC-40); the success haptic, a heavy impact at 260 ms and a
 * medium one at 420 ms. A mascot tap repeats both at most once per 800 ms and sends `owner_mascot_tap` at most once
 * per 30 s. Lite graphics and reduced motion show the confetti still. `auto: false` (an edit) plays only after a tap.
 */
export function Celebration({ auto }: { auto: boolean }) {
  const t = useTranslations();
  const [round, setRound] = useState(auto ? 1 : 0);
  const lastTap = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (round === 0) {
      return undefined;
    }
    timers.current = playHaptics();
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, [round]);

  const still = typeof document !== "undefined" && (document.documentElement.classList.contains("lite") || prefersReducedMotion());

  return (
    <div data-celebration="" className="relative grid place-items-center py-4">
      {round === 0 ? null : (
        <div key={round} aria-hidden data-confetti={still ? "still" : "moving"} className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: CONFETTI_PIECES }, (_, index) => (
            <span
              key={index}
              data-confetti-piece=""
              className="absolute top-1/3 left-1/2 size-2 rounded-[2px]"
              style={{
                backgroundColor: COLORS[index % COLORS.length],
                transform: still ? `translate(${(index - 6) * 18}px, ${(index % 3) * 14 - 40}px) rotate(${index * 30}deg)` : undefined,
                animation: still ? "none" : `confetti-${index % 4} ${CONFETTI_MS}ms var(--ease-out) ${index * CONFETTI_STAGGER_MS}ms both`,
              }}
            />
          ))}
        </div>
      )}
      <button
        type="button"
        data-action="mascot"
        aria-label={t("own.mascotTap")}
        onClick={() => {
          const now = Date.now();
          if (now - lastTap.current < MASCOT_REPEAT_MS) {
            return;
          }
          lastTap.current = now;
          trackMascotTap(now);
          setRound((value) => value + 1);
        }}
        className="relative size-[132px]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- the brand's artwork, a static file */}
        <img src={brand.assets.hooray} alt="" className="size-full" />
      </button>
    </div>
  );
}
