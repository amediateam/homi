"use client";

import { type Locale } from "@homi/config";
import { Camera, Info, MessageCircle, ShieldCheck, Smartphone } from "@homi/ui";
import { useLocale, useTranslations } from "next-intl";

import { brand } from "@/lib/brand";
import { supportUrl } from "@/lib/deeplinks/build";
import { useReference } from "@/lib/reference/useReference";
import { tg } from "@/lib/telegram";

import { SettingsGroup, SettingsRow, SettingsText } from "./SettingsParts";
import type { HomeScreenStatus } from "./useHomeScreenStatus";

/** The handle a link to an Instagram profile shows as its value: `@name`, else nothing. */
function instagramHandle(url: string): string {
  const name = /instagram\.com\/([\w.]+)/i.exec(url)?.[1];
  return name ? `@${name}` : "";
}

/**
 * «О приложении» (WP-31, SCR-032; legacy `AboutGroup`): the home-screen row while the shortcut is missing or its
 * status unknown, support while the reference data names a support account, Instagram and the privacy policy while
 * the brand layer has them (all `null` by default: no row), and the about text. Every link opens through Telegram.
 */
export function AboutGroup({ homeStatus }: { homeStatus: HomeScreenStatus }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const { supportUsername } = useReference();
  const support = supportUsername === null ? null : supportUrl(supportUsername);
  const instagram = brand.links.instagram[locale];
  const privacy = brand.links.privacy[locale];
  const open = (url: string) => {
    tg.haptic.impact("light");
    void tg.openLink(url);
  };
  return (
    <SettingsGroup id="about" title={t("settings.group.about")}>
      {homeStatus === "missed" || homeStatus === "unknown" ? (
        <SettingsRow
          id="home"
          icon={<Smartphone size={18} />}
          label={t("settings.home")}
          value={t("home.add")}
          onClick={() => {
            tg.haptic.impact("light");
            tg.homeScreen.add();
          }}
        />
      ) : null}
      {support !== null ? (
        <SettingsRow id="support" icon={<MessageCircle size={18} />} label={t("settings.support")} value="" onClick={() => open(support)} />
      ) : null}
      {instagram !== null ? (
        <SettingsRow id="instagram" icon={<Camera size={18} />} label={t("settings.instagram")} value={instagramHandle(instagram)} onClick={() => open(instagram)} />
      ) : null}
      {privacy !== null ? (
        <SettingsRow id="privacy" icon={<ShieldCheck size={18} />} label={t("settings.privacy")} value="" onClick={() => open(privacy)} />
      ) : null}
      <SettingsText icon={<Info size={18} />}>{t("settings.about")}</SettingsText>
    </SettingsGroup>
  );
}
