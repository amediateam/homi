# KV-BE-019 — Exchange rates: CBU fetch, `RateService`, staleness alert

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-PIPELINE-007, F-FILTER-006, F-SETTINGS-004 |
| Dependencies | KV-DB-011, KV-DB-004 (money ADR); decisions CF-005, DEC-10; question Q-API-054 |

## Goal

HOMI holds the official daily USD/UZS rate of the Central Bank of Uzbekistan in `exchange_rates`, fetched on a
schedule with retries, readable through one `RateService` (latest rate for `meta.usd_uzs`, the rate of a given day for
conversions at ingestion), and the operators are alerted when the latest rate is older than two days.

## Legacy reference

- UZS prices in posts are converted at the CBU rate (BR-API-140; `$KVADRO_ROOT/docs/about.md:170`;
  `$KVADRO_ROOT/docs/seo-pages.md:249`); prices are stored and filtered in USD, UZS is a display conversion at
  `meta.usd_uzs` (BR-API-153; `$KVADRO_ROOT/docs/about.md:342-343`).
- `meta.usd_uzs: number` (`08` API-001; `$KVADRO_ROOT/docs/api.md:423-452`); the client converts with it
  (`$KVADRO_ROOT/demo/app/src/lib/money.js:53-62`, `:91-101`) and falls back to USD display when it is `0` or missing
  (`15` §3.11 #11).
- Refresh cadence "daily?" is inferred (`02` §18, `UNVERIFIED`); source and rounding of `usd_uzs` are open (Q-API-054).
- HOMI: ADR-0006 rate table "source decided later" (`10` §1.10; GAP-008); CF-005 option A stores the rate row used for
  each normalised price (`10` §3.6); schedule 09:30 and 12:00 Tashkent with hourly retry and a > 2-day alert (`10` §4.11).
- Migration needs the history for the whole listing date range (`14` §2 ENT-041, §4.2 "Exchange rate").

## Implementation

1. Read `.claude/skills/laravel-queues/`, `.claude/skills/laravel-testing/` (`Http::fake`), `10` §4.11 and §4.13.
2. `php artisan make:model --no-interaction ExchangeRate` only if KV-DB-011 did not create it (the table and factory
   belong to KV-DB-011); add casts (`date` → `CarbonImmutable`, `rate` → decimal string).
3. `config/rates.php` (application config): `source_url` (`CBU_RATES_URL`, a URL template with `{date}`), `stale_after_hours`
   (`RATE_STALE_AFTER_HOURS`, default 48), HTTP timeout 10 s, `base` `USD`, `quote` `UZS`.
4. `php artisan make:class --no-interaction Services/Pricing/CbuRateClient` — Laravel HTTP client, parses the published
   JSON (field names fixed once Q-API-054 is answered; until then a documented mapping in the class and the fixture),
   returns `(date, rate)`; rejects non-positive and non-numeric values.
5. `php artisan make:job --no-interaction Pricing/FetchExchangeRate` on queue `default` (`tries` 3, backoff), upsert
   `(date, base, quote)` — re-fetching the same day changes nothing if the value is equal.
6. `php artisan make:command --no-interaction RatesFetch` (`rates:fetch {--date=}`) and `RatesBackfill`
   (`rates:backfill --from= --to=`, chunked, polite delay) for the migration rebuild (KV-DB-021).
7. `php artisan make:class --no-interaction Services/Pricing/RateService`: `latest()`, `on(date)` (latest published on
   or before that Tashkent date), `usdUzs(): ?float` for `meta`, `toUsdCents(int $uzsAmount, CarbonImmutable $date):
   array{cents: int, rate_id: int}` (CF-005: the rate row id is stored with the normalised price).
8. `php artisan make:notification --no-interaction ExchangeRateStale` (operator channel; mail/log until the team chat
   channel exists, `10` §4.13) and `rates:check-stale` (`make:command`).
9. Schedule in `routes/console.php`: `rates:fetch` at 09:30 and 12:00 `->timezone('Asia/Tashkent')`, hourly retry while
   today's rate is missing, `rates:check-stale` hourly — all `->onOneServer()->withoutOverlapping()`.
10. New env keys `CBU_RATES_URL`, `RATE_STALE_AFTER_HOURS` added to `backend/.env.example` in a separate small PR
    (shared file, `docs/handoff/parallel-work.md` §6) and announced.

## Files

- `backend/config/rates.php`
- `backend/app/Services/Pricing/{CbuRateClient,RateService}.php`
- `backend/app/Jobs/Pricing/FetchExchangeRate.php`
- `backend/app/Console/Commands/{RatesFetch,RatesBackfill,RatesCheckStale}.php`
- `backend/app/Notifications/ExchangeRateStale.php`
- `backend/routes/console.php` (schedule entries)
- `backend/tests/Fixtures/Cbu/usd-<date>.json` (synthetic, documented shape)
- `backend/tests/Feature/Pricing/{RateFetchTest,RateServiceTest,RateStaleAlertTest}.php`

## API contract

No HTTP route. Consumed by `GET /api/meta` (`usd_uzs: number`, KV-BE-029), the display formatter (KV-BE-020) and
ingestion (M6). Internal:

```php
RateService::latest(): ?ExchangeRate
RateService::on(CarbonImmutable $tashkentDate): ?ExchangeRate
RateService::usdUzs(): ?float                      // null → meta emits the last known rate or 0 per KV-BE-029
RateService::toUsdCents(int $uzs, CarbonImmutable $date): array{cents: int, rate_id: int}
```

## Business rules

- Kept: BR-API-140, BR-API-153, BR-API-154 (USD numbers on the wire), BR-DATA-008.
- CF-005 option A (`PROPOSED` until the money ADR of KV-DB-004 is accepted): conversion frozen at ingestion with the
  rate of the listing's day; if Q-API-054 shows legacy re-converted daily, HOMI's frozen conversion becomes a DEV
  candidate (record it, do not decide here).
- No DEV applies to this task.

## Acceptance criteria

- `rates:fetch` with a faked CBU response stores one row per day; a second run is a no-op.
- `RateService::on($d)` returns the latest rate published on or before `$d` in Asia/Tashkent (a Sunday uses Friday's).
- `toUsdCents(1_200_000_00 /* minor */, …)` is computed with integer arithmetic and documented rounding (half up),
  returning the rate id used.
- With the latest rate older than `RATE_STALE_AFTER_HOURS`, `rates:check-stale` sends one `ExchangeRateStale`
  notification per day (not every hour).
- Every scheduled entry runs in `Asia/Tashkent` wall-clock time and is listed by `php artisan schedule:list`.

## Tests

- `RateFetchTest`: `Http::fake` with the fixture → row stored; 500 then 200 → retried and stored; malformed JSON,
  zero and negative rates → no row, job failed with a clear message; `Http::preventStrayRequests()` on.
- `RateServiceTest`: `on()` across weekends and the Tashkent midnight (19:00 UTC, `15` §3.10); `toUsdCents` dataset
  from KV-QA-006 (`15` §3.11 #7, #8, #14) with integer expectations only.
- `RateStaleAlertTest`: frozen clock at 47 h / 49 h → no alert / one alert (`Notification::fake()`); second hourly run
  the same day → still one.
- Schedule test: `schedule:list` contains the three entries with the Tashkent timezone.

## Edge cases

- CBU publishes no rate on holidays: the last published rate is used; the stale alert fires only after 48 h.
- Backfill over a long range must not hammer the source: chunked with a delay; resumable by date.
- A published correction for an already stored day updates the row and is logged; prices already normalised keep
  their stored `rate_id` (no silent re-pricing).

## Security

- Outbound HTTPS only to the configured host; no user input reaches the URL (SEC-REQ-023 spirit: fixed host).
- No secrets involved; the URL is configuration (`17` §4 "Exchange rate").
- Notifications carry no personal data.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature row in 09 updated, PR
reviewed by the other developer. Pint and PHPStan level 7 clean; the two env keys and the new scheduled commands are
announced in the PR description for the production track (cron, `docs/handoff/parallel-work.md` §8).
