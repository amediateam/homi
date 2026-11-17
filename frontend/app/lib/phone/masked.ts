/**
 * The masked phone numbers of a listing text (WP-26, DEC-52). The API masks every number of an author's text with
 * `PhoneMasker` (WP-12) into one fixed form — `+998 ** *** ** NN` for an Uzbek number, `+** *** ** NN` for any other —
 * so the client finds them by that form alone and never by digits: a raw number is never turned into a control.
 */

/** A plain run of text, or one masked number with its last two digits. */
export type MaskedPart = { kind: "text"; text: string } | { kind: "phone"; text: string; tail: string };

/**
 * One masked number (`PhoneMasker::MASKED_PATTERN`) with its last two digits captured. No `g` flag: `test()` keeps no
 * `lastIndex` between callers; `splitMaskedPhones` iterates a global copy of its own.
 */
export const MASKED_PHONE = /\+(?:998 )?\*\* \*\*\* \*\* (\d{2})(?!\d)/;

/** The text cut into plain parts and masked numbers, in order; adjacent plain text stays one part. */
export function splitMaskedPhones(text: string): MaskedPart[] {
  const parts: MaskedPart[] = [];
  let from = 0;
  for (const match of text.matchAll(new RegExp(MASKED_PHONE.source, "g"))) {
    if (match.index > from) {
      parts.push({ kind: "text", text: text.slice(from, match.index) });
    }
    parts.push({ kind: "phone", text: match[0], tail: match[1] });
    from = match.index + match[0].length;
  }
  if (from < text.length) {
    parts.push({ kind: "text", text: text.slice(from) });
  }
  return parts;
}
