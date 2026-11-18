"use client";

import type { MessageKey } from "@homi/i18n";
import {
  Ban,
  Button,
  Ellipsis,
  Globe,
  Handshake,
  House,
  type LucideIcon,
  PartyPopper,
  Search,
  Send,
  Share,
  ShoppingBag,
  Signpost,
  Users,
} from "@homi/ui";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { type RoutePresentation, RouteSheet } from "@/features/shell/RouteSheet";
import { sendFound, sendFoundWhere, type FoundInput, type FoundWhereInput } from "@/lib/actions/surveys";
import { invokeAction } from "@/lib/actions/useAction";
import { brand } from "@/lib/brand";
import { botStartUrl } from "@/lib/deeplinks/build";
import { nav } from "@/lib/navigation/nav";
import { type FoundTrigger, isFoundTrigger, routes } from "@/lib/navigation/routes";
import { useBack } from "@/lib/navigation/useBack";
import { useCloseOnce } from "@/lib/navigation/useCloseOnce";
import { tg } from "@/lib/telegram";
import { showToast } from "@/lib/ui/toast";

import { useRadarsOffRedirect } from "./useRadarsOffRedirect";

type Answer = FoundInput["answer"];
type Where = FoundWhereInput["where"];

/** The survey's steps (SCR-031): component state, never history entries — Back closes the whole survey. */
export type FoundStep = "ask" | "where" | "done";

/** The row icons of legacy `FoundSheet.jsx` (lucide, 20 px, through `@homi/ui`). */
const ICONS: Readonly<Record<Answer | Where, LucideIcon>> = {
  homi: PartyPopper,
  elsewhere: House,
  searching: Search,
  stopped: Ban,
  telegram: Send,
  olx: ShoppingBag,
  site: Globe,
  agent: Handshake,
  friends: Users,
  street: Signpost,
  other: Ellipsis,
};

/** Step 1, in the legacy order; the contract's `homi` is legacy `kvadro`, whose catalogue key stays `found.kvadro`. */
const ANSWERS: readonly { answer: Answer; label: MessageKey }[] = [
  { answer: "homi", label: "found.kvadro" },
  { answer: "elsewhere", label: "found.elsewhere" },
  { answer: "searching", label: "found.searching" },
  { answer: "stopped", label: "found.stopped" },
];

/** Step 2, in the order of the spec's rows; the codes are the enum of `POST /surveys/found/where` (WP-13). */
const WHERE: readonly Where[] = ["telegram", "olx", "site", "agent", "friends", "street", "other"];

const TITLES: Readonly<Record<Exclude<FoundStep, "done">, MessageKey>> = {
  ask: "found.title",
  where: "found.whereTitle",
};

const TEXTS: Readonly<Record<Exclude<FoundStep, "done">, MessageKey>> = {
  ask: "found.text",
  where: "found.whereText",
};

/** Legacy `.city-row.found-row`: 13 px × 4 px, a hairline between rows, a 38 px icon disc and a 17 px label. */
const ROW =
  "flex w-full items-center gap-[12px] border-b-[0.5px] border-sep px-[4px] py-[13px] text-left outline-none select-none last:border-b-0 focus-visible:bg-fill active:opacity-70";

interface FoundRowProps {
  /** `data-found` (an answer) or `data-where` (a place): what the end-to-end specs select. */
  mark: { "data-found": Answer } | { "data-where": Where };
  icon: LucideIcon;
  label: string;
  onSelect: () => void;
}

function FoundRow({ mark, icon: Icon, label, onSelect }: FoundRowProps) {
  return (
    <button type="button" {...mark} onClick={onSelect} className={ROW}>
      <span aria-hidden className="grid size-[38px] flex-none place-items-center rounded-pill bg-fill text-text">
        <Icon size={20} strokeWidth={2} />
      </span>
      <b className="min-w-0 text-[17px] font-semibold tracking-[-0.01em] text-text">{label}</b>
    </button>
  );
}

/**
 * The survey «Нашли жильё?» at `/radars/found?trigger=pause|delete` (SCR-031, BR-APP-049; legacy `FoundSheet.jsx`),
 * in both trees. It opens only when a pause or a delete answered `ask_found` (the radar tab and the radar sheet,
 * WP-30); the client never asks on its own. A compact `RouteSheet` without ×: the backdrop, the drag, Telegram's Back
 * and every final answer close it, through one `back()` guarded per address (`useCloseOnce`), so a row tap and a
 * backdrop tap that race step back once.
 *
 * - `ask`: «Да, через HOMI» → success haptic and the congratulations; «Да, в другом месте» → `where`, the body
 *   scrolled to the top; «Ещё ищу» and «Больше не ищу» close with their thank-you toast.
 * - `where`: seven rows, each closes with «Поздравляем! 🎉 Спасибо, что рассказали».
 * - `done`: the 132 px `brand.assets.hooray`, «Поздравляем с новосельем!», its text, «Рассказать друзьям» — only
 *   when HOMI's bot is known (`botStartUrl("s_friend")`): `tg.shareUrl` of the bot link, then close — and «Готово».
 *   Legacy has no header on this step; the dialog keeps the heading as its hidden name.
 *
 * Every row plays a light impact (legacy). The answers are fire-and-forget: `sendFound({ answer, trigger })` and
 * `sendFoundWhere({ where })` through `invokeAction`, not awaited, errors dropped, rows never disabled. `trigger` is
 * read from the address at each tap, so a second `ask_found` that replaces the address while the survey is open
 * replaces the trigger and keeps the step; a copy hidden with its cached route starts at `ask` when it is shown again.
 * A missing or unknown `trigger` replaces the address with the tab: the sheet frame stays without rows until then, so
 * the server HTML of a direct load still holds `data-route`. While radars are switched off (DEC-51) it renders nothing
 * and gives way to the tab (`useRadarsOffRedirect`).
 */
export function FoundSheet({ presentation }: { presentation: RoutePresentation }) {
  const off = useRadarsOffRedirect();
  const address = useSearchParams();
  const raw = address?.get("trigger") ?? null;
  const trigger: FoundTrigger | null = isFoundTrigger(raw) ? raw : null;

  useEffect(() => {
    if (!off && trigger === null) {
      nav.replace(routes.radars());
    }
  }, [off, trigger]);

  return off ? null : <FoundSurvey presentation={presentation} trigger={trigger} />;
}

function FoundSurvey({ presentation, trigger }: { presentation: RoutePresentation; trigger: FoundTrigger | null }) {
  const t = useTranslations();
  const locale = useLocale();
  const { back } = useBack();
  const close = useCloseOnce(back);
  const [step, setStep] = useState<FoundStep>("ask");
  const content = useRef<HTMLDivElement>(null);
  const shareUrl = botStartUrl("s_friend");

  // A copy hidden with its cached route starts over when shown again (a layout effect cleanup, `preserving-ui-state.md`).
  useLayoutEffect(() => () => setStep("ask"), []);

  const answer = (value: Answer) => {
    tg.haptic.impact("light");
    if (trigger !== null) {
      void invokeAction(sendFound, { answer: value, trigger }, locale).catch(() => undefined);
    }
    if (value === "homi") {
      tg.haptic.success();
      setStep("done");
    } else if (value === "elsewhere") {
      const body = content.current?.closest('[data-slot="bottom-sheet-body"]');
      if (body) {
        body.scrollTop = 0;
      }
      setStep("where");
    } else {
      close();
      showToast({ key: value === "searching" ? "found.thanksSearching" : "found.thanksStopped" });
    }
  };

  const where = (value: Where) => {
    tg.haptic.impact("light");
    void invokeAction(sendFoundWhere, { where: value }, locale).catch(() => undefined);
    close();
    showToast({ key: "found.thanksYes" });
  };

  const share = (url: string) => {
    tg.haptic.impact("light");
    void tg.shareUrl(url, t("found.shareText"));
    close();
  };

  const title = step === "done" ? <span className="sr-only">{t("found.congrats")}</span> : t(TITLES[step]);

  return (
    <RouteSheet presentation={presentation} variant="compact" title={title} onClose={close}>
      <div ref={content} data-route="radars/found" data-layer={presentation === "layer" ? "sheet" : undefined} data-step={step}>
        {trigger === null ? null : step === "done" ? (
          <div className="flex flex-col items-center gap-[8px] px-[24px] pt-[8px] pb-[4px] text-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- the brand layer's local artwork, as `EmptyState` shows its mascots. */}
            <img src={brand.assets.hooray} alt="" width={132} height={132} draggable={false} className="size-[132px] object-contain" />
            <h2 aria-hidden className="text-[24px] font-bold tracking-[-0.03em] text-text">
              {t("found.congrats")}
            </h2>
            <p className="mb-[10px] max-w-[320px] text-[15px] leading-[1.4] text-hint">{t("found.congratsText")}</p>
            {shareUrl !== null ? (
              <Button data-action="share" className="h-[48px] w-full px-[20px] text-[16px]" onClick={() => share(shareUrl)}>
                <Share size={18} aria-hidden />
                {t("found.share")}
              </Button>
            ) : null}
            <Button variant="text" data-action="done" className="px-[16px] pt-[12px] pb-[4px] text-[15px] text-text" onClick={close}>
              {t("found.done")}
            </Button>
          </div>
        ) : (
          <>
            <p className="px-[20px] pb-[6px] text-[15px] leading-[1.35] text-hint">{t(TEXTS[step])}</p>
            <div className="flex flex-col px-[16px]">
              {step === "ask"
                ? ANSWERS.map(({ answer: value, label }) => (
                    <FoundRow key={value} mark={{ "data-found": value }} icon={ICONS[value]} label={t(label)} onSelect={() => answer(value)} />
                  ))
                : WHERE.map((value) => (
                    <FoundRow key={value} mark={{ "data-where": value }} icon={ICONS[value]} label={t(`found.where.${value}`)} onSelect={() => where(value)} />
                  ))}
            </div>
          </>
        )}
      </div>
    </RouteSheet>
  );
}
