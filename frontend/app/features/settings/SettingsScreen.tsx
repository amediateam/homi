"use client";

import type { Locale } from "@homi/config";
import type { Translate } from "@homi/i18n/format";
import { Clock, Coins, ErrorState, EyeOff, GalleryHorizontal, Gauge, Globe, Moon, Palette, Spinner } from "@homi/ui";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { getGraphicsMode, useGraphicsMode } from "@/lib/graphics";
import { nav } from "@/lib/navigation/nav";
import { routes, type SettingsPage } from "@/lib/navigation/routes";
import { useSession } from "@/lib/session/SessionProvider";
import { tg } from "@/lib/telegram";

import { AboutGroup } from "./AboutGroup";
import { cardStyleOf, digestLabel, graphicsLabel, optionName, quietLabel, themeLabel } from "./format";
import { SettingsGroup, SettingsRow } from "./SettingsParts";
import { useThemePreference } from "./themeChoice";
import { type Hidden, useHidden } from "./useHidden";
import { useHomeScreenStatus } from "./useHomeScreenStatus";
import { type Settings, useSettings } from "./useSettings";

export interface SettingsScreenProps {
  /** The layout's server read with the session cookie; `undefined` in header mode or when it failed. */
  initialSettings?: Settings;
  initialHidden?: Hidden;
}

/** Whether the graphics row shows: on Android, or once the mode was changed by hand (BR-APP-052). */
function graphicsRowShown(): boolean {
  return tg.isAndroid() || tg.platform() === "android" || getGraphicsMode() !== "auto";
}

/**
 * The settings tab (WP-31, SCR-032; legacy `SettingsScreen.jsx`): the layout of `/settings`, so it stays mounted and
 * visible under its sub-pages. A centred spinner until `GET /settings` answers; with nothing loaded and an error the
 * tall `ErrorState` («Нет связи» offline, else «Не загрузилось») whose «Повторить» reads everything again. Then the
 * groups:
 *
 * - the slot of «Сдаю квартиру» (WP-82), empty here;
 * - «Оформление»: the theme, and the graphics only on Android or once the mode was set by hand — decided once on
 *   mount, as legacy (BR-APP-052);
 * - «Язык и валюта»: the name of the address's locale and of the profile's currency in the lists of the settings
 *   answer, else the code;
 * - «Когда присылать»: «23–08» or «Выкл», «9 и 21»; the footer «Время — ташкентское.»;
 * - «Чат с ботом»: «Классический» or «Новый» (anything else reads «Классический», LB-APP-051), no «Новое» pill (DEC-57);
 * - «Лента»: «Скрытое» with the count of hidden listings plus blocked authors, only while it is above 0 (BR-APP-053);
 * - «О приложении» (`AboutGroup`).
 *
 * The hidden list and the support account fail silently: their rows are simply absent. A row plays a light impact
 * and pushes its page. No pull-to-refresh on this tab (WP-23). Every state keeps the root `data-route="settings"`.
 */
export function SettingsScreen({ initialSettings, initialHidden }: SettingsScreenProps) {
  const t = useTranslations();
  const translate: Translate = (key, values) => t(key, values);
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const view = useSettings({ initial: initialSettings });
  const hidden = useHidden({ initial: initialHidden });
  const theme = useThemePreference();
  const graphics = useGraphicsMode();
  const homeStatus = useHomeScreenStatus();
  const [showGraphics] = useState(graphicsRowShown);
  const { settings } = view;

  const open = (page: SettingsPage) => {
    tg.haptic.impact("light");
    nav.push(routes.settingsPage(page));
  };

  let body;
  if (settings === undefined && view.error !== null) {
    const offline = view.error.error === "offline" || view.error.error === "timeout";
    body = (
      <ErrorState
        tall
        kind={offline ? "offline" : "server"}
        title={offline ? t("error.offline") : t("common.loadFailed")}
        text={offline ? t("error.offlineText") : t("error.serverText")}
        retryLabel={t("error.retry")}
        onRetry={() => {
          void view.refetch();
          void hidden.refetch();
        }}
      />
    );
  } else if (settings === undefined) {
    body = (
      <div data-settings-state="loading" className="grid min-h-[48px] place-items-center pt-[24px]">
        <Spinner aria-label={t("feed.loading")} className="size-[22px] border-[2.5px] text-accent" />
      </div>
    );
  } else {
    const currency = me?.currency ?? settings.currency;
    body = (
      <div className="flex flex-col gap-[22px]">
        <SettingsGroup id="look" title={t("settings.group.look")}>
          <SettingsRow id="theme" icon={<Palette size={18} />} label={t("settings.theme._")} value={themeLabel(theme, translate)} onClick={() => open("theme")} />
          {showGraphics ? (
            <SettingsRow
              id="graphics"
              icon={<Gauge size={18} />}
              label={t("settings.graphics._")}
              value={graphicsLabel(graphics.mode, graphics.lite, translate)}
              onClick={() => open("graphics")}
            />
          ) : null}
        </SettingsGroup>
        <SettingsGroup id="region" title={t("settings.group.region")}>
          <SettingsRow id="language" icon={<Globe size={18} />} label={t("notify.language")} value={optionName(settings.options?.locales, locale)} onClick={() => open("language")} />
          <SettingsRow id="currency" icon={<Coins size={18} />} label={t("notify.currency")} value={optionName(settings.options?.currencies, currency)} onClick={() => open("currency")} />
        </SettingsGroup>
        <SettingsGroup id="notify" title={t("settings.group.notify")} footer={t("notify.tz")}>
          <SettingsRow id="quiet-hours" icon={<Moon size={18} />} label={t("notify.quiet")} value={quietLabel(settings.quiet_hours, translate)} onClick={() => open("quiet-hours")} />
          <SettingsRow id="digest" icon={<Clock size={18} />} label={t("notify.digest")} value={digestLabel(settings.digest_hours, translate)} onClick={() => open("digest")} />
        </SettingsGroup>
        <SettingsGroup id="chat" title={t("settings.group.chat")}>
          <SettingsRow
            id="cards"
            icon={<GalleryHorizontal size={18} />}
            label={t("settings.cards._")}
            value={t(`settings.cards.${cardStyleOf(settings)}`)}
            onClick={() => open("cards")}
          />
        </SettingsGroup>
        {hidden.count > 0 ? (
          <SettingsGroup id="feed" title={t("settings.group.feed")}>
            <SettingsRow id="hidden" icon={<EyeOff size={18} />} label={t("settings.hidden")} value={String(hidden.count)} onClick={() => open("hidden")} />
          </SettingsGroup>
        ) : null}
        <AboutGroup homeStatus={homeStatus} />
      </div>
    );
  }

  return (
    <main data-route="settings" className="px-(--gutter) pt-[6px] pb-(--bottom-chrome)">
      <div className="mx-auto max-w-(--feed-max)">{body}</div>
    </main>
  );
}
