# KV-QA-006 — Time and money case matrix with clock helpers

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | QA (track: development) |
| Complexity | M |
| Feature IDs | F-FILTER-006, F-SETTINGS-004, F-SETTINGS-005, F-DELIVERY-003, F-DELIVERY-004, F-LOCALE-002, F-LOCALE-003, F-LISTING-006, F-BOT-005, F-MEDIA-001 |
| Dependencies | none for the fixtures and helpers; the formatter, parser and delivery-window services of the backend tasks consume them |

## Goal

Two shared fixture files hold every time-zone and money case of `15` §3.10 and §3.11 with the legacy output, the
expected HOMI output and the rule that decides between them; clock helpers make "23:00 in Tashkent" a one-liner; the
same fixtures will drive the new clients' tests after T8, so server strings and client formatting cannot drift
(CF-017).

## Legacy reference

- Money: `$KVADRO_ROOT/demo/app/src/lib/money.js:14-23` (UZS only with a positive rate), `:32-46` (units),
  `:57` (USD), `:76-101` (parsing, `max(1, round(mln × 10^6 / rate))`), `:103-140` (presets); `03` §3.5; BR-API-031,
  BR-API-153 … BR-API-156, BR-APP-060; LB-APP-011 (defect fix, `09` §4.3); LB-API-027 and LB-BOT-019 → DEV-006
  (`PROPOSED`); LB-BOT-018 → DEV-029 (`PROPOSED`).
- Time: BR-API-150 … BR-API-152, BR-DATA-030, BR-BOT-077; quiet and digest presets (`04` §3.14, Q-API-029);
  LB-APP-010 (defect fix), LB-APP-025 → DEV-014 (`PROPOSED`); rent-index months Q-DATA-032; naive legacy timestamps
  Q-DATA-035.
- HOMI: ADR-0006 (UTC storage, Asia/Tashkent display, ISO-8601 with offset in v1); `frontend/packages/utils/src/index.ts`
  (`formatPrice`, `formatDateTime`).

## Implementation

1. Read `15` §1.4, §3.10, §3.11 and `03` §3.5.
2. Write `backend/tests/Fixtures/Shared/money-cases.json`. One object per case: `id`, `input` (`usd` or `uzs` amount,
   or raw text for parsing; `currency`, `locale`, `rate`), `legacy_output`, `expected_output`, `rule`
   (`legacy` | `fix:LB-…` | `DEV-NNN:PROPOSED`), `evidence`. Include every row of `15` §3.11, including the 999 499 /
   999 500 / 1 000 000 boundaries, the млрд boundary, the `max(1, …)` floor, rate 0, presets rounding, and the bot
   typed-amount formats.
3. Legacy outputs: compute them by evaluating a scratch copy of `money.js` with Node (never inside the legacy tree), or
   by hand from the code when the module imports app internals; record which in `evidence`. Fix the exact separator
   code points (`Intl.NumberFormat('ru-RU')` / `'en-GB'`) as Node 26 produces them.
4. Write `backend/tests/Fixtures/Shared/time-cases.json` with explicit UTC instants and the expected decision: quiet
   windows `23-08`, `22-08`, `00-09`, `23-07`; digest slots `09`, `09,19`, `12,20`, `19`; "today/yesterday" across the
   Tashkent midnight (19:00 UTC); `posted_days` edges; media `e` at 23:59:59 / 00:00:00 UTC; 90- and 180-day retention
   boundaries; rent-index month boundary.
5. Write `backend/tests/Support/Time/TashkentClock.php`: `TashkentClock::at('2026-11-09 23:00')` travels to the UTC
   instant (`18:00Z`); `TashkentClock::utc('…')`; `assertSameInstant()`.
6. Write Pest dataset loaders `moneyCases()` and `timeCases()` in `backend/tests/Support/Datasets.php`, filtering by
   tag (for example `money.uzs.boundary`).
7. Write `backend/tests/Unit/Shared/{MoneyCasesFixtureTest,TimeCasesFixtureTest,TashkentClockTest}.php`: schema valid;
   every case has `rule` and `evidence`; helper arithmetic correct.
8. Add the consumer tests as `todo` entries that the backend tasks enable: `MoneyFormatterTest` (server strings),
   `PriceInputParserTest`, `QuietHoursWindowTest`, `DigestScheduleTest`, `AgeLabelTest`.
9. Add the Composer script `test:tz` (`TZ=Asia/Tashkent` for the PHP process, `APP_TIMEZONE=UTC`) for the nightly
   matrix of KV-QA-021.

## Files

- `backend/tests/Fixtures/Shared/money-cases.json`, `time-cases.json` (new)
- `backend/tests/Support/Time/TashkentClock.php`, `backend/tests/Support/Datasets.php` (new)
- `backend/tests/Unit/Shared/*Test.php` (new)
- `backend/composer.json` (script `test:tz`)

## API contract

Money strings appear in `ListingPreview.price`, `history[].price_usd` (number), map `label`, flow option labels;
timestamps in `history[].at`, `median_updated` (`Z` on the legacy surface, BR-API-151).

## Business rules

Keep: BR-API-031, BR-API-150 … BR-API-155, BR-BOT-077. Apply: LB-APP-011 and LB-APP-010 defect fixes (new clients and
server strings). Written as `todo`: DEV-006, DEV-014, DEV-029 until approved.

## Acceptance criteria

- Every row of `15` §3.10 and §3.11 is a fixture case with `rule` and `evidence`.
- `legacy_output` of every money case was produced from the legacy code (scratch run or by hand, recorded).
- The fixture self-tests and `TashkentClockTest` are green; `composer test:tz` runs the suite with the process zone set
  to Asia/Tashkent.

## Tests

As in steps 7–8.

## Edge cases

- Asia/Tashkent has no DST; a case asserts that no code path uses a DST-aware offset lookup for future dates
  differently from past ones.
- Rate changes between the price string and `meta.usd_uzs` in one session: both read the same daily rate.
- Negative or zero amounts and `NaN` inputs: `null`, never `$NaN` (LB-API-009).

## Security

No user data; fixtures are synthetic numbers and instants.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature rows in 09 updated, PR
reviewed by the other developer.
