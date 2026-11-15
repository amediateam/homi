import { displayTimeZone } from "@homi/config";
import { createIntlHandlers, getMessages } from "@homi/i18n";
import { locale as rootLocale } from "next/root-params";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { reportI18n } from "@/lib/errors/report";

import { routing } from "./routing";

const handlers = createIntlHandlers(reportI18n);

/**
 * next-intl request configuration (WP-20). The locale comes from the `[locale]` root parameter
 * (`next/root-params`), not from request headers, so pages keep their static shell under `cacheComponents`.
 */
export default getRequestConfig(async ({ locale: requested }) => {
  const candidate = requested ?? (await rootLocale());
  const locale = hasLocale(routing.locales, candidate) ? candidate : routing.defaultLocale;

  return {
    locale,
    messages: getMessages(locale),
    timeZone: displayTimeZone,
    onError: handlers.onError,
    getMessageFallback: handlers.getMessageFallback,
  };
});
