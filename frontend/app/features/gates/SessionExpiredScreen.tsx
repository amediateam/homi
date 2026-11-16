"use client";

import { Button } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { tg } from "@/lib/telegram";

/**
 * The session expired (`03` §1.6, the fix of LB-APP-047): a sign-in with this launch's data was refused, so only
 * reopening the app helps. One sentence and «Закрыть», which closes the Mini App; no retry, no Back (the buttons of
 * WP-21 hide it in this state) and no request from here. The sentence is the screen's heading, and «Закрыть» takes the
 * focus: the screen replaces the route that may have held it.
 */
export function SessionExpiredScreen() {
  const t = useTranslations();
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    close.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section
      data-screen="session-expired"
      role="alert"
      className="mx-auto flex min-h-dvh w-full max-w-(--feed-max) flex-col items-center justify-center gap-5 px-6 pt-(--top-inset) pb-(--bottom-inset) text-center"
    >
      <h1 className="max-w-[300px] text-[17px] font-bold text-text">{t("error.sessionExpired")}</h1>
      <Button ref={close} onClick={() => tg.close()}>{t("common.close")}</Button>
    </section>
  );
}
