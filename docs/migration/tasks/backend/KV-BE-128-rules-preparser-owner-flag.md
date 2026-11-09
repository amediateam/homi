# KV-BE-128 — Deterministic pre-parser: phones, owner hashtags, demand posts, price hints

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-PIPELINE-002, F-OWNER-002, F-PRIVACY-004 |
| Dependencies | KV-BE-124 (`PreParse` stage), KV-BE-047 (`PiiMasker` patterns), KV-BE-025 (owner badge inputs) |

## Goal

Before any LLM call, a deterministic parser extracts what rules can decide reliably: the author's phone numbers
(normalised to E.164, stored encrypted and as a keyed HMAC, never in plain text and never sent to the LLM), Telegram
contact handles, the owner signal (an explicit owner statement or a channel owner hashtag — the only way `owner_status
= owner` can be set), demand posts, explicit price and currency hints, and the `contact_url`; the LLM later fills the
rest.

## Legacy reference

- BR-API-046 (owner = explicit owner statement in the text or a channel hashtag `#хозяин`, `#собственник`),
  BR-SEO-010 (same rule for «от хозяев без риелтора» counters), BR-API-045 / BR-BOT-088 (mask phones and handles before
  the LLM), BR-API-116 (`phone` format `+998XXXXXXXXX`), BR-APP-035 (Uzbek numbers: `[+998] XX XXX XX XX` with a known
  operator or city code), BR-DATA-028 (author = phone, else source channel), BR-API-115 (`contact_url`,
  `contact_paid`).
- SEC-REQ-043 (`is_owner` cannot be set by the model alone), SEC-REQ-036 (minimisation), DEV-007 (raw numbers not in
  the new API), DEV-011 (keyed hash).
- `$KVADRO_ROOT/docs/seo-pages.md:259-262` (owner rule), `$KVADRO_ROOT/demo/app/src/features/listing/sections/OriginalText.jsx`
  (client phone detection used for the call button).

## Implementation

1. Read `.ai/agents/security-reviewer.md` (detectors that label people), KV-BE-047 (`PiiMasker` patterns — reuse, do
   not duplicate), KV-BE-025. Tests first with a synthetic corpus (numbers in the reserved `+998 00 …` range or
   invented operator codes marked as such, `15` §1.7).
2. `php artisan make:class Services/Parsing/PhoneExtractor --no-interaction`: finds Uzbek numbers in every local format
   (`+998 90 123 45 67`, `998901234567`, `90 123-45-67`, `(90) 1234567`, `901234567`, dotted, with Cyrillic/Latin
   around), validates the operator/city code against `config('phones.uz_codes')`, returns E.164 list in order of
   appearance; foreign numbers kept only when the post has no Uzbek number.
3. `php artisan make:class Services/Parsing/PreParser --no-interaction` → `PreParseResult`:
   - `phones` → `PhoneVault::store(e164)` (encrypted cast with the dedicated key + `phone_hmac` HMAC-SHA-256 with the
     phone pepper, `06` §4.2 `listing_authors`), the first Uzbek number is the listing `phone`;
   - `handles` (`@user`, `t.me/user`) → `contact_url` candidate `https://t.me/<user>` (allowlisted, SEC-REQ-019) when
     no phone exists; a paid-contact marker in the channel config or text («номер платный») → `contact_paid`;
   - `owner_signal`: `hashtag` when a channel owner hashtag from `source_channels.owner_hashtags` (default `#хозяин`,
     `#собственник`, `#egasidan` `PROPOSED`) appears; `statement` when a closed list of owner phrases appears
     (`от хозяина`, `без посредников`, `собственник`, `egasidan`, `vositachisiz` — list in
     `config('parsing.owner_phrases')`, `PROPOSED`, reviewed against the golden set of KV-BE-130); `agent_signal` for
     realtor phrases (`риелтор`, `агентство`, `комиссия`, `rieltor`); conflict → `unknown`;
   - `kind`: `demand` for closed patterns («сниму», «куплю», «ищу квартиру», «olaman», «ijaraga olaman») at the post
     start, else `offer`;
   - `price_hints`: amounts with explicit currency markers (`$`, `у.е.`, `usd`, `сум`, `so'm`, `млн`, `mln`, `k`) and
     their basis markers (`в месяц`, `/мес`, `сутки`, `kuniga`, `за м²`, `первый взнос`, `взнос`) — hints only, the
     LLM output is reconciled against them in KV-BE-129;
   - `text_for_llm`: the raw text passed through `PiiMasker` (phones, handles, links, e-mails, card-like numbers →
     placeholders). The unmasked text never leaves this stage except into `listings.original_text` (purged at 90 days).
4. Output stored on the `ingest_runs` row as codes and hashes only (no phone, no text); phones go straight to the vault.
5. `owner_status` rule (single place): `owner` iff `owner_signal ∈ {hashtag, statement}` and no `agent_signal`;
   `agent` iff `agent_signal` (or the author already has `realtor_mark_at`, KV-BE-043); else `unknown`. The LLM may
   propose but never decide (SEC-REQ-043). The verified-owner badge stays with KV-BE-025.

## Files

- `backend/app/Services/Parsing/{PhoneExtractor,PreParser,PhoneVault}.php`, `backend/app/Domain/Parsing/PreParseResult.php` (new)
- `backend/app/Services/Ingest/Stages/PreParse.php` (body)
- `backend/config/parsing.php`, `backend/config/phones.php` (new)
- `backend/tests/Fixtures/parsing/preparse-corpus.php` (≥ 60 synthetic cases ru, uz-Latn, uz-Cyrl, en),
  `backend/tests/Unit/Parsing/PhoneExtractorTest.php`, `backend/tests/Unit/Parsing/PreParserTest.php`,
  `backend/tests/Feature/Ingest/PreParseStageTest.php` (new)

## API contract

n/a (internal).

## Business rules

- BR-API-046 / BR-SEO-010 (owner only by statement or hashtag), BR-DATA-028 (author = phone else channel), BR-API-116
  (E.164 `+998…`), BR-API-115 (`contact_url`, `contact_paid`), BR-API-045 (masking before the LLM).
- DEV-011 `PROPOSED` (HMAC-SHA-256 with a server secret) — applied to new data now because legacy hashes are not
  touched here; the transitional legacy-hash match stays in KV-BE-025.

## Acceptance criteria

- 100 % of the phone cases of the corpus are found and normalised; no negative case (prices, dates, flat numbers,
  card-like 16-digit numbers) is taken for a phone.
- `owner_status = owner` never results from LLM output alone; `#хозяин` + «комиссия» yields `unknown`.
- `text_for_llm` contains no number, handle, link or e-mail from the corpus (SEC-REQ-042 acceptance).
- No phone or post text appears in logs or `ingest_runs` (database scan in the test).

## Tests

- `PhoneExtractorTest`: dataset over every format (`+998 90 …`, `998…`, `(90)`, dotted, Cyrillic neighbours),
  `price_like_numbers_not_phones`, `foreign_number_only_when_no_uz`, `invalid_operator_code_rejected`.
- `PreParserTest`: `hashtag_sets_owner`, `owner_phrase_sets_owner`, `agent_phrase_wins_conflict_to_unknown`,
  `demand_post_detected_ru_uz`, `handle_becomes_contact_url_when_no_phone`, `paid_contact_marker`,
  `price_hint_with_basis_markers`, `text_for_llm_masked` (SEC-REQ-042 corpus), `uz_cyrl_text_handled`.
- `PreParseStageTest`: `phones_stored_encrypted_and_hmac_only`, `no_pii_in_ingest_runs_or_logs` (log fake + DB scan),
  `existing_realtor_mark_forces_agent`.

## Edge cases

- Several phones of different people in one post (agency lists): all stored; the author is the first; `distinct_flats`
  counting (KV-BE-025 inputs) uses every phone.
- A phone written with letters («девяносто…») is not detected — accepted miss, documented.
- A post where the channel adds its own contact in the footer: channel config `footer_patterns` stripped before
  extraction so the channel's number is not taken as the author's.
- Owner hashtag inside a quoted repost of another channel: counts only if the forwarding channel's hashtag list
  contains it.

## Security

- SEC-REQ-036, SEC-REQ-042 (masking before any LLM), SEC-REQ-043 (owner flag deterministic), SEC-REQ-045 (labels about
  people: no single signal relabels a number globally), SEC-REQ-047 (no phones in logs), SEC-REQ-019 (`contact_url`
  allowlist).

## Definition of done

Tests green (`make ci-backend`), the corpus committed with synthetic data only, security-reviewer notes in the PR,
`09` rows F-PIPELINE-002, F-OWNER-002 and F-PRIVACY-004 updated, PR reviewed by the other developer.
