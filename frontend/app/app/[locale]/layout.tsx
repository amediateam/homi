import { getMessages, htmlLang } from "@homi/i18n";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { Suspense } from "react";

import { BOOT_SCRIPT, BOOT_STUBS } from "@/boot/inline.generated";
import { BootGuard } from "@/features/shell/BootGuard";
import { DemoDataMarker } from "@/features/shell/DemoDataMarker";
import { IntlClientProvider } from "@/i18n/IntlClientProvider";
import { routing } from "@/i18n/routing";
import { brand } from "@/lib/brand";
import "@/styles/app.css";

export const metadata: Metadata = {
  title: brand.name,
  icons: { icon: brand.assets.favicon },
};

/** No web font is loaded; the safe areas come from Telegram's variables, so the page may draw under the notch. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Every document is rendered at request time so that its scripts carry the request's CSP nonce (ADR-0020): the
 * layout reads `x-nonce` outside `<Suspense>`, which `instant = false` allows.
 */
export const instant = false;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Root layout (WP-20, WP-21). The head holds, in order: the native-callback stubs (TMA-002) and the boot script
 * (theme and lite class before paint, engine test, watchdog — SCR-001), both with the request's nonce. The boot
 * script inserts the Telegram SDK tag itself (TMA-001): React hoists an `async` `<script src>` above inline scripts,
 * and the watchdog must listen before the SDK can fail. `data-scheme="light"` is the server's first paint; the boot script changes the attributes of
 * `<html>` before React hydrates, hence `suppressHydrationWarning`.
 */
export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang={htmlLang(locale)} data-scheme="light" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: BOOT_STUBS }} />
        <script id="homi-boot" nonce={nonce} data-bot={brand.botUsername} dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
        <link rel="preconnect" href="https://telegram.org" crossOrigin="anonymous" />
      </head>
      <body>
        <IntlClientProvider locale={locale} messages={getMessages(locale)}>
          {children}
          <Suspense fallback={null}>
            <DemoDataMarker />
          </Suspense>
          <BootGuard />
        </IntlClientProvider>
      </body>
    </html>
  );
}
