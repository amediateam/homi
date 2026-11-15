"use client";

import { useEffect, useRef } from "react";

import { usePathname } from "@/i18n/navigation";
import { nav } from "@/lib/navigation/nav";
import { routes } from "@/lib/navigation/routes";
import { useBack } from "@/lib/navigation/useBack";
import { useSession } from "@/lib/session/SessionProvider";
import { tg } from "@/lib/telegram";
import { useSdkGeneration } from "@/lib/telegram/useTelegram";

const isUnderSettings = (pathname: string): boolean => pathname === "/settings" || pathname.startsWith("/settings/");

/**
 * Telegram's BackButton and SettingsButton drive the router (`25` §3.2, TMA-022, TMA-023). BackButton is shown iff
 * Back is possible and the session has not expired; SettingsButton (7.0+) opens settings, and because every slot
 * renders nothing for other addresses no sheet or overlay stays over it (fix of LB-APP-046). One handler each,
 * registered again for a late SDK.
 */
export function TelegramButtons(): null {
  const { canGoBack, back } = useBack();
  const { status } = useSession();
  const pathname = usePathname();
  const generation = useSdkGeneration();
  const backRef = useRef(back);
  const pathnameRef = useRef(pathname);
  const visible = canGoBack && status !== "expired";

  useEffect(() => {
    backRef.current = back;
    pathnameRef.current = pathname;
  }, [back, pathname]);

  useEffect(() => {
    tg.backButton.setVisible(visible);
  }, [visible, generation]);

  useEffect(() => tg.backButton.onClick(() => backRef.current()), [generation]);

  useEffect(() => {
    if (!tg.settingsButton.available()) {
      return undefined;
    }
    tg.settingsButton.setVisible(true);
    return tg.settingsButton.onClick(() => {
      if (!isUnderSettings(pathnameRef.current)) {
        nav.push(routes.settings());
      }
    });
  }, [generation]);

  return null;
}
