"use client";

import { Button, Lock } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { parseLaunch } from "@/lib/deeplinks/parse";
import { useReference } from "@/lib/reference/useReference";
import { useSession } from "@/lib/session/SessionProvider";
import { tg } from "@/lib/telegram";

import { type NoAccessRow, noAccessView } from "./accessReason";
import { useBootRetryState } from "./bootRetryStore";
import { GateWait } from "./GateWait";

const LABELS = {
  post: "noAccess.openPost",
  toBot: "noAccess.toBot",
  back: "noAccess.back",
  support: "settings.support",
} as const satisfies Record<NoAccessRow["action"], string>;

/** A medium haptic for «Перейти в бота», the light one for the others (TMA-025); links go through `tg.openLink`. */
function press(row: NoAccessRow): void {
  tg.haptic.impact(row.action === "toBot" ? "medium" : "light");
  if (row.action === "back") {
    tg.close();
  } else {
    tg.openLink(row.url);
  }
}

/**
 * The no-access screen (WP-23, SCR-003): the Lock icon, the title and text of the refusal, the checking line while a
 * re-check is pending, and the large buttons of `noAccessView` — the first one accented, as the legacy list drew it;
 * none is disabled while checking. The refusal is the session's (`reason` in the address is informative only), and
 * the texts are those of the address's catalogue, which `GateRedirector` chose by the full Telegram mapping (D-S-5).
 * No Back: the gate has no parent and its depth is reset, so Telegram shows Close. The title takes the focus when the
 * refusal shows: the screen replaces the route that may have held it, and Next.js moves none.
 *
 * Until the session is `denied` — a direct load still signing in, or the moment between a granted re-check and the
 * gate leaving — the page waits quietly (`GateWait`), so no reason flashes; after the sixth failed sign-in it shows
 * `ErrorState` with «Повторить», as the shell does. The session's server snapshot is `booting`, so the launch is read
 * on the client only.
 */
export function NoAccessScreen() {
  const t = useTranslations();
  const { status, reason } = useSession();
  const { checking } = useBootRetryState();
  const { supportUsername } = useReference();
  const denied = status === "denied";
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (denied) {
      heading.current?.focus({ preventScroll: true });
    }
  }, [denied]);

  if (!denied) {
    return <GateWait />;
  }

  const view = noAccessView({ reason, checking, supportUsername, launch: parseLaunch(tg.initData(), window.location.search) });
  return (
    <section
      data-screen="no-access"
      data-reason={view.reason}
      className="flex flex-1 flex-col items-center justify-center gap-[8px] p-[24px] text-center"
    >
      <span className="mb-[6px] grid size-[64px] place-items-center rounded-pill bg-fill text-text">
        <Lock size={30} aria-hidden />
      </span>
      <h1 ref={heading} tabIndex={-1} className="mt-[8px] text-[26px] font-bold tracking-[-0.02em] text-text outline-none">
        {t(`noAccess.title.${view.reason}`)}
      </h1>
      <p className="max-w-[300px] text-[16px] leading-[1.4] text-hint">{t(`noAccess.text.${view.reason}`)}</p>
      {view.checking ? (
        <p data-checking="" className="max-w-[300px] text-[16px] leading-[1.4] text-hint">
          {t("noAccess.checking")}
        </p>
      ) : null}
      <div className="mt-[20px] flex w-full max-w-[320px] flex-col gap-[10px]">
        {view.rows.map((row, index) => (
          <Button
            key={row.action}
            data-action={row.action}
            variant={index === 0 ? "primary" : "secondary"}
            className="h-[54px] w-full text-[17px] whitespace-normal"
            onClick={() => press(row)}
          >
            {t(LABELS[row.action])}
          </Button>
        ))}
      </div>
    </section>
  );
}
