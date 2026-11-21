"use client";

import { useEffect } from "react";

import { bootState } from "@/lib/telegram/sdk";

/**
 * Ends the boot watchdog (TMA-003): once React has mounted, a failed chunk or an error no longer shows «Обновите
 * Telegram», and the global error handlers of WP-32 take over the reports (`watching`, `lib/errors/global.ts`).
 */
export function BootGuard(): null {
  useEffect(() => {
    const boot = bootState();
    if (boot !== null) {
      boot.ok = true;
      boot.watching = true;
    }
  }, []);
  return null;
}
