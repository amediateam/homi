"use client";

import { useLocale } from "next-intl";
import { useSyncExternalStore } from "react";

import { translate as translateListing } from "@/lib/actions/listing";
import { useAction } from "@/lib/actions/useAction";

import type { TranslationControl } from "../sections/controls";
import {
  EMPTY_TRANSLATION,
  readTranslation,
  subscribeTranslations,
  translationKey,
  writeTranslation,
} from "./translationCache";

/** The language of the posts: nothing is translated into it (BR-APP-034). */
const POST_LOCALE = "ru";

/**
 * «Перевести» of the original text (WP-26, block 13; BR-APP-034): `null` in ru. The first tap asks `translate`, and
 * later taps switch between the translation and the original without a request. An error or an empty text is a
 * failure, and the next tap asks again. The state lives in `translationCache`, per number and locale, so it outlives
 * the screen: an answer that comes after the listing closed is shown when it opens again.
 */
export function useTranslation(number: number): TranslationControl | null {
  const locale = useLocale();
  const key = translationKey(number, locale);
  const fetchTranslation = useAction(translateListing);
  const entry = useSyncExternalStore(
    subscribeTranslations,
    () => readTranslation(key),
    () => EMPTY_TRANSLATION,
  );

  const toggle = (): void => {
    const current = readTranslation(key);
    if (current.pending) {
      return;
    }
    if (current.text !== null) {
      writeTranslation(key, { shown: !current.shown });
      return;
    }
    writeTranslation(key, { pending: true, failed: false });
    const fail = () => writeTranslation(key, { pending: false, failed: true });
    void fetchTranslation({ number }).then((result) => {
      if (result.ok && result.data.text.trim() !== "") {
        writeTranslation(key, { text: result.data.text, shown: true, pending: false, failed: false });
      } else {
        fail();
      }
    }, fail);
  };

  return locale === POST_LOCALE ? null : { ...entry, toggle };
}
