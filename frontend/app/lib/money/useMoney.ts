"use client";

import type { Locale } from "@homi/config";
import { createMoney, type Money, type Translate } from "@homi/i18n/format";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { reportI18n } from "@/lib/errors/report";
import { useReference } from "@/lib/reference/useReference";
import { useSession } from "@/lib/session/SessionProvider";

/**
 * Money of the screen (WP-22, BR-APP-060): `createMoney` bound to `me.currency`, the reference rate and next-intl's
 * `t`. A currency, rate or locale change gives a new instance, so memoised prices re-render.
 */
export function useMoney(): Money {
  const { me } = useSession();
  const { usdUzs } = useReference();
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const currency = me?.currency ?? null;
  return useMemo(
    () => createMoney({ locale, currency, usdUzs, t: ((key, values) => t(key as never, values as never)) as Translate, report: reportI18n }),
    [locale, currency, usdUzs, t],
  );
}
