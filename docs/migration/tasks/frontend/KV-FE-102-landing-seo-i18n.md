# KV-FE-102 — Landing and SEO catalogues and formatters

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-3a (M9, stage S2) |
| Feature IDs | F-LANDING-006, F-SEO-002 |
| Dependencies | KV-FE-015 (i18n runtime), KV-FE-017 (number and money formatter), KV-FE-007 (SEO archive: uz/en templates); place names and cases from KV-BE-159 / KV-DB-034; decisions: Q-SEO-004, Q-LND-010 |

## Goal

The landing and the SEO pages render every text from `@homi/i18n` catalogues in ru, uz and en — the 106 landing keys,
the demo keys still needed by the phone demo, and the SEO page templates — with locale-correct plurals and numbers in
the title, the description and the body, one place dictionary for names and grammatical cases, and no HTML injected
from a catalogue value.

## Legacy reference

- LND-028 (client texts: `data-l` → `innerHTML`, `data-la`, `data-tx`/`data-t`/`data-tp`, fallback to ru; 106 landing
  keys and 188 Mini App keys complete in three languages), LND-029 (server-side `/uz/`, `/en/` from `landing-i18n.js`).
- *Since landing release `67b3942a8340` (landing intake):* `landing-i18n.js` has 146 keys per language (new `vit.*`, more `foot.*`,
  `faq.q0`/`faq.a0`, `faq.q9`/`faq.a9`; new `meta.*` and `hero.kicker` texts); the 106 below is the audit's count.
- Sources: `$KVADRO_ROOT/demo/landing/site/landing-i18n.js` (`window.LANDING_TEXTS`), `$KVADRO_ROOT/demo/landing/site/miniapp-i18n.js`
  (`window.MINIAPP_TEXTS`, generated — do not hand-port its chrome keys, reuse the Mini App catalogue of KV-FE-016);
  SEO templates `03b` §2.3 and BR-SEO-009 (ru), uz/en from the archive of KV-FE-007.
- Rules: BR-LND-006 (plurals: ru three forms, en two, uz one; numbers `en-GB` for en, `ru-RU` for ru and uz; money `$`
  + number), BR-SEO-009 (title/description templates, declined place names), BR-SEO-022 (card formats per language),
  BR-SEO-023 (USD only).
- Defects (fix `APPROVED`): LB-SEO-001 (one number formatter in title, description and body), LB-SEO-002 (plural
  agreement «81 новая»), LB-LND-011 (inconsistent English place names), LB-SEO-007 (per-language place names),
  LB-LND-003 (no text substitution).

## Implementation

1. Read `frontend/landing/node_modules/next/dist/docs/01-app/02-guides/internationalization.md` (dictionaries loaded in
   Server Components, `getDictionary(lang)`).
2. In `@homi/i18n` add namespaces: `landing` (all 106 keys of `landing-i18n.js`, same key names: `meta.*`, `lang.aria`,
   `cta`, `story.aria`, `hero.*`, `cap`, `app.h2`, `st.*`, `cue`, `try.*`, `phone.aria`, `lock.*`, `count.*`, `or2.*`,
   `rooms.short`, `ev.*`, `pc.*`, `faq.*`, `final.*`, `qr.*`, `foot.*`); `demo` (only the demo-content keys of
   `miniapp-i18n.js` that have no Mini App equivalent: `c0.*`…`c4.*`, `preset.*`, `district.*`, `mini`, `radar.*`,
   `sub.*`, `delta.tpl`); `seo` (page templates per type and the block texts of `03b` §2.3, keyed by page type).
3. Markup in values: legacy values contain `&nbsp;`, `&#8209;`, `<br>` and `<b>` (e.g. `hero.h1` «Вся аренда из
   Telegram.<br>В одной ленте.», `ev.agentPhone` «… <b>По тексту не угадать</b>»). Convert at import to Unicode
   (U+00A0, U+2011) and to rich-text tags `<br/>` / `<b>…</b>` rendered as React elements by a `RichText` component —
   never `dangerouslySetInnerHTML` (SEC-REQ-021).
4. Legacy plural arrays (`count.what` `['новая квартира','новые квартиры','новых квартир']`, `pc.week`
   `['квартира','квартиры','квартир']`) become plural objects for `Intl.PluralRules` (`one/few/many/other` in ru,
   `one/other` in en, `other` in uz), matching BR-LND-006 exactly for 1, 2, 5, 11, 12, 14, 21, 22, 25, 101, 111.
5. One formatter for all numbers on the landing and the SEO pages (`@homi/utils`, KV-FE-017): ru and uz group with the
   code point fixed in the KV-QA-006 fixture, en with a comma; money `$` + number; the same call in `<title>`,
   `description`, JSON-LD and body (LB-SEO-001).
6. Place names: no `dist.*`, `city.*` or `d.*` strings in the new pages — names and the case forms the templates need
   («в Юнусабаде», «в Чирчике», «в Коканде») come from the place dictionary (`GET /api/v1/public/places?lang=`,
   KV-BE-159). The legacy `dist.*`/`city.*` keys are kept only in the parity key list for comparison (LB-LND-011,
   LB-SEO-007).
7. SEO templates are functions of slice data (`seoTitle(type, slice, lang)`), ru text verbatim from BR-SEO-009, uz/en from
   the archive; a template missing in the archive is marked "new text, product owner review" and listed in the PR.
8. Build-time check: the three locales have the same key set per namespace; a missing key at runtime falls back to ru,
   then to the key, reported once (same contract as KV-FE-015).
9. Dates on the landing and SEO pages are formatted in `Asia/Tashkent` (index overline «Ноябрь 2026 · данные на
   8 ноября», lock-screen clock); uz month and weekday names are hand-tabled as legacy does («seshanba, 13-oktabr»,
   BR-LND-014).

## States and texts

| Namespace | Keys (examples, ru) | Count |
| --------- | ------------------- | ----- |
| `landing` | `meta.title` «Аренда квартир в Ташкенте — все объявления из Telegram \| kvadro²», `cta` «Открыть в Telegram», `final.h2` «Найдите квартиру сегодня», `foot.privacy` «Конфиденциальность» | 106 |
| `demo` | `c0.price`…`c4.where`, `preset.0`…`preset.sale.4`, `district.0`…`district.11`, `mini` «Аренда · Ташкент» | subset of 188 |
| `seo` | title templates of BR-SEO-009, e.g. district «Аренда квартир в {place.prepositional}, {city} — снять квартиру: {count} объявлений \| kvadro²»; counters «{count} квартир в аренду», «{count} новых за 7 дней»; CTA texts of BR-SEO-031 | per type |

Missing-data state: a template whose number is absent renders without that clause (never `NaN`, never `undefined`).

## Interaction

n/a — catalogues and formatters.

## Telegram integration

n/a.

## Storage and analytics

n/a (the client-side language choice `kv-landing-lang` belongs to KV-FE-108).

## Files

- `frontend/packages/i18n/src/catalogues/{ru,uz,en}/{landing,demo,seo}.ts` (new), `frontend/packages/i18n/src/rich-text.ts`
- `frontend/packages/i18n/scripts/import-landing.mjs` (one-off import of the legacy files, kept for review)
- `frontend/landing/lib/i18n.ts` (`getDictionary(lang)`), `frontend/landing/components/RichText.tsx`
- `frontend/packages/i18n/tests/landing-catalogue.test.ts`, `frontend/landing/tests/seo-templates.test.ts`

## API contract

`GET /api/v1/public/places?lang=` (KV-BE-159): `name` and case forms per place; consumed server-side only.

## Business rules

- Kept: BR-LND-006, BR-SEO-009, BR-SEO-022 (per-language card parameter formats, e.g. uz `2 xonali · 60 m² · 9/10 qavat`,
  en `2 rm · 60 m² · floor 9/10`), BR-SEO-023 (USD).
- Defect fixes `APPROVED`: LB-SEO-001, LB-SEO-002, LB-LND-011, LB-SEO-007, LB-LND-003.
- Q-LND-010 (one definition of «below market») only affects wording; keep legacy texts until it is answered.

## Acceptance criteria

- The `landing` namespace has the 106 legacy keys in all three locales with values equal to the legacy files after the
  entity and tag conversion (diffable by the import script).
- `formatNumber(4337)` gives the same string in the title and the body of a ru page; en gives `4,337` (LB-SEO-001).
- Plurals: «1 новая квартира», «2 новые квартиры», «5 новых квартир», «21 новая квартира»; en «1 new apartment» /
  «2 new apartments»; uz one form «ta yangi kvartira» (`count.what` in the three locales).
- No catalogue value reaches the DOM through `innerHTML`; `<br>` and `<b>` render as elements.
- Landing parity scenarios `browser-uz`, `browser-en`, `menu-lang-uz` (KV-QA-013) show the same texts as legacy once
  KV-FE-108 renders them.

## Tests

- Unit: key-set parity per namespace and locale; entity conversion (`&nbsp;` → U+00A0, `&#8209;` → U+2011); plural table
  for 1, 2, 5, 11, 12, 14, 21, 22, 25, 101, 111 in ru; number fixture of KV-QA-006 for ru, uz, en.
- Snapshot of the BR-SEO-009 ru titles for one slice per page type with fixed numbers.
- Runtime fallback: missing uz key → ru value, reported once.

## Edge cases

- `rooms.short` «{n}&#8209;комн.» with a non-breaking hyphen: kept as U+2011, not a plain hyphen.
- A place without a prepositional form in uz/en: the template uses the nominative with the language's own construction
  (archive decides); never a ru case in an uz page.
- Very large counts (≥ 1 000 000) and zero counts in templates.

## Security

SEC-REQ-021: catalogue markup limited to `<br>` and `<b>`; anything else in an imported value fails the import.

## Definition of done

`make ci-frontend` green; catalogue and template tests green; the import diff attached to the PR; parity gate G4 for
F-LANDING-006 ticked (`15` §4); `09` row updated; PR reviewed by the other developer.
