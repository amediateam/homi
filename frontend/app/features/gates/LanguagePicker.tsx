"use client";

import { isLocale, type Locale, locales } from "@homi/config";
import { Button, Globe, Skeleton } from "@homi/ui";
import { useTranslations } from "next-intl";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { updateSettings } from "@/lib/actions/settings";
import { useAction } from "@/lib/actions/useAction";
import { type DevFlags, devFlags } from "@/lib/flags";
import type { Reference } from "@/lib/reference/types";
import { useReference } from "@/lib/reference/useReference";
import { useSession } from "@/lib/session/SessionProvider";
import { detectLocale, tg } from "@/lib/telegram";
import { failed } from "@/lib/ui/feedback";

import { gateState } from "./gateState";
import { GateWait } from "./GateWait";

/** «Выберите язык» in each language — constants, not catalogue text: the catalogue's language is being chosen. */
const CHOOSE: Readonly<Record<Locale, string>> = {
  ru: "Выберите язык",
  uz: "Tilni tanlang",
  en: "Choose a language",
};

interface LocaleOption {
  code: Locale;
  name: string;
}

/** The buttons when the reference data lists no locale the app knows (it should not happen). */
const FALLBACK: readonly LocaleOption[] = [
  { code: "ru", name: "Русский" },
  { code: "uz", name: "Oʻzbekcha" },
  { code: "en", name: "English" },
];

/** The reference data's locales the app can show, in the server's order; the three known ones when none is left. */
function localesOf(reference: Reference): readonly LocaleOption[] {
  const listed: unknown[] = Array.isArray(reference.locales) ? reference.locales : [];
  const known = listed.filter(
    (item): item is LocaleOption =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as LocaleOption).code === "string" &&
      isLocale((item as LocaleOption).code) &&
      typeof (item as LocaleOption).name === "string" &&
      (item as LocaleOption).name !== "",
  );
  return known.length > 0 ? known : FALLBACK;
}

/** Row 5 is passed for this launch even while `me` is not patched yet; module memory, written from the tap only. */
function rememberPick(): void {
  gateState.localePicked = true;
}

/** The Telegram language first, the others in the server's order. */
function ordered(options: readonly LocaleOption[], first: Locale): LocaleOption[] {
  return [...options.filter((option) => option.code === first), ...options.filter((option) => option.code !== first)];
}

function LanguageSkeleton() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[8px] p-[24px]">
      <Skeleton className="mb-[6px] size-[64px] rounded-pill" />
      <Skeleton className="mt-[8px] h-7 w-48" />
      <Skeleton className="h-4 w-60" />
      <div className="mt-[20px] flex w-full max-w-[320px] flex-col gap-[10px]">
        {locales.map((code) => (
          <Skeleton key={code} className="h-[54px] w-full rounded-pill" />
        ))}
      </div>
    </div>
  );
}

/**
 * The first-launch language choice (SCR-004, `/welcome/language`): the Globe, «Выберите язык» in the Telegram
 * language with the two other phrases below, and one button per locale of the reference data — the Telegram language
 * first and accent-coloured, the rest in the server's order.
 *
 * The Telegram language uses the full mapping (TMA-008: `uz*` → uz, `en*` → en, anything else → ru), as the legacy
 * picker does (`getTelegramLanguage`, `LanguagePicker.jsx`) and the no-access screen of WP-23 (D-S-5) — not the
 * pre-session detector of BR-APP-050, which with DEV-020 off maps `en` to ru (LB-APP-032): this screen is where an
 * English user leaves Russian, so it must greet them in English and offer English first.
 *
 * A tap (medium haptic, as legacy) disables every button and saves the locale (`useAction`, so header mode passes the
 * token). On success the gate memory and `me` are updated — `patchMe`, not a re-read: on stubs `GET /me` keeps the old
 * locale — and the picker stays disabled: `GateRedirector` (row 7) replaces the address once, with the return address
 * in the chosen locale, without a reload (D-S-6). A failure enables the buttons again with the error haptic
 * (`failed({ toast: false })`) and shows «Не получилось сохранить» as a line under the list with `role="alert"`, as
 * legacy since `index-CIa0Ldj2.js` (LB-APP-027): no toast on this screen. The next tap clears the line before it
 * saves. A second tap while saving and a result after the page was left change nothing. No Back: the gates hide it.
 *
 * The buttons are a group named by the heading, which takes the focus when the picker shows (the page replaces the
 * route that may have held it, and Next.js moves none). They are disabled with `aria-disabled`, not `disabled`: a
 * disabled button drops the focus of the tap, which would then be gone when a failure enables the picker again.
 */
export function LanguagePicker({ flags = devFlags }: { flags?: DevFlags }) {
  const t = useTranslations();
  const { status, patchMe } = useSession();
  const { reference } = useReference();
  const save = useAction(updateSettings);
  const [saving, setSaving] = useState(false);
  const [failedSave, setFailedSave] = useState(false);
  const busy = useRef(false);
  const attempt = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const ready = status === "ready";

  // Leaving (unmount, or the route hidden by `cacheComponents`) drops a save on its way, enables the buttons and clears
  // the failure line.
  useLayoutEffect(
    () => () => {
      attempt.current += 1;
      busy.current = false;
      setSaving(false);
      setFailedSave(false);
    },
    [],
  );

  useEffect(() => {
    if (ready) {
      heading.current?.focus({ preventScroll: true });
    }
  }, [ready]);

  if (!ready) {
    return (
      <GateWait>
        <LanguageSkeleton />
      </GateWait>
    );
  }

  const first = detectLocale(tg.languageCode(), { oneDetector: true });
  const options = ordered(localesOf(reference), first);

  const pick = async (locale: Locale) => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    const id = attempt.current;
    setSaving(true);
    setFailedSave(false);
    tg.haptic.impact("medium");
    const result = await save({ locale });
    if (attempt.current !== id) {
      return;
    }
    if (result.ok) {
      rememberPick();
      patchMe({ locale, locale_chosen: true });
      return;
    }
    busy.current = false;
    setSaving(false);
    setFailedSave(true);
    failed({ flags, toast: false });
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[8px] p-[24px] text-center">
      <span aria-hidden className="mb-[6px] grid size-[64px] place-items-center rounded-pill bg-fill text-text">
        <Globe size={30} />
      </span>
      <h1
        ref={heading}
        id={headingId}
        tabIndex={-1}
        lang={first}
        className="mt-[8px] text-[26px] font-bold tracking-[-0.02em] text-text outline-none"
      >
        {CHOOSE[first]}
      </h1>
      <p data-slot="subtitle" className="text-hint">
        {locales
          .filter((code) => code !== first)
          .map((code, index) => (
            <span key={code}>
              {index > 0 ? " · " : null}
              <span lang={code}>{CHOOSE[code]}</span>
            </span>
          ))}
      </p>
      <div
        role="group"
        aria-labelledby={headingId}
        aria-busy={saving || undefined}
        className="mt-[20px] flex w-full max-w-[320px] flex-col gap-[10px]"
      >
        {options.map((option, index) => (
          <Button
            key={option.code}
            lang={option.code}
            data-locale={option.code}
            variant={index === 0 ? "primary" : "secondary"}
            className="h-[54px] w-full text-[17px] aria-disabled:pointer-events-none aria-disabled:opacity-50"
            aria-disabled={saving}
            onClick={() => void pick(option.code)}
          >
            {option.name}
          </Button>
        ))}
      </div>
      {failedSave ? (
        <p data-slot="save-failed" role="alert" className="text-hint">
          {t("common.saveFailed")}
        </p>
      ) : null}
    </div>
  );
}
