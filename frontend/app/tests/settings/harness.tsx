import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

import type { Settings } from "@/features/settings/useSettings";

/** The settings of the stub (`settings/default.json`) with the options of `config/settings.php`. */
export function settingsOf(overrides: Partial<Settings> = {}): Settings {
  return {
    locale: "ru",
    currency: "USD",
    theme: "auto",
    city: "tashkent",
    quiet_hours: { from: 23, to: 8 },
    digest_hours: [9, 19],
    card_style: "classic",
    options: {
      locales: [
        { code: "ru", name: "Русский" },
        { code: "uz", name: "Oʻzbekcha" },
        { code: "en", name: "English" },
      ],
      currencies: [
        { code: "USD", name: "Доллары" },
        { code: "UZS", name: "Сумы" },
      ],
      quiet_hours: [null, { from: 22, to: 8 }, { from: 23, to: 8 }, { from: 0, to: 9 }, { from: 23, to: 7 }],
      digest_hours: [[9], [9, 19], [12, 20], [19]],
    },
    ...overrides,
  } as Settings;
}

export function withIntl(children: ReactNode, locale: Locale = "ru") {
  return (
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
      {children}
    </NextIntlClientProvider>
  );
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
