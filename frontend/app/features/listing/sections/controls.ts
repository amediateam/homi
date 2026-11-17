/**
 * The two controls the stateless sections render and the contact and translation hooks fill (WP-26). Types only, so
 * a section and the hook that drives it never wait for each other. `src` of a phone callback: the author row's button
 * and number (`author`) or a masked number in the original text (`text`).
 */

export interface PhoneControl {
  /** `phone_display` of the contact answer once a reveal gave a number; `null` before and for a link-only answer. */
  display: string | null;
  /** The last two digits of the revealed number; `null` before and for a link-only answer. */
  tail: string | null;
  /** «Показать номер» or a masked number before the reveal; the owner plays the medium haptic. */
  onReveal: (src: "author" | "text") => void;
  /** A tap on the revealed number. */
  onCall: (src: "author" | "text") => void;
}

export interface TranslationControl {
  /** The translated text; `null` until an answer came. */
  text: string | null;
  /** Whether the translation is shown instead of the original. */
  shown: boolean;
  pending: boolean;
  failed: boolean;
  /** «Перевести» / «Показать оригинал». */
  toggle: () => void;
}
