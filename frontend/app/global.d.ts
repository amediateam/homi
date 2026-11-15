import type { Locale } from "@homi/config";
import type { Messages } from "@homi/i18n";

/** Typed locales and message keys for next-intl, from the `ru` catalogue of @homi/i18n (WP-20). */
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
