# KV-BE-021 — Time, age, distance and title formatters

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-LOCALE-003, F-LISTING-006, F-LISTING-007 |
| Dependencies | KV-BE-020; KV-QA-006 (time fixtures); decisions DEV-014, DEV-019, DEV-021 (`PROPOSED`); question Q-API-022 |

## Goal

The non-money server strings and timestamps of the legacy serializers come from one place: wire timestamps in ISO-8601
UTC with `Z`, the `age` string computed on Asia/Tashkent days, distances rounded once, and the listing texts (`title`,
`short_title`, `status_text`, `market`, `district_name`, `facts[].label/value`, flow `rate`) built from the
`backend/lang` catalogues created by KV-BE-020 — reusable by the bot cards of M5.

## Legacy reference

- `title` shown up to the first ` · `; `age` is `<prefix> · <when>`, the UI shows the part after the first ` · `
  (BR-API-072; `$KVADRO_ROOT/docs/api.md:270`, `:273`).
- Display strings rendered as received (BR-API-074): `facts[].label/value`, `district_name`, `landmark`, `metro`,
  `owner`, `status_text` (mock «Сдана», `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:81`; BR-API-069), `market`
  label with `market_code` (BR-API-073), option `label`/`rate`, `relaxed[].text`.
- `facts[].key` ∈ `type, rooms, area, land, floor, building, renovation, furniture, appliances, per_m2, commission,
  conditions`, unique (`08` §1.8; LB-API-010).
- Business time is Asia/Tashkent («N ч назад», BR-API-150); wire timestamps ISO-8601 UTC with `Z` (BR-API-151;
  `mocks.mjs:94-95`, `:99`); `15` §3.10 #5, #7.
- Distances: `metro_km`, `center_km`, `nearby[].km` are numbers formatted by the client; two client rules disagree
  (BR-APP-029, BR-APP-031 → DEV-019 `PROPOSED`); flow wording differs per surface (DEV-021 `PROPOSED`); price-history
  dates in Tashkent for the new client (DEV-014 `PROPOSED`).
- Bot card texts reuse the same formatter (CF-017, `04` §3.10).

## Implementation

1. Read `.claude/skills/laravel-best-practices/`, `15` §3.10 and §3.12, and the KV-BE-020 catalogue conventions.
2. `php artisan make:class --no-interaction Services/Display/TimeFormatter`:
   - `isoUtc(CarbonImmutable): string` — `Y-m-d\TH:i:s\Z`, always UTC, no fractional seconds (BR-API-151);
   - `age(CarbonImmutable $postedAt, CarbonImmutable $now, LocaleCode): string` — `<prefix> · <when>` with minutes,
     hours, "yesterday" and dates decided on the **Asia/Tashkent** calendar day (`15` §3.10 #5), plural forms from
     `lang/*/time.php`;
   - `rate(int $count, int $days, LocaleCode): string` — the flow `rate` wording (DEV-021 behind
     `config('display.unified_flow_vocabulary')`, default legacy wording from the fixture).
3. `php artisan make:class --no-interaction Services/Display/DistanceFormatter`: `km(?float $metres): ?float` for JSON
   numbers (two decimals, stable rounding) and `label(float $metres, LocaleCode): string` for texts (DEV-019 rule —
   metres below 1 km rounded to 50/100, km with one decimal above — behind `config('display.unified_distance')`).
4. `php artisan make:class --no-interaction Services/Display/ListingTextBuilder`: `title()`, `shortTitle()`,
   `statusText()` (per `ListingStatus`, `null` for active), `marketLabel()` (+ `market_code`), `districtName()` (via
   `Gazetteer::name`), `facts(Listing, LocaleCode): list<array{key: string, label: string, value: string}>` with unique
   keys from the closed set and the fact order of the fixture.
5. Catalogue keys added to `lang/{ru,uz,en}/{listing,time}.php`; parity test of KV-BE-020 extended automatically.
6. Golden strings from KV-QA-002 / KV-QA-006 fixtures as datasets, marked spec-tested until Q-API-022 is closed.

## Files

- `backend/app/Services/Display/{TimeFormatter,DistanceFormatter,ListingTextBuilder}.php`
- `backend/config/display.php` (DEV flags)
- `backend/lang/{ru,uz,en}/{listing,time}.php` (keys added)
- `backend/tests/Unit/Display/{TimeFormatterTest,DistanceFormatterTest}.php`
- `backend/tests/Feature/Display/ListingTextBuilderTest.php`

## API contract

Feeds these legacy fields (`08` §1.8): `title: string`, `short_title?: string`, `age: string|null`,
`status_text: string|null`, `market: string|null` (+ `market_code?: string|null`), `district_name: string|null`,
`facts: {key, label, value}[]` (unique `key`), `history[].at: string` (ISO `Z`), `median_updated?: string|null` (ISO
`Z`), `metro_km`/`center_km`/`nearby[].km` numbers, flow `options[].rate: string`. Internal:

```php
TimeFormatter::isoUtc(CarbonImmutable $t): string
TimeFormatter::age(CarbonImmutable $postedAt, CarbonImmutable $now, LocaleCode $l): string
TimeFormatter::rate(int $count, int $days, LocaleCode $l): string
DistanceFormatter::km(?float $metres): ?float
ListingTextBuilder::facts(Listing $listing, LocaleCode $l): list<array{key: string, label: string, value: string}>
```

## Business rules

- Kept: BR-API-069, BR-API-072, BR-API-073, BR-API-074, BR-API-150, BR-API-151, BR-DATA-030.
- Defect fix (`APPROVED`): LB-API-010 (unique `facts[].key`, closed key set on legacy routes), LB-API-029 (strings on
  legacy routes only).
- `PROPOSED`, behind config, tests `->todo()`: DEV-019 (one distance formatter), DEV-021 (one flow vocabulary),
  DEV-014 (Tashkent dates — the server already formats texts in Tashkent; the wire stays UTC `Z`).

## Acceptance criteria

- `isoUtc()` of any instant ends with `Z` and has no offset or fraction, whatever `APP_TIMEZONE` and process `TZ` are
  (`15` §3.10 #7, #11).
- A listing posted 18:30 UTC and viewed 19:30 UTC the same UTC day gets the "yesterday" wording (Tashkent day,
  `15` §3.10 #5).
- `facts()` never returns a duplicate key or a key outside the closed set; values are plain text.
- `title` contains ` · ` only as the separator the client splits on; `status_text` is `null` for active listings and
  the catalogue label otherwise.
- Catalogue parity (KV-BE-020 test) stays green with the new keys.

## Tests

- `TimeFormatterTest`: frozen clock at explicit UTC instants (KV-QA-006 time dataset): minutes/hours/yesterday/date
  boundaries around 19:00 UTC; ru plurals 1, 2, 5, 21; `isoUtc` under `TZ=Asia/Tashkent`; `rate()` legacy wording and
  `todo('DEV-021 PROPOSED')`.
- `DistanceFormatterTest`: `km()` rounding dataset (0, 49, 950, 1 499, 1 500, 12 345 m); `label()` dataset as
  `todo('DEV-019 PROPOSED')`.
- `ListingTextBuilderTest`: facts for rent apartment, daily room, sale land, commercial — keys unique, order fixed;
  status labels per status; market label + `market_code` `new`/`secondary`; HTML-looking district names returned
  literally.
- Enum safety: `market_code` and fact keys ⊆ KV-QA-007 keys.

## Edge cases

- Listings without `first_seen_at` (migrated stubs) → `age: null`.
- Clock skew: a posting time slightly in the future renders as "just now", never negative.
- `facts` for purged listings keep price, district, area facts only (BR-API-065); text-derived facts are absent.
- Uzbek Latin apostrophes in catalogue strings use `ʻ` consistently (copy defect fixes LB-BOT-010…012).

## Security

- Builders interpolate only dictionary names, numbers and catalogue literals; listing free text never enters `title`
  or `facts` values beyond normalised attributes (SEC-REQ-018 spirit, no markup).
- No PII: no phone, name or handle is formatted here (author labels are KV-BE-041).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature row in 09 updated, PR
reviewed by the other developer. Pint and PHPStan level 7 clean; the DEV flags are listed in the PR description and in
`09` for DEV-014, DEV-019, DEV-021.
