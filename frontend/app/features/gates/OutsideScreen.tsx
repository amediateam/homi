"use client";

import { useTranslations } from "next-intl";

import { useSession } from "@/lib/session/SessionProvider";

import { GateWait } from "./GateWait";

/**
 * Outside Telegram (WP-23, SCR-002): the launch brought no `initData`, so only the one sentence of legacy's bare
 * `empty` state shows — no button, no Back, no request of its own and no analytics. The sentence is the page's
 * heading, drawn as the legacy line (the base styles give a heading no size or weight of its own); the texts are
 * those of the address's locale. In development the Telegram emulator of WP-21 draws its form over the page.
 *
 * A late SDK that brings the launch data starts the session from this page, and `GateRedirector` leaves it once the
 * session is decided. Meanwhile the user is inside Telegram, so the sentence gives way to the quiet wait of the other
 * gates — with `ErrorState` and «Повторить» after the sixth failed sign-in. The server and the hydration pass read a
 * session that is not prepared yet, so the page's HTML is the sentence.
 */
export function OutsideScreen() {
  const t = useTranslations();
  const { status, prepared } = useSession();
  if (prepared && status !== "outside") {
    return <GateWait />;
  }
  return (
    <h1 data-screen="outside" className="px-[24px] py-[64px] text-center text-hint">
      {t("app.openViaBot")}
    </h1>
  );
}
