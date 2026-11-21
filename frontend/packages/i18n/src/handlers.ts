import { type I18nReporter, reportOnce } from "./report";

/*
 * Apart from `./messages` (WP-33): the client's `IntlClientProvider` takes these hooks, and a module that imports the
 * catalogue layers would put every locale's raw JSON into the browser's bundle with them.
 */

type IntlErrorLike = Error & { code: string };

/** Error codes after which next-intl asks `getMessageFallback` for the text, which reports them by key. */
const KEY_ERRORS = new Set(["MISSING_MESSAGE", "INSUFFICIENT_PATH", "INVALID_MESSAGE", "FORMATTING_ERROR"]);

/**
 * The two next-intl hooks of the runtime rules (fix of LB-APP-002): a missing key, a missing argument or a malformed
 * message renders the key path — never a throw, never an empty string — and is reported once per key. next-intl calls
 * `onError` and then `getMessageFallback` for those (use-intl `createBaseTranslator`); other errors arrive at
 * `onError` alone and are reported once per message.
 */
export function createIntlHandlers(report?: I18nReporter) {
  return {
    onError(error: IntlErrorLike): void {
      if (KEY_ERRORS.has(error.code)) {
        return;
      }
      reportOnce(report, `error:${error.message}`, error, { kind: "i18n", key: null, code: error.code });
    },
    getMessageFallback({ error, namespace, key }: { error: IntlErrorLike; namespace?: string; key: string }): string {
      const path = namespace ? `${namespace}.${key}` : key;
      reportOnce(report, `key:${path}`, error, { kind: "i18n", key: path, code: error.code });
      return path;
    },
  };
}
