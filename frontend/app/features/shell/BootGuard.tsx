"use client";

import { useEffect } from "react";

import { bootState } from "@/lib/telegram/sdk";

/**
 * Ends the boot watchdog (TMA-003): once React has mounted, a failed chunk or an error no longer shows «Обновите
 * Telegram». `watching` is set by the global error handlers of WP-32 when they take over.
 */
export function BootGuard(): null {
  useEffect(() => {
    const boot = bootState();
    if (boot !== null) {
      boot.ok = true;
    }
  }, []);
  return null;
}
