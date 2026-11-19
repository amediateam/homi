# KV-BE-047 — LLM gateway with PII masking and spend controls

| Field | Value |
| ----- | ----- |
| Status | TODO (real provider BLOCKED by DEC-03) |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-PRIVACY-004, F-LISTING-005 |
| Dependencies | — (provider: DEC-03; legal basis Q-SEC-006) |

## Goal

Every LLM call in HOMI — translation now (KV-BE-048), extraction and free-text query parsing later (M6, M5) — goes
through one `LlmGateway` that masks phones, handles, links, e-mails and card-like numbers before the provider sees the
text, passes untrusted text as delimited data, validates structured output, enforces a per-environment daily spend cap
with a kill switch, and writes an audit row without raw text.

## Legacy reference

- Masking promise: BR-API-045 («номера и @-ники скрываются до отправки в Gemini»), `02-legacy-backend-audit.md:311-321`
  (§8.2), `$KVADRO_ROOT/docs/about.md:173`, `:350`, `:400`; translation with Gemini `02-legacy-backend-audit.md:407-413`
  (§8.8, BR-API-070, Q-API-025); vendor named in the privacy text `$KVADRO_ROOT/docs/about.md` §5.11.
- Decisions: CF-007 "where parsing happens" and DEC-03 (`10-target-architecture.md` §3.8, §8), `10` §4.14 (`laravel/ai`
  with an env-driven default provider; the package hard-codes `openai` at `backend/vendor/laravel/ai/config/ai.php:16`).
- Security: SEC-REQ-042, SEC-REQ-043, SEC-REQ-044 (`16-security-review.md:895-912`), TB-6 (`16` §2), reviewer rule 8.
- Feature: F-PRIVACY-004 (`09` §3.18), BR-DATA-034.

## Implementation

1. Read `.claude/skills/ai-sdk-development/` (provider configuration, structured output, faking), `.ai/agents/security-reviewer.md`
   (LLM rules) and SEC-REQ-042…044.
2. Publish the package config (`php artisan vendor:publish` for `laravel/ai`, config only) and set
   `'default' => env('AI_DEFAULT_PROVIDER', 'gemini')`; add `AI_DEFAULT_PROVIDER`, `GEMINI_API_KEY` (or the chosen
   vendor's key), `AI_DAILY_SPEND_LIMIT`, `AI_REQUEST_TIMEOUT` (default 10 s) to `backend/.env.example` in a separate
   small PR (shared file) and to `docs/infrastructure/environments.md`. No key values anywhere. The real provider is
   wired only after DEC-03; until then every test uses the package fake.
3. `php artisan make:class Services/Parsing/PiiMasker`: `mask(string): MaskedText` replacing, in this order, `t.me/…`
   and `telegram.me/…` links, `@handles`, e-mails, Uzbek phones in every common local format (`+998 90 123 45 67`,
   `998901234567`, `90 123-45-67`, `(90) 1234567`, spaced and dotted variants, Cyrillic/Latin text around them),
   other international numbers, 13–19-digit card-like sequences → stable placeholders `⟦PHONE_1⟧`, `⟦HANDLE_1⟧`, …;
   `MaskedText` keeps the placeholder map in memory only (never persisted, never logged).
4. `php artisan make:class Services/Parsing/LlmGateway`: the only class allowed to call `laravel/ai`
   (enforced by an `arch()` test: nothing else imports `Laravel\Ai`). API: `complete(LlmTask $task, string
   $untrustedText, array $schema = null): LlmResult` — masks, wraps the text in explicit delimiters with an
   instruction that it is data, calls the provider with timeout, validates JSON output against `$schema` (enums,
   ranges, lengths) and rejects anything else, strips URLs, phones and handles from free-text outputs
   (SEC-REQ-043), and returns tokens and cost.
5. Spend control: daily cost per environment accumulated in Redis (`llm:spend:<date>`) and in the audit table; at
   `AI_DAILY_SPEND_LIMIT` the gateway throws `LlmUnavailable`. Pennant kill switches per task kind
   (`app/Features/LlmTranslation`, `LlmExtraction`, `LlmQueryParsing`; `php artisan pennant` feature classes) — off →
   `LlmUnavailable` without a provider call.
6. Audit: `php artisan make:migration create_llm_calls_table --no-interaction` (no database-track task owns it):
   `llm_calls (id ULID, task, prompt_version, provider, model, masked_input_sha256, output jsonb null, input_tokens,
   output_tokens, cost_micro_usd, status, error_code, created_at)` — **no raw or masked text**, translation outputs not
   stored here (they live in `listing_translations`); retention 180 days via the M7 purge (note for KV-DB-028).
   `php artisan make:model LlmCall --factory --no-interaction`.
7. Queue: background callers use the `llm` queue (new supervisor `supervisor-llm` in `config/horizon.php` — shared
   file, announce in the PR, `10` §4.10); inline callers (translation) run synchronously within their budget.
8. Pint, PHPStan, `make ci-backend`.

## Files

- `backend/config/ai.php` (published, changed default), `backend/config/horizon.php` (`llm` queue — separate PR)
- `backend/app/Services/Parsing/{PiiMasker,LlmGateway}.php`, `backend/app/Domain/Parsing/{MaskedText,LlmTask,LlmResult}.php`,
  `backend/app/Exceptions/Parsing/LlmUnavailable.php` (new)
- `backend/app/Features/{LlmTranslation,LlmExtraction,LlmQueryParsing}.php` (new)
- `backend/database/migrations/*_create_llm_calls_table.php`, `backend/app/Models/LlmCall.php`,
  `backend/database/factories/LlmCallFactory.php` (new)
- `backend/tests/Unit/Parsing/PiiMaskerTest.php`, `backend/tests/Fixtures/Pii/masking-corpus.json` (new, synthetic)
- `backend/tests/Feature/Parsing/LlmGatewayTest.php`, `backend/tests/Arch/LlmBoundaryTest.php` (new)

## API contract

n/a — internal service. Consumers: `TranslationService` (KV-BE-048), extraction (M6), free-text queries (M5). Errors
surface to callers as `LlmUnavailable` (cap, kill switch, timeout, provider error) or `LlmInvalidOutput`.

## Business rules

- Keep: BR-API-045 (mask before any LLM call: extraction, user queries, translation), BR-API-131 / BR-DATA-034 (no
  geolocation is ever sent), BR-API-070 (translation on demand only).
- `PROPOSED`: the provider itself (DEC-03: Gemini for parity vs another vendor, needs the privacy text and Q-SEC-006);
  daily cap values; DEV-008 is the translation route shape (KV-BE-048).
- No legacy oracle for masking quality: the corpus is our specification (spec-tested).

## Acceptance criteria

- The provider fake never receives an unmasked pattern from the corpus (SEC-REQ-042): 100 % recall on positives,
  no false masking of plain prices/areas in the negative cases (`650$`, `85 м²`, `1 200 000 сум`).
- An injection corpus («ignore previous instructions», fake JSON, `owner=true`, link and phone injection) yields only
  schema-valid output; free-text output never contains a URL, phone or handle (SEC-REQ-043).
- With the cap reached or the kill switch off, the gateway refuses without a provider call; audit rows contain no raw
  text (SEC-REQ-044).
- `config('ai.default')` comes from `AI_DEFAULT_PROVIDER`.

## Tests

- `PiiMaskerTest`: dataset from `masking-corpus.json` — ≥ 50 positive and negative cases in ru, uz-Latn, uz-Cyrl and
  en, synthetic numbers only (`+998 00 …`, `example_channel`, `user@example.com`), stable placeholder numbering, the
  same phone twice → same placeholder.
- `LlmGatewayTest` with the `laravel/ai` fake and `Http::preventStrayRequests()`: masked prompt asserted on the fake;
  schema violation → `LlmInvalidOutput`; output URL/phone stripped; timeout → `LlmUnavailable`; cap reached (frozen
  clock, day boundary in UTC) → refused; kill switch → refused; audit row has `masked_input_sha256`, tokens, cost and
  no text column with content.
- `LlmBoundaryTest` (`arch()`): only `App\Services\Parsing\LlmGateway` uses `Laravel\Ai`.
- Logging (SEC-REQ-047): a provider error log line contains neither the input nor the placeholder map.

## Edge cases

- Text that is only a phone number → fully masked; output empty → caller decides.
- Mixed scripts and zero-width characters inside a number (`+998 9​0 …`) → normalised before matching.
- Very long input (> provider limit) → truncated after masking, never before.
- Provider returns placeholders in the output → kept as placeholders (never re-substituted with real values).

## Security

- SEC-REQ-042 (mask inside the wrapper so nothing bypasses it), SEC-REQ-043 (prompt-injection containment),
  SEC-REQ-044 (quotas, cap, kill switch, audit without raw text), SEC-REQ-034 (provider key per environment, never in
  the repository), SEC-REQ-047 (no prompts in logs), SEC-REQ-049 (no new package: `laravel/ai` is installed).
- Review by `.ai/agents/security-reviewer.md` before merge.

## Definition of done

Tests green (`make ci-backend`), the masking corpus committed, parity gate items for F-PRIVACY-004 ticked for the
gateway (`15` §4), `.env.example` keys announced in a separate PR, the F-PRIVACY-004 row in `09` updated, PR reviewed by
the other developer; switching to the real provider is a one-line config change after DEC-03.
