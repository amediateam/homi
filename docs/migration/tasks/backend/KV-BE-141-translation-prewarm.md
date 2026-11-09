# KV-BE-141 — Source-language detection and translation pre-warm

| Field | Value |
| ----- | ----- |
| Status | TODO (pre-warm stays off until DEC-03 and a cost decision) |
| Owner | Backend (track: development) |
| Complexity | S |
| Feature IDs | F-LISTING-005 |
| Dependencies | KV-BE-048 (`TranslationService`), KV-BE-134 (published listings); DEC-03 |

## Goal

Each published listing records the language of its source text (`ru`, `uz` Latin, `uz` Cyrillic, `en`, mixed), so the
translation offer and cache can skip pointless calls (no translation of a text that is already in the target
language), and an optional, budget-capped pre-warm job can translate popular listings ahead of the first tap — off by
default, because legacy translates only on demand.

## Legacy reference

- BR-API-070 / BR-DATA-040 (translation only on demand into the profile locale with Gemini; never for a `ru`
  interface), BR-APP-034 (offered only when the interface locale is not `ru`; labelled «Перевод сделан ИИ»), Q-API-025
  (caching and target locale), Q-DATA-037 (legacy cache size); `$KVADRO_ROOT/docs/about.md:179`.
- `10` §4.10 (`TranslateListing` pre-warm on `llm`), §4.16 (translations cached in `listing_translations`), SEC-REQ-044
  (translation cache per listing × language, daily cost cap).

## Implementation

1. Read KV-BE-048 and KV-BE-047. Tests first.
2. `php artisan make:class Services/Parsing/LanguageDetector --no-interaction`: deterministic script/stop-word
   heuristic (Cyrillic share, Uzbek-specific letters `ў қ ғ ҳ` and Latin `oʻ gʻ sh ch`, Russian function words) →
   `ru`, `uz_latn`, `uz_cyrl`, `en`, `mixed`; no LLM call. Stored on `listings.language` in the `Publish` stage
   (KV-BE-134) — the LLM's `language` field (KV-BE-129) is used only when the detector says `mixed`.
3. `TranslationService` (KV-BE-048) hook: when the source language equals the target (`uz_latn` → `uz`, `en` → `en`),
   return the original text without an LLM call and without using the quota; `uz_cyrl` → `uz` is still translated
   (script conversion) — recorded as a decision in the PR.
4. `php artisan make:job Parsing/PrewarmTranslation --no-interaction` (queue `llm`, low priority): translates a listing
   into `uz` and `en` through `TranslationService` (same cache, same masking, same audit); dispatched by a scheduled
   `parsing:prewarm-translations` every 30 min for listings opened ≥ `config('parsing.prewarm.min_views')` times in
   the last 24 h by users whose locale is not `ru`; hard cap per day (`config('parsing.prewarm.daily_max')`);
   `config('parsing.prewarm.enabled')` default `false`; the Pennant kill switch `LlmTranslation` also stops it.
5. Pre-warm never runs for withdrawn, purged or taken-down listings, and pre-warmed rows are purged with
   `original_text` (KV-DB-028).

## Files

- `backend/app/Services/Parsing/LanguageDetector.php`, `backend/app/Jobs/Parsing/PrewarmTranslation.php`,
  `backend/app/Console/Commands/Parsing/PrewarmTranslations.php` (new)
- `backend/app/Services/Parsing/TranslationService.php` (same-language short-cut); `backend/config/parsing.php`
- `backend/tests/Unit/Parsing/LanguageDetectorTest.php`, `backend/tests/Feature/Parsing/PrewarmTranslationTest.php` (new)

## API contract

n/a. API-010 behaviour is unchanged (`{"text": "…"}`), except that a same-language request answers from the original
text instantly (spec-tested; legacy behaviour for this case unknown, Q-API-025).

## Business rules

- BR-API-070, BR-DATA-040 (never for `ru` interface; on demand remains the user-facing rule), BR-APP-034.
- Pre-warm is an internal cache optimisation with no user-visible change; it stays off until the product owner accepts
  the cost (DEC-03).

## Acceptance criteria

- Detector accuracy ≥ 95 % on the synthetic corpus of KV-BE-128/130 (ru, uz-Latn, uz-Cyrl, en, mixed).
- An `uz`-Latin listing requested in `uz` makes no LLM call and uses no quota.
- With `prewarm.enabled = false` no pre-warm job is ever dispatched; with it on, the daily cap is never exceeded.

## Tests

- `LanguageDetectorTest`: dataset per language, `mixed_ru_uz`, `short_text_defaults_to_ru`, `digits_only_is_mixed`.
- `PrewarmTranslationTest`: `disabled_by_default`, `selects_popular_non_ru_viewed_listings`, `respects_daily_cap`,
  `kill_switch_stops_prewarm`, `skips_withdrawn_and_purged`, `same_language_short_cut_no_llm_call`,
  `uses_same_cache_row_as_on_demand`.

## Edge cases

- A listing whose text changes after pre-warm (edit): the cache row is invalidated by KV-BE-048's text-hash check.
- Spend cap reached: pre-warm stops first (it runs only when the remaining budget is above
  `config('parsing.prewarm.min_budget_share')`, 50 % `PROPOSED`), so user-triggered translations keep working.

## Security

- SEC-REQ-042…044 (through the gateway, cap, kill switch, audit), SEC-REQ-038 (translations purged with the text).

## Definition of done

Tests green (`make ci-backend`), the off-by-default flag and the cost note in the PR, `09` row F-LISTING-005 updated,
PR reviewed by the other developer.
