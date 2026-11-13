# KV-BE-131 — Normalisation: deal and rent period, price basis, USD conversion, dictionary codes

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-PIPELINE-004, F-PIPELINE-007 |
| Dependencies | KV-BE-129 (extraction output), KV-BE-015 (gazetteer, aliases), KV-BE-019 (`RateService::usdUzs(date)`), KV-BE-014 (enums, `Money`) |

## Goal

Pre-parse hints, LLM output and collector hints are reconciled into one normalised listing draft with HOMI's types:
`deal` + `rent_period`, property type, price as amount + currency + `price_usd_cents` at the CBU rate of the post date,
an explicit price basis and kind, sane attributes, renovation/appliance codes, and every place mention resolved to
gazetteer ids through the alias table — or left empty, never guessed.

## Legacy reference

- Money: BR-DATA-008 (stored and filtered in USD; UZS converted at the CBU rate), BR-SEO-023 (UZS → USD at the official
  CBU rate), BR-API-140, BR-API-153, LB-DATA-019 (one `price_usd` with several bases), CF-005 (KV-DB-004 money ADR).
- Deal: CF-016 (`rent` + period → `rent_long` / `rent_daily`), `08` §1.7 deal values; BR-API-028 (types per deal).
- Dictionaries: LB-DATA-001 (several spellings → `dictionary_code_aliases`), BR-API-050, BR-API-051 (district may be
  inferred from a landmark or mahalla), BR-SEO-016 (new build: «так сказано в объявлении или в канале»), BR-SEO-021
  (a listing belongs to a quarter if its text names the quarter), Q-API-020, Q-SEO-006.
- Medians exclusions depend on correct bases: BR-API-057 (per-person prices dropped), BR-API-063 (down payments and
  instalments excluded).

## Implementation

1. Read KV-BE-014, KV-BE-015, KV-BE-019, the KV-DB-004 money ADR and `.ai/agents/listing-matching-engineer.md` rule 14
   (synonyms are data). Tests first.
2. `php artisan make:class Services/Ingest/ListingNormaliser --no-interaction`:
   `normalise(PreParseResult, ?ExtractionResult, IntakePayload $hints, SourceChannel): NormalisedListing | Rejection`.
3. Precedence per field (config table in `config/ingest.php`): deterministic pre-parse > LLM extraction > collector
   hints (by source trust weight; `kvadro_legacy` lowest) > channel defaults (city, new-build flag). Conflicts are
   recorded as reason codes on the stage row.
4. Deal and period: LLM `deal` + `rent_period`; a daily marker in the text (`сутки`, `посуточно`, `kunlik`) forces
   `daily`; `rent` without period → `long` with `period_inferred`. Demand kinds stop here (`demand_stored`).
5. Price: amount + currency; `млн`/`mln` × 10⁶; `k` × 10³; UZS → `price_usd_cents` = `round(amount / usd_uzs(date) ×
   100)` with `usd_uzs` of `posted_at`'s Tashkent date from `RateService` (fallback: latest earlier rate, flagged);
   USD stays; EUR → via the CBU EUR rate if stored, else rejected as `currency_unsupported` for statistics but the
   listing is still published with its source price. `price_basis` (`month`, `day`, `total`, `per_person`, `per_m2`,
   `per_sotka`) and `price_kind` (`down_payment`, `instalment`, null) kept explicitly (LB-DATA-019 fix: medians and
   filters read the basis, not the display string).
6. Sanity rules (reject field, not listing; `PROPOSED` values in config): rent long $20–$50 000/month, daily
   $5–$2 000/day, sale $1 000–$50 M total; rooms 0–20; area 8–2 000 m² for flats; floor ≤ floors_total; a price that
   fails sanity → `price = null` + `price_unverified` (the listing is published without price only if the channel
   allows it; otherwise held `needs_review`).
7. Dictionaries through `Gazetteer` (KV-BE-015): renovation, appliances, district, quarter, metro, ЖК and landmark
   mentions resolved by canonical code → alias (case-insensitive, `ʻ`/`'`/`’` and `_`/`-` folded, uz-Cyrl transliterated
   to uz-Latn first); unresolved mentions are kept in `unresolved_places[]` for the gazetteer backlog (a weekly report
   command `geo:unresolved-report` lists the top N with counts) — never auto-created as dictionary rows.
8. Market: `new` when the text claims a new build or the channel is a new-build channel (BR-SEO-016); `secondary` only
   when stated; else null.
9. Output `NormalisedListing` (readonly DTO) consumed by KV-BE-132 (geo) and KV-BE-134 (publish).

## Files

- `backend/app/Services/Ingest/ListingNormaliser.php`, `backend/app/Domain/Ingest/{NormalisedListing,Rejection}.php`,
  `backend/app/Services/Ingest/Stages/Normalise.php` (body), `backend/app/Console/Commands/Geo/UnresolvedPlacesReport.php` (new)
- `backend/config/ingest.php` (precedence, sanity bounds) (new)
- `backend/tests/Unit/Ingest/ListingNormaliserTest.php`, `backend/tests/Feature/Ingest/NormaliseStageTest.php` (new)

## API contract

n/a (internal).

## Business rules

- BR-DATA-008, BR-SEO-023, BR-API-153 (USD at the CBU rate; the conversion date is the post date — `PROPOSED`, legacy
  date basis unknown, Q-API-054 / Q-DATA-034), CF-016, BR-API-028 (types valid per deal), BR-SEO-016, BR-SEO-021,
  LB-DATA-001 and LB-DATA-019 fixes (`09` §4.3, internal, `APPROVED` by the policy).

## Acceptance criteria

- `12 млн сум` posted on a day with rate R → `price_amount = 12 000 000`, `price_currency = UZS`,
  `price_usd_cents = round(12 000 000 / R × 100)`.
- «первый взнос $20 000» → `price_kind = down_payment` (excluded from sale medians later).
- `Mirzo-Ulug'bek`, `Мирзо-Улугбек`, `mirzo_ulugbek` all resolve to the same district id.
- An unresolvable landmark stays unresolved and is listed in the report; no dictionary row is created.

## Tests

- `ListingNormaliserTest` (dataset): `uzs_million_converted_at_post_date_rate`, `missing_rate_uses_previous_and_flags`,
  `daily_marker_forces_daily`, `rent_without_period_long_inferred`, `down_payment_kind`, `per_person_basis`,
  `per_sotka_for_land`, `price_out_of_bounds_nulled_and_flagged`, `floor_above_total_dropped`,
  `precedence_preparse_over_llm_over_hints`, `kvadro_legacy_hint_loses_conflicts`, `aliases_resolve_districts_all_scripts`,
  `unresolved_place_kept_not_created`, `new_build_channel_sets_market_new`, `types_invalid_for_deal_rejected`.
- `NormaliseStageTest`: `demand_post_stops`, `conflicts_recorded_as_reason_codes`.

## Edge cases

- Price in both USD and UZS in one post: the USD amount wins (no conversion error), UZS kept as hint.
- A rate missing for weeks (CBU outage): conversion uses the latest rate with `rate_stale` flag; KV-BE-019's alert is
  already firing.
- «договорная» / no price: `price_type = negotiable_no_price`, published without price (legacy shows such listings?
  unknown — follows Q-API-021-independent display rules of KV-BE-020).
- uz-Cyrl text with Latin district names: transliteration before alias lookup.

## Security

- SEC-REQ-017 (closed enums and ranges, same normaliser vocabulary as filters), SEC-REQ-043 (model output never trusted
  without validation), SEC-REQ-047 (reason codes only in logs).

## Definition of done

Tests green (`make ci-backend`), the precedence and sanity tables documented in `docs/api/intake.md` (processing),
`09` rows F-PIPELINE-004 and F-PIPELINE-007 updated, PR reviewed by the other developer.
