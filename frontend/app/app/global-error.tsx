"use client";

import { defaultLocale, isLocale, type Locale } from "@homi/config";
import { useSyncExternalStore } from "react";

import { useRenderReport } from "@/features/gates/useRenderReport";
import { brand } from "@/lib/brand";

/**
 * `crash.title`, `crash.text` and `crash.reload` of the catalogues, copied: this document loads no catalogue
 * (`tests/gates/global-error.test.tsx` keeps the copies equal).
 */
const TEXTS: Record<Locale, { title: string; text: string; reload: string }> = {
  ru: {
    title: "Что-то пошло не так",
    text: "Ошибка записана. Обновите приложение — обычно это помогает.",
    reload: "Обновить",
  },
  uz: {
    title: "Nimadir xato ketdi",
    text: "Xato yozib olindi. Ilovani yangilang — odatda shu yordam beradi.",
    reload: "Yangilash",
  },
  en: {
    title: "Something went wrong",
    text: "The error has been logged. Reload the app — that usually helps.",
    reload: "Reload",
  },
};

/**
 * The look of the crash screen in plain CSS: the light and dark values of `--bg`, `--text`, `--hint` and `--fill`
 * (themes.css, tokens.css), dark under the system scheme. The policy allows inline styles (`style-src
 * 'unsafe-inline'`), so the element needs no nonce.
 */
const CSS = `
body { margin: 0; background: #ffffff; color: #0f0f10; font: 15px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
.screen { box-sizing: border-box; display: flex; flex-direction: column; align-items: center; gap: 10px; min-height: 100vh; padding: calc(96px + env(safe-area-inset-top, 0px)) 24px calc(64px + env(safe-area-inset-bottom, 0px)); text-align: center; color: #8a8f98; }
.mascot { width: 120px; height: 120px; margin-bottom: 6px; background: url("${brand.assets.emptyShrug}") center / contain no-repeat; }
h1 { margin: 0; color: #0f0f10; font-size: 17px; font-weight: 700; }
p { max-width: 300px; margin: 0; }
button { display: inline-flex; align-items: center; justify-content: center; height: 48px; margin-top: 10px; padding: 0 16px; border: 0; border-radius: 999px; background: rgba(15, 15, 16, 0.06); color: #0f0f10; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; -webkit-appearance: none; appearance: none; }
@media (prefers-color-scheme: dark) {
  html { color-scheme: dark; }
  body { background: #000000; color: #ececee; }
  .screen { color: #8f8f97; }
  h1, button { color: #ececee; }
  button { background: rgba(236, 236, 238, 0.08); }
}
`;

const unchanging = () => () => {};

/** The first segment of the address when it is a locale, else ru. */
function addressLocale(): Locale {
  const segment = location.pathname.split("/")[1] ?? "";
  return isLocale(segment) ? segment : defaultLocale;
}

const serverLocale = (): Locale => defaultLocale;

/**
 * The crash screen for a failure of the root layout (WP-23, D-E-2): Next.js renders it in place of
 * `[locale]/layout.tsx`, so it is its own document, with no global styles, catalogue or provider. The three texts are
 * hard-coded and chosen by the first segment of the address (default ru). The locale is read through
 * `useSyncExternalStore`: any server HTML of this component holds the server snapshot (ru) — the build prerenders
 * `/_global-error` — so hydration matches and the locale follows right after; a client render (the usual case: after
 * a server failure Next.js sends an empty `__next_error__` shell and renders this with `createRoot`, after a client
 * failure it replaces the tree) reads the address at once, with no ru frame. No script is rendered: the CSP nonce is
 * the root layout's. «Обновить» reloads the document; the error is reported once (`useRenderReport`), as the text says.
 */
export default function GlobalError({ error }: { error: unknown }) {
  const locale = useSyncExternalStore(unchanging, addressLocale, serverLocale);
  const words = TEXTS[locale];
  useRenderReport(error);

  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{brand.name}</title>
        <style>{CSS}</style>
      </head>
      <body>
        <main data-route="global-error">
          <div className="screen" role="alert">
            <div className="mascot" aria-hidden="true" />
            <h1>{words.title}</h1>
            <p>{words.text}</p>
            <button type="button" onClick={() => location.reload()}>
              {words.reload}
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
