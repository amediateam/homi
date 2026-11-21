"use client";

import type { Translate } from "@homi/i18n/format";
import { useTranslations } from "next-intl";
import type { ComponentType, ReactNode } from "react";

import { SubPage } from "@/features/shell/SubPage";
import type { SettingsPage } from "@/lib/navigation/routes";

import { CardStylePage } from "./CardStylePage";
import { CurrencyPage } from "./CurrencyPage";
import { DigestHint, DigestPage } from "./DigestPage";
import { GraphicsPage } from "./GraphicsPage";
import { HiddenPage } from "./HiddenPage";
import { LanguagePage } from "./LanguagePage";
import { QuietHoursPage } from "./QuietHoursPage";
import { ThemePage } from "./ThemePage";

interface PageSpec {
  title: (t: Translate) => string;
  hint?: (t: Translate) => ReactNode;
  /** No card around the content (the hidden list and the card styles draw their own). */
  bare?: boolean;
  Content: ComponentType;
}

/** The eight pages of the settings (SCR-033 … SCR-039, SCR-048): title, hint, frame and content. */
const PAGES: Record<SettingsPage, PageSpec> = {
  theme: { title: (t) => t("settings.theme._"), Content: ThemePage },
  graphics: { title: (t) => t("settings.graphics._"), hint: (t) => t("settings.graphics.hint"), Content: GraphicsPage },
  language: { title: (t) => t("notify.language"), hint: (t) => t("notify.languageHint"), Content: LanguagePage },
  currency: { title: (t) => t("notify.currency"), hint: (t) => t("notify.currencyHint"), Content: CurrencyPage },
  "quiet-hours": { title: (t) => t("notify.quiet"), hint: (t) => t("notify.quietHint"), Content: QuietHoursPage },
  digest: { title: (t) => t("notify.digest"), hint: () => <DigestHint />, Content: DigestPage },
  cards: { title: (t) => t("settings.cards._"), bare: true, Content: CardStylePage },
  hidden: { title: (t) => t("settings.hidden"), bare: true, Content: HiddenPage },
};

/**
 * A settings page in its `SubPage` (WP-23): the fixed layer that slides in from 24 %, the swipe back except on
 * Android, Telegram's Back and, without the SDK, the fallback cross (WP-36). `data-route` names it for the specs; the
 * route file renders it inside `<Suspense>`. The settings screen stays mounted below as the layout.
 */
export function SettingsSubPage({ name }: { name: SettingsPage }) {
  const t = useTranslations();
  const translate: Translate = (key, values) => t(key, values);
  const { title, hint, bare = false, Content } = PAGES[name];
  return (
    <SubPage data-route={`settings/${name}`} title={title(translate)} hint={hint?.(translate)} bare={bare}>
      <Content />
    </SubPage>
  );
}
