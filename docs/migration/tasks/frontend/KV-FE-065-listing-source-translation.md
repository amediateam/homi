# KV-FE-065 — Listing: source, original text and translation

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-LISTING-005, F-CONTACT-002 |
| Dependencies | KV-FE-063, KV-FE-029; backend KV-BE-048 (API-010); decisions: DEV-008 `PROPOSED`, DEV-007 `PROPOSED`, FD-2 (transport) |

## Goal

The «Источник» section lists the channel chips, opens the original post, and discloses «Текст оригинала» with the
author's number in the text as a call button; outside the ru locale the text can be machine-translated on demand and
toggled back. Translation state lives in a per-listing cache (LB-APP-003 fixed together with KV-FE-063). This task
also owns the shared `openOriginal(url, src)` helper used by the hero, history, offers and the CTA bar.

## Legacy reference

- Screen: SCR-018 «Источник» (`03` §2).
- Code: `$KVADRO_ROOT/demo/app/src/features/listing/sections/SourcesSection.jsx:14-56`,
  `sections/OriginalText.jsx:18-85` (disclosure, translate button, copy event, «Перевод сделан ИИ»),
  `hooks/useListingTranslation.js:14-41` (first tap fetches, later taps toggle, hidden for `ru`),
  `$KVADRO_ROOT/demo/app/src/lib/phone.js:4-89` (Uzbek number detection and normalisation),
  `ListingScreen.jsx:103-110` (text split), `:139-146` (`openOriginal` + `original_opened`).
- Rules: BR-APP-034 (translate only when the locale is not `ru`), BR-APP-035 (number detection; only the listing's
  `phone` becomes a button), BR-API-070, BR-API-113.
- Defects and deviations: LB-APP-003 (stale translation) → fixed by the keyed screen and the cache here; LB-API-032 →
  DEV-008 (cached GET with quota); LB-API-030 → DEV-007 (no raw numbers).
- Contract: API-010 (`POST /api/listings/:id/translate`, no body → `{"text": string}`), API-008 fields `sources`,
  `original_text`, `original_url`, `phone`.
- Visual baseline (KV-QA-019): `listing-open` → `SCR-018-*.png` (source block); the disclosure-open state has no
  baseline — compare against `OriginalText.jsx`.

## Implementation

1. `frontend/app/lib/listing/openOriginal.ts`: `openOriginal(listingId, url, src)` opens through `openLink` of KV-FE-029
   and sends `original_opened {listing_id, src}` (KV-FE-034) **only when the link actually opened** (the helper
   returns `false` on the 1.5 s debounce); `src ∈ button | video | sources | price_history | offers`.
2. `frontend/packages/utils/src/phone.ts` (shared with the bot-free web code): port `splitPhones(text)` — optional
   `(+)998` prefix, two-digit operator or city code from the legacy set (`20, 33, 50, 55, 61, 62, 65, 66, 67, 69, 70–79,
   88, 90, 91, 93, 94, 95, 97, 98, 99`), separators space, hyphens (`-‐–`), dot, underscore; returns text parts and
   `{raw, phone: '+998XXXXXXXXX'}` parts; 12-digit numbers starting with 998 accepted as they are.
3. `features/listing/sections/SourcesSection.tsx`: heading `listing.source`; chips `@{handle}` per `sources[]` (key =
   `url`), tap → light haptic + `openOriginal(url, 'sources')`; the disclosure only when `original_text` is non-empty.
4. `features/listing/sections/OriginalText.tsx`: disclosure button `listing.originalText` with a chevron rotated when
   open; when open: the translate button (if available), the failure line, `<pre>` with the text parts — a part whose
   `phone === details.phone` renders as a call button (`call('text')` of KV-FE-068), any other number as plain text;
   the `copy` event sends `original_copied {listing_id}`; `listing.machineTranslation` under a shown translation.
5. `features/listing/useTranslation.ts`: state per listing id in the request cache (`translation:<id>:<locale>`):
   `{text, shown, pending, failed}`. Available only when the UI locale is not `ru`. First tap → API-010; success →
   shown; later taps toggle original ↔ translation without a request; failure → `failed`, the next tap retries.
6. DEV-008 (flag `dev008TranslationGet`, default off): with FD-2 = B the call becomes `GET …/translation?lang=<locale>`
   of v1; with FD-2 = A the legacy `POST` stays and a `429 {"detail":"rate_limited"}` shows the new key
   `listing.translateQuota` instead of the generic failure line. Test `todo('DEV-008 PROPOSED')`.
7. DEV-007 (flag `dev007NoRawPhones` of KV-FE-064): numbers in the text are masked to `+998 ** *** ** NN` and none is a
   call button (calls go through the CTA, KV-FE-068). Applies to the display with FD-2 = A; with FD-2 = B the v1 text
   arrives masked by the server.
8. Replay masking: the `<pre>` carries `ph-mask` / `ph-no-capture` (KV-FE-035).

## States and texts

| State | Rendering and keys |
| ----- | ------------------ |
| section heading | `listing.source` «Источник» |
| no sources | chip row hidden (`sources: []`) |
| collapsed | disclosure `listing.originalText` «Текст оригинала» |
| expanded, ru locale | text only; no translate button |
| expanded, uz / en | button `listing.translate` «Перевести» |
| translating (disabled) | button `listing.translating` «Перевожу…», disabled |
| translated | translated text + `listing.machineTranslation` «Перевод сделан ИИ»; button `listing.showOriginal` «Показать оригинал» |
| failed | `listing.translateFailed` «Не получилось перевести»; button `listing.translate` enabled for a retry |
| quota (DEV-008 on) | new key (not in legacy) `listing.translateQuota` — ru «Лимит переводов на сегодня исчерпан»; uz/en to be translated, product owner review |
| no original text | disclosure hidden |

uz and en values of the keys come from the catalogues of KV-FE-016.

## Interaction

- Chip tap, disclosure tap, translate tap: light haptic (TMA-025).
- The phone button in the text: medium haptic, call flow of KV-FE-068 with `src: 'text'`.
- Copying from `<pre>` (long press / selection) sends `original_copied`.
- The disclosure expands in place without animation (legacy); the page keeps its scroll position.

## Telegram integration

TMA-028 (`openTelegramLink` for `https://t.me/<channel>/<post>`), TMA-025 (haptics), TMA-029 (call from the text via
KV-FE-068).

## Storage and analytics

- Storage: none; the translation cache is memory-only per session.
- Journal (KV-FE-034): `original_opened {listing_id, src}` (`sources` here; other `src` values from the callers),
  `original_copied {listing_id}`; the `contact_call` event is sent by KV-FE-068.

## Files

- `frontend/app/lib/listing/openOriginal.ts`, `frontend/packages/utils/src/phone.ts` (new)
- `frontend/app/app/(miniapp)/features/listing/sections/{SourcesSection,OriginalText}.tsx`,
  `frontend/app/app/(miniapp)/features/listing/useTranslation.ts` (new)
- `frontend/app/lib/deviations.ts` (flag `dev008TranslationGet`)
- `frontend/packages/i18n/src/catalogues/*` (new key `listing.translateQuota`, with KV-FE-016)
- Tests: `frontend/packages/utils/src/phone.test.ts`, `frontend/app/tests/listing/{OriginalText,useTranslation}.test.tsx`

## API contract

- API-010 `POST /api/listings/:id/translate`, no body, no `Content-Type` → `200 {"text": string}`; target language is
  the profile locale (the client offers it only outside `ru`). Errors: any → failed state; `429 rate_limited` → quota
  state with the DEV-008 flag on. Must answer within the 15 s client timeout (KV-FE-021).
- API-008 fields: `sources: {url, handle}[]` (strict array), `original_text`, `original_url`, `phone`
  (`+998XXXXXXXXX` or `null`).
- v1 (FD-2 = B only): `GET /api/v1/listings/{id}/translation?lang=` (unnumbered adapter, `11` §12).

## Business rules

- Kept: BR-APP-034, BR-APP-035, BR-API-070, BR-API-113 (a number in the text becomes a call button only when it
  normalises to `phone`).
- LB fix `APPROVED`: LB-APP-003 (translation keyed by listing id and locale).
- DEV-008 `PROPOSED` (quota message; GET only with FD-2 = B); DEV-007 `PROPOSED` (masked numbers).

## Acceptance criteria

- In ru the translate button never appears; in uz and en it appears inside the open disclosure.
- First tap sends exactly one API-010; later taps toggle without requests; after a failure the next tap retries.
- Opening listing A, translating, then opening listing B (or a redirect) shows B untranslated with the disclosure
  closed; returning to A shows A's cached translation state.
- In «… звоните 90 123 45 67 или +998 (91) 765-43-21 …» with `phone = +998901234567` only the first number is a
  button; the second is plain text.
- `original_opened` is not sent when the same chip is tapped twice within 1.5 s.
- Visual: the collapsed source block matches the `listing-open` baseline.

## Tests

- Unit `phone.test.ts`: dataset of formats (`+998 90 123 45 67`, `(90) 123-45-67`, `901234567`, `998901234567`,
  `90.123.45.67`, `90_123_45_67`), unknown codes (`12 345 67 89`), long digit runs, two numbers in one line.
- Unit `useTranslation.test.ts`: availability per locale; fetch-then-toggle; failure-then-retry; keyed by id; DEV-008
  `todo`.
- Component `OriginalText.test.tsx`: call button only for the matching number; DEV-007 masking `todo('DEV-007 PROPOSED')`;
  copy event.
- E2E (KV-FE-170): uz locale, open disclosure, translate (mock `{text}`), toggle back.

## Edge cases

- `original_text` with Cyrillic and Latin mixed and emoji: rendered unchanged.
- Translation returns an empty string: treat as failure.
- `phone` `null` (quota tripped, SEC-REQ-028): no number becomes a button.
- `sources[].url` not on `t.me`: chip still rendered, opening refused by the allowlist (SEC-REQ-019).

## Security

- SEC-REQ-021: original and translated texts are plain text in `<pre>`; never HTML.
- SEC-REQ-043: translation output is untrusted; links and numbers inside it are not linkified.
- SEC-REQ-019: only `https://t.me/…` source URLs are opened.
- TMA-009: no text, number or translation is sent to analytics; only `listing_id` and `src`.

## Definition of done

`make ci-frontend` green; tests above green (or added when KV-FE-010 lands); visual review recorded in the PR; parity
gate G4 for F-LISTING-005 and F-CONTACT-002 ticked (`15` §4); the feature rows in `09` updated; PR reviewed by the other
developer.
