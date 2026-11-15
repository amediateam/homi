import { getMessages, htmlLang } from "@homi/i18n";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { Suspense } from "react";

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

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Root layout (WP-20). `data-scheme="light"` is the first paint; the boot script of WP-21 sets the scheme, theme
 * and lite class before paint, hence `suppressHydrationWarning`.
 */
export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  return (
    <html lang={htmlLang(locale)} data-scheme="light" suppressHydrationWarning>
      <body>
        <IntlClientProvider locale={locale} messages={getMessages(locale)}>
          {children}
          <Suspense fallback={null}>
            <DemoDataMarker />
          </Suspense>
        </IntlClientProvider>
      </body>
    </html>
  );
}
