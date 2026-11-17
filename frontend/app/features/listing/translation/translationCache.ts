/**
 * The translations of this launch (WP-26, BR-APP-034), one entry per listing number and locale, in memory only:
 * another listing never shows one (fix of LB-APP-003), and coming back to a listing shows its own again.
 */

export interface TranslationEntry {
  text: string | null;
  shown: boolean;
  pending: boolean;
  failed: boolean;
}

/** The entry of a listing nothing was asked for yet; also what the server renders. */
export const EMPTY_TRANSLATION: TranslationEntry = { text: null, shown: false, pending: false, failed: false };

const entries = new Map<string, TranslationEntry>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function translationKey(number: number, locale: string): string {
  return `${number}:${locale}`;
}

/** The same object until the next write of the key, as `useSyncExternalStore` needs. */
export function readTranslation(key: string): TranslationEntry {
  return entries.get(key) ?? EMPTY_TRANSLATION;
}

export function writeTranslation(key: string, change: Partial<TranslationEntry>): void {
  entries.set(key, { ...readTranslation(key), ...change });
  notify();
}

export function subscribeTranslations(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Forgets every translation; tests only. */
export function resetTranslations(): void {
  entries.clear();
  notify();
}
