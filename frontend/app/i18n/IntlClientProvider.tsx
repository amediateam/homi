"use client";

import { displayTimeZone, type Locale } from "@homi/config";
import { createIntlHandlers, type Messages } from "@homi/i18n";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

import { reportI18n } from "@/lib/errors/report";

const handlers = createIntlHandlers(reportI18n);

/**
 * next-intl for Client Components with the same runtime rules as the server (WP-20): the fallback hooks are
 * functions, which cannot cross from a Server Component, so they are set here.
 */
export function IntlClientProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: ReactNode;
}) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone={displayTimeZone}
      onError={handlers.onError}
      getMessageFallback={handlers.getMessageFallback}
    >
      {children}
    </NextIntlClientProvider>
  );
}
