"use client";

import { useTranslations } from "next-intl";

import { track } from "@/lib/analytics/events";
import { splitMaskedPhones } from "@/lib/phone/masked";
import { tg } from "@/lib/telegram";

import type { PhoneControl, TranslationControl } from "./controls";

const PHONE_LINK = "font-medium text-accent outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The post's text inside «Текст оригинала» (`03` SCR-018, blocks 12–13), in this order: the translate button (not
 * in ru: `translation` is `null` there), the failure line, the text, and «Перевод сделан ИИ» under a shown
 * translation. The server masked every phone number of the text (DEC-52) and the translated text alike; each one is
 * found by its masked form (`splitMaskedPhones`):
 *
 * - before the contact gave a number, while the listing has a phone, each masked number does what «Показать номер»
 *   does (`onReveal`); after a link-only answer they stay so;
 * - once it gave one, the masked numbers with the last two digits of that number show it and call (`onCall`), the
 *   others stay masked text (BR-APP-035: only the listing's own number is ever shown);
 * - without a phone they are masked text.
 *
 * The contact and translation work, and the medium haptic of a phone tap, are the caller's; the translate button
 * plays the light one. A copy of the text logs `original_copied` with the number alone.
 */
export function OriginalText({
  number,
  text,
  phone,
  translation,
}: {
  number: number;
  text: string;
  phone: PhoneControl | null;
  translation: TranslationControl | null;
}) {
  const t = useTranslations();
  const translatedText = translation?.shown && translation.text ? translation.text : null;

  return (
    <div className="flex flex-col gap-[8px]">
      {translation !== null ? (
        <button
          type="button"
          data-translate=""
          disabled={translation.pending}
          onClick={() => {
            tg.haptic.impact("light");
            translation.toggle();
          }}
          className="self-start font-medium text-accent outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:text-hint"
        >
          {t(translation.pending ? "listing.translating" : translatedText !== null ? "listing.showOriginal" : "listing.translate")}
        </button>
      ) : null}
      {translation?.failed ? (
        <p data-translate-failed="" className="text-[13px] text-danger">
          {t("listing.translateFailed")}
        </p>
      ) : null}
      <pre
        data-original-text=""
        onCopy={() => track("original_copied", { listing_id: number })}
        className="ph-mask font-sans text-[15px] leading-normal break-words whitespace-pre-wrap"
      >
        {splitMaskedPhones(translatedText ?? text).map((part, index) => {
          if (part.kind === "text") {
            return part.text;
          }
          if (phone !== null && phone.tail === null) {
            return (
              <button key={index} type="button" data-masked-phone={part.tail} onClick={() => phone.onReveal("text")} className={PHONE_LINK}>
                {part.text}
              </button>
            );
          }
          if (phone !== null && phone.tail === part.tail) {
            return (
              <button key={index} type="button" data-own-phone="" onClick={() => phone.onCall("text")} className={PHONE_LINK}>
                {phone.display ?? part.text}
              </button>
            );
          }
          return (
            <span key={index} data-masked-phone-text="">
              {part.text}
            </span>
          );
        })}
      </pre>
      {translatedText !== null ? (
        <p data-machine-translation="" className="text-[13px] text-hint">
          {t("listing.machineTranslation")}
        </p>
      ) : null}
    </div>
  );
}
