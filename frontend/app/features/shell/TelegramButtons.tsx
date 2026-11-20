"use client";

import { useEffect, useRef } from "react";

import { usePathname } from "@/i18n/navigation";
import { backHandler } from "@/lib/navigation/backHandler";
import { nav } from "@/lib/navigation/nav";
import { matchRoute, routes } from "@/lib/navigation/routes";
import { useBack } from "@/lib/navigation/useBack";
import { useSession } from "@/lib/session/SessionProvider";
import { tg } from "@/lib/telegram";
import { useSdkGeneration } from "@/lib/telegram/useTelegram";

const isUnderSettings = (pathname: string): boolean => pathname === "/settings" || pathname.startsWith("/settings/");

/**
 * Telegram's BackButton and SettingsButton drive the router (`25` §3.2, TMA-022, TMA-023). BackButton is shown iff
 * Back is possible and the session has not expired; SettingsButton (7.0+) opens settings, and because every slot
 * renders nothing for other addresses no sheet or overlay stays over it (fix of LB-APP-046). SettingsButton is shown
 * only with a ready session and off the gate routes, where settings would bounce straight back (WP-23, D-S-15). One
 * handler each, registered again for a late SDK. A layer that took Back over (`takeOverBack`, the listing's leave of
 * WP-36) closes in its own way; otherwise Back is `back()`.
 */
export function TelegramButtons(): null {
  const { canGoBack, back } = useBack();
  const { status } = useSession();
  const pathname = usePathname();
  const generation = useSdkGeneration();
  const backRef = useRef(back);
  const pathnameRef = useRef(pathname);
  const visible = canGoBack && status !== "expired";
  const settingsVisible = status === "ready" && matchRoute(pathname).route !== "gate";

  useEffect(() => {
    backRef.current = back;
    pathnameRef.current = pathname;
  }, [back, pathname]);

  useEffect(() => {
    tg.backButton.setVisible(visible);
  }, [visible, generation]);

  useEffect(() => tg.backButton.onClick(() => (backHandler() ?? backRef.current)()), [generation]);

  useEffect(() => {
    if (tg.settingsButton.available()) {
      tg.settingsButton.setVisible(settingsVisible);
    }
  }, [settingsVisible, generation]);

  useEffect(() => {
    if (!tg.settingsButton.available()) {
      return undefined;
    }
    return tg.settingsButton.onClick(() => {
      if (!isUnderSettings(pathnameRef.current)) {
        nav.push(routes.settings());
      }
    });
  }, [generation]);

  return null;
}
