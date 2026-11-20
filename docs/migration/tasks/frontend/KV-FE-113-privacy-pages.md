# KV-FE-113 — Privacy pages

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | S |
| Milestone | FE-3b (M9, stage S4) |
| Feature IDs | F-PRIVACY-001, F-LANDING-010 |
| Dependencies | KV-FE-100, KV-FE-102, KV-FE-103; text owners: KV-BE-049 (retention ADR), KV-TG-048 (bot `/privacy` text); decisions: DEV-041, DEV-044 `PROPOSED`, DEC-03, DEC-12, DEC-21 |

## Goal

`/privacy.html` keeps working with the legacy three-language policy and language choice, served by `frontend/landing`
from S4; with DEV-041 the uz and en texts get their own indexable URLs, and with DEV-044 the contact is a plain link
instead of an e-mail address that only Cloudflare could decode. The promises on the page are re-checked against HOMI's
real behaviour before the switch, and the page and the bot's `/privacy` text come from one reviewed source.

## Legacy reference

- LND-003 (`/privacy.html`: three `<article data-doc="ru|uz|en">`, titles «Конфиденциальность — kvadro²» / «Maxfiylik —
  kvadro²» / «Privacy — kvadro²», «Обновлено 5 ноября 2026», sections «Сайт kvadro.app», «Бот и приложение kvadro² в
  Telegram», «Как удалить свои данные», «Авторам объявлений», «Вопросы», «← На главную»; `theme-color #ffffff`; no
  canonical, hreflang, og or JSON-LD; `stats.js`), LND-039 (Cloudflare e-mail obfuscation).
- URL-010 (`/privacy.html[?lang=uz|en]`), URL-022 (`/cdn-cgi/l/email-protection#…`), URL-061 (the project mailbox).
- Rules: BR-LND-020 (language: `?lang=`, then `localStorage` `kv-landing-lang`, then browser languages as BR-LND-004,
  no path step; uz/en home links → `./?lang=<lang>`).
- Defects and deviations: LB-LND-008 → DEV-041, LB-LND-016 → DEV-044.
- Source: `$KVADRO_ROOT/demo/landing/site/privacy.html:1-189` (inline script `:166-186`); promises summarised in
  `03b` LND-003 and `$KVADRO_ROOT/docs/about.md:264-275`.

## Implementation

1. Read `frontend/landing/node_modules/next/dist/docs/01-app/02-guides/redirecting.md` and
   `01-app/03-api-reference/04-functions/generate-metadata.md`.
2. Content: transcribe the three articles verbatim into `@homi/i18n` (`privacy` namespace, structured by section, rich
   text limited to links, paragraphs, lists). Before S4 the product owner (with a lawyer, DEC-13 context) reviews every
   promise against HOMI: analytics without cookies on PostHog EU (KV-FE-105), the 180-day action log and 90-day
   listing-PII rules (DEC-12, KV-BE-049), the LLM processor (DEC-03; the text names Gemini), support data (DEC-21),
   «копии фото — до 30 дней», deletion through the bot (KV-TG-048 / F-PRIVACY-002). Mismatches change the text, not the
   promise silently. One source feeds both this page and the bot `/privacy` text (LB-LND-008).
3. Route: `frontend/landing/app/[lang]/privacy/page.tsx`; `proxy.ts` (KV-FE-100) rewrites `/privacy.html` to the ru
   route. Flag `dev041LocalisedPrivacy` in `frontend/landing/lib/deviations.ts` (default off):
   - off (legacy): `/privacy.html` renders the ru article server-side and ships all three; a small client resolver
     applies BR-LND-020 (`?lang=` → `kv-landing-lang` → browser) to show uz or en and set `document.title`; home links
     point to `/`, `/uz/`, `/en/` (root-relative; not `./?lang=` — LB-LND-001/LB-LND-002 fixes);
   - on: `/privacy.html` (ru), `/uz/privacy.html`, `/en/privacy.html` each server-rendered in one language with
     canonical, hreflang ru/uz/en + `x-default`, og (KV-FE-103); `/privacy.html?lang=uz|en` → `301` to the localised
     URL; the two new URLs go to the sitemap (KV-FE-128).
4. Contact (DEV-044, flag `dev044PlainContactLinks`, default off): off → a plain `mailto:` link to the project mailbox
   from configuration (the origin markup legacy had before Cloudflare rewrote it; HOMI never emits URL-022); on → the
   support bot link first (`https://t.me/KvadroSupportBot`, per DEC-21), the mailbox second.
5. Head: `theme-color #ffffff`; title per language; `robots` default (indexable); analytics loader of KV-FE-105.

## States and texts

| State | Shown when | Texts |
| ----- | ---------- | ----- |
| ru | default; `?lang=ru`; no stored or browser match | «Конфиденциальность», «Обновлено 5 ноября 2026» (the date of the reviewed text), the five ru sections, «← На главную» |
| uz | `?lang=uz`, stored `uz`, browser `uz` (flag off) / `/uz/privacy.html` (flag on) | «Maxfiylik», sections «kvadro.app sayti», «Telegramdagi kvadro² boti va ilovasi», «Maʼlumotlaringizni qanday oʻchirish mumkin», «Eʼlon mualliflariga», «Savollar» |
| en | as uz with `en` | «Privacy», «The kvadro.app website», «The kvadro² bot and app in Telegram», «How to delete your data», «For listing authors», «Questions» |
| no JavaScript | flag off | ru article visible; uz/en hidden (legacy); flag on: every language works without JS |
| error | content missing in a locale | falls back to ru (never an empty page) |

## Interaction

- The home link goes to the landing in the same language (`/`, `/uz/`, `/en/`).
- Responsive: one readable column (max ~70 characters per line), as legacy `landing.css` + inline styles.

## Telegram integration

n/a. (The bot's `/privacy` command and «Удалить мои данные» are telegram-track features, KV-TG-048, KV-TG-049.)

## Storage and analytics

- Reads `localStorage` `kv-landing-lang` (flag off); writes nothing.
- Site analytics per KV-FE-105 (`$pageview`).

## Files

- `frontend/landing/app/[lang]/privacy/page.tsx` (new), `frontend/packages/i18n/src/catalogues/{ru,uz,en}/privacy.ts` (new)
- `frontend/landing/proxy.ts` (rewrite and the DEV-041 redirect), `frontend/landing/lib/deviations.ts` (two flags)
- `frontend/landing/tests/privacy.test.ts`, `frontend/landing/e2e/privacy.spec.ts`

## API contract

n/a — static content (the mailbox address and the support bot username from configuration).

## Business rules

- Kept: BR-LND-020 (flag off), the URL-010 contract.
- DEV-041 `PROPOSED` behind `dev041LocalisedPrivacy` (test `todo('DEV-041 PROPOSED')`); DEV-044 `PROPOSED` behind
  `dev044PlainContactLinks` (test `todo('DEV-044 PROPOSED')`).
- The page text is a public promise (`10` §1.14 OPQ-5): changed only through the product owner's review.

## Acceptance criteria

- Landing parity scenarios (KV-QA-013) pass or map to an LB/DEV: `privacy-ru`, `privacy-uz` (`?lang=uz`),
  `privacy-en-browser`, `privacy-stored-uz` (flag off).
- `/privacy.html` answers `200` `text/html`; with DEV-041 on, `/uz/privacy.html` and `/en/privacy.html` answer `200`
  with self canonicals and symmetric hreflang, and `/privacy.html?lang=en` answers `301` to `/en/privacy.html`.
- No `/cdn-cgi/` URL and no Cloudflare script appear in the HTML.
- The PR records the product owner's sign-off that every promise matches HOMI behaviour.

## Tests

- Unit (`privacy.test.ts`): BR-LND-020 resolver table (`?lang`, stored, browser lists `['kk-KZ']`, `['en-US']`,
  `['en-US','uz-UZ']`, `[]`).
- E2E (`privacy.spec.ts`): the four scenarios; the `301` with the flag on; home links per language.
- `todo('DEV-041 PROPOSED')`, `todo('DEV-044 PROPOSED')`.

## Edge cases

- `?lang=xx`: ignored, the resolver continues with stored and browser languages.
- Both `?lang=uz` and a stored `en`: `?lang` wins (BR-LND-020 order).
- The bot profile links to `/privacy.html` (DEV-041 compatibility: the old URL keeps working).

## Security

SEC-REQ-021 (texts rendered as text; the only links are the home, support, mailbox and Telegram links, all allow-listed);
no personal data on the page; SEC-REQ-050 context (the legal review before real users' data is processed).

## Definition of done

`make ci-frontend` green; tests green; the product owner's text review recorded; parity gate G4 for F-PRIVACY-001
(landing part) and F-LANDING-010 ticked (`15` §4); `09` rows updated; PR reviewed by the other developer.
