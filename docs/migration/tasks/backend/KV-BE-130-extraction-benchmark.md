# KV-BE-130 — Extraction golden set and benchmark command

| Field | Value |
| ----- | ----- |
| Status | TODO (harness and synthetic set now; the real golden set BLOCKED by Q-SYS-002 — legacy data; real-provider runs BLOCKED by DEC-03) |
| Owner | Backend (track: development); runs on real data only on production-track infrastructure **[PT]** |
| Complexity | M |
| Feature IDs | F-PIPELINE-002 |
| Dependencies | KV-BE-129; DEC-03, Q-SYS-002; `14` §1.2 (handling of production data) |

## Goal

Any parser (rules + LLM of KV-BE-128/129 with a given provider and prompt version, or a collector's parsed hints) can be
scored reproducibly against a golden set of post text → expected fields: per-field accuracy, null-correctness («без
догадок»), cost and latency per post. The command produces the numbers DEC-03 and the CF-007 side-by-side run need, and
every prompt change ships with its score.

## Legacy reference

- CF-007 data item 5 ("a golden set for parsing: migrated listings give (post text → legacy-extracted fields) pairs
  once the legacy database is available (Q-SYS-002); it scores any parser on accuracy, cost and latency"), `10` §3.8
  "LLM vendor (sub-decision, DEC-03)… the golden-set benchmark decides".
- BR-API-044 (fields), BR-SEO-029 (methodology claims), Q-API-018 (legacy prompts unknown).
- `14` §1.2, SEC-REQ-041 (legacy dump never in the repository, agent context, CI artefacts or laptops).

## Implementation

1. Read `.claude/skills/ai-sdk-development/`, `.ai/agents/listing-matching-engineer.md` rule 12 (golden-set practice),
   `14` §1.2 and SEC-REQ-041. Tests first.
2. Golden-set format (`backend/tests/Fixtures/parsing/golden/*.jsonl`, one case per line): `{id, text (synthetic),
   channel_hints, expected: {field: value|null}, tags: [ru|uz|uz_cyrl|en, rent_long|rent_daily|sale, hard]}`. Commit
   ≥ 150 synthetic cases written by hand from the field rules (prices in USD/UZS/«млн», down payments, daily rent,
   studios, houses with sotka, new builds, demand posts, missing fields) — synthetic phones only.
3. Real golden set (later): `parsing:golden-export` (**[PT]**, runs only where the migrated data lives) builds cases
   from migrated publications (`original_text` + legacy-extracted fields of non-purged listings), masks phones first,
   writes to a path outside the repository; refuses `APP_ENV=local` unless the input is marked sanitised (SEC-REQ-041
   acceptance).
4. `php artisan make:command Parsing/BenchmarkExtraction --no-interaction` → `parsing:benchmark {--set=} {--provider=}
   {--prompt=} {--limit=} {--parser=rules|llm|hints}`: runs the parser per case (LLM calls through `LlmGateway`, so
   masking, caps and audit apply; a separate `benchmark` spend bucket), compares field by field with tolerances
   (price ±0 for stated amounts, area ±0.5 m², exact enums), counts `null`-correctness separately (predicting a value
   where `expected` is `null` = hallucination), and writes a report (`storage/app/benchmarks/<date>-<prompt>.json` +
   a Markdown summary table): accuracy per field and tag, hallucination rate, cost per 1 000 posts, p50/p95 latency.
5. CI: the rules parser and the faked LLM run on the synthetic set in the normal suite (fast, deterministic); a real
   provider run is a manual command, never in CI.
6. Thresholds for adopting a prompt or provider (`PROPOSED`, written in the LLM ADR of KV-BE-120): price/deal/rooms
   accuracy ≥ 95 %, hallucination ≤ 2 %, cost and p95 recorded; a regression of any core field by > 2 points blocks the
   change.

## Files

- `backend/app/Console/Commands/Parsing/{BenchmarkExtraction,ExportGoldenSet}.php`,
  `backend/app/Services/Parsing/Benchmark/{GoldenCase,FieldComparator,BenchmarkReport}.php` (new)
- `backend/tests/Fixtures/parsing/golden/synthetic.jsonl` (≥ 150 cases)
- `backend/tests/Feature/Parsing/BenchmarkExtractionTest.php`, `backend/tests/Unit/Parsing/FieldComparatorTest.php` (new)

## API contract

n/a (commands). Report JSON: `{prompt, provider, model, cases, fields: {name: {accuracy, hallucination}}, cost_usd,
latency_ms: {p50, p95}}`.

## Business rules

- BR-API-044 is the scoring rule: unstated fields must stay `null`; a filled unstated field counts as an error.

## Acceptance criteria

- `parsing:benchmark --parser=rules --set=synthetic` runs in CI in < 30 s and produces the report.
- The comparator treats `null` vs value and value vs `null` as two distinct error classes.
- `parsing:golden-export` refuses to run locally on unsanitised input and never writes into the repository tree.

## Tests

- `FieldComparatorTest`: `exact_enum_match`, `area_tolerance`, `price_exact`, `null_expected_value_given_is_hallucination`,
  `value_expected_null_given_is_miss`.
- `BenchmarkExtractionTest`: `runs_rules_parser_on_synthetic_set`, `llm_parser_uses_gateway_fake_and_masking`,
  `benchmark_spend_bucket_separate_from_production_cap`, `report_contains_per_tag_breakdown`,
  `export_refuses_local_unsanitised_input`, `export_path_outside_repository`.

## Edge cases

- Golden cases whose legacy extraction was itself wrong: a `disputed` tag excludes them from accuracy and lists them for
  manual review (they may become DEV candidates).
- Very long posts beyond the provider's limit: scored as `truncated`, reported separately.
- Provider rate limits during a run: the command pauses and resumes; partial reports are marked incomplete.

## Security

- SEC-REQ-041 (legacy data handling), SEC-REQ-042…044 (the benchmark goes through the gateway), SEC-REQ-047 (reports
  hold field values and ids, never post text). Synthetic fixtures only in the repository (`15` §1.7).

## Definition of done

Tests green (`make ci-backend`), a first synthetic report attached to the PR, the adoption thresholds recorded in the
LLM ADR, `09` row F-PIPELINE-002 updated, PR reviewed by the other developer.
