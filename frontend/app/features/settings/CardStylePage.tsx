"use client";

import { Button, Check, cn, Spinner } from "@homi/ui";
import { useTranslations } from "next-intl";

import { sendCardSample } from "@/lib/actions/settings";
import { useAction } from "@/lib/actions/useAction";
import { tg } from "@/lib/telegram";

import { CardPreview } from "./CardPreview";
import { setCardSample, startCardSample, useCardSample } from "./cardSample";
import { cardStyleOf } from "./format";
import { usePresetSave } from "./usePresetSave";

const STYLES = ["classic", "rich"] as const;

/**
 * «Вид карточек» (WP-31, SCR-048, BR-APP-074; legacy `CardStylePicker.jsx`): the two styles side by side in a radio
 * group, each with the mock of the bot's message, its name and its hint; the page's hint; and a bottom panel with
 * «Прислать пример в чат». A pick of the other style, while no sample is on its way, sets the sample back to `idle`
 * and saves optimistically (`usePresetSave`: a light impact, the answer replaces the settings, a failure restores
 * them). The button plays a light impact and asks the bot for a sample: «Пример — в чате с ботом» with how to see it
 * and the success haptic, or «Пример не отправился — вид всё равно сохранён» and the warning haptic for `sent: false`
 * or a failure. The result stays until the next pick or until the settings tab unmounts (LB-APP-053). No «Новое»
 * pill (DEC-57).
 */
export function CardStylePage() {
  const t = useTranslations();
  const { settings, save } = usePresetSave();
  const sample = useCardSample();
  const send = useAction(sendCardSample);
  if (settings === undefined) {
    return null;
  }
  const current = cardStyleOf(settings);

  const pick = (style: (typeof STYLES)[number]) => {
    if (style === current || sample === "sending") {
      return;
    }
    setCardSample("idle");
    void save({ card_style: style });
  };

  const askSample = () => {
    tg.haptic.impact("light");
    const settle = startCardSample();
    void send(null)
      .catch(() => null)
      .then((result) => {
        const sent = result?.ok === true && result.data.sent;
        if (!settle(sent ? "sent" : "failed")) {
          return;
        }
        if (sent) {
          tg.haptic.success();
        } else {
          tg.haptic.warning();
        }
      });
  };

  return (
    <div data-card-style="">
      <div
        role="radiogroup"
        aria-label={t("settings.cards._")}
        className="grid grid-cols-2 gap-x-[10px]"
        onKeyDown={(event) => {
          // The arrow keys move the choice, as in a radio group; only the checked option takes the Tab stop.
          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
            return;
          }
          event.preventDefault();
          const other = current === "classic" ? "rich" : "classic";
          pick(other);
          event.currentTarget.querySelector<HTMLElement>(`[data-card-style-option="${other}"]`)?.focus();
        }}
      >
        {STYLES.map((style) => {
          const checked = style === current;
          return (
            <button
              key={style}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              data-card-style-option={style}
              onClick={() => pick(style)}
              className={cn(
                "flex min-w-0 flex-col gap-[6px] rounded-[18px] bg-fill px-[8px] pt-[8px] pb-[12px] text-left outline-none transition-shadow duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                checked ? "shadow-[0_0_0_1.5px_var(--text)]" : "shadow-[0_0_0_1.5px_transparent]",
              )}
            >
              <CardPreview style={style} />
              <span className="mx-[2px] pt-[6px] text-[15px] font-semibold text-text">{t(`settings.cards.${style}`)}</span>
              <span className="mx-[2px] text-[13px] leading-[1.35] text-hint">{t(`settings.cards.${style}Hint`)}</span>
            </button>
          );
        })}
      </div>
      <p className="mx-[4px] mt-[8px] mb-[130px] text-[13px] leading-[1.4] text-hint">{t("settings.cards.hint")}</p>
      <div className="glass fixed inset-x-0 bottom-0 z-3 border-t-[0.5px] border-sep px-(--gutter) pt-[12px] pb-[calc(12px+var(--bottom-inset))]">
        <div className="mx-auto flex max-w-(--feed-max) flex-col gap-[10px]">
          <div role="status" aria-live="polite" className="contents">
          {sample === "sent" ? (
            <div data-card-sample="sent" className="mx-[4px] flex items-start gap-[6px] text-[13px] font-semibold text-text">
              <Check size={16} strokeWidth={2.5} aria-hidden className="mt-[1px] flex-none" />
              <span>
                {t("settings.cards.sent")}
                <span className="mt-[2px] block font-normal text-hint">{t("settings.cards.minimize")}</span>
              </span>
            </div>
          ) : null}
          {sample === "failed" ? (
            <p data-card-sample="failed" className="mx-[4px] text-[13px] text-hint">
              {t("settings.cards.failed")}
            </p>
          ) : null}
          </div>
          <Button data-action="card-sample" className="h-[48px] w-full gap-[8px] disabled:opacity-70" disabled={sample === "sending"} onClick={askSample}>
            {sample === "sending" ? <Spinner aria-hidden className="size-[16px] border-2" /> : null}
            {t(sample === "sending" ? "settings.cards.sending" : "settings.cards.send")}
          </Button>
        </div>
      </div>
    </div>
  );
}
