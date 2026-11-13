# KV-BE-020 — Server display catalogues and the money/price formatter

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | L |
| Feature IDs | F-LOCALE-003, F-FILTER-006, F-SETTINGS-004 |
| Dependencies | KV-BE-014, KV-BE-019; KV-QA-006 (shared money fixture); decision CF-017; question Q-API-022 |

## Goal

The backend owns one display formatter for money (CF-017 option A): `backend/lang/{ru,uz,en}` catalogues with
identical keys and plural forms, a money formatter that renders USD and сум amounts per locale with the legacy unit
rules (fixed so that rounding happens before the unit is chosen), and the pre-formatted `price` string of the legacy
`ListingPreview` — shared later by the bot cards (M5) and checked against the same fixture as `@homi/utils`.

## Legacy reference

- `price` is a string in the user's currency and locale; parts separated by ` · `; `(…)` inside part 1 is an
  explanation; the text from the first `/` is the period (`/мес`) (BR-API-071; `$KVADRO_ROOT/docs/api.md:268-272`;
  `$KVADRO_ROOT/docs/about.md:156`, `:343`); `price_kind: "down_payment"` (BR-API-156; mock
  `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:77`).
- Client money rules (the oracle for unit boundaries and grouping): `$KVADRO_ROOT/demo/app/src/lib/money.js:32-46`,
  `:76-101`, `:103-140`; the 1-million UZS boundary defect (`$KVADRO_ROOT/docs/about.md` §10; LB-APP-011 → defect fix).
- Display strings come localised from the server; the client has no dictionary for them (BR-API-074, BR-API-146;
  LB-API-029 — the legacy serializer keeps producing strings, v1 returns raw values).
- Exact formats per locale × currency are unknown (Q-API-022); cases of `15` §3.11 (#1–#6, #16) and §3.12 (#3, #4, #6, #7).
- Number grouping: one locale-aware formatter (C-13, LB-SEO-001 defect fix); EN `18,662`, RU `18 657` (`04` §7).

## Implementation

1. Read `.claude/skills/laravel-best-practices/` (localisation), `15` §3.11–§3.12, ADR-0006 and the KV-QA-006 fixture
   format.
2. Create `backend/lang` with `php artisan lang:publish --no-interaction` (framework `en` files stay as published),
   then add `money.php`, `listing.php`, `time.php` for `ru`, `uz` (Latin script) and `en`; only keys this task and
   KV-BE-021 need; plural forms in Laravel `trans_choice` syntax (ru three forms, uz one, en two).
3. `php artisan make:class --no-interaction Services/Display/MoneyFormatter`:
   - `usd(UsdAmount, LocaleCode)` → `$1 200` (ru/uz, the grouping code point fixed by the fixture) / `$1,200` (en);
   - `uzs(int $sum, LocaleCode, Deal, ?RentPeriod)` → below 1 mln rounded to thousands (`850 000 сум`); ≥ 1 mln in
     millions with the fixture's decimal format; ≥ 1 mlrd for sale in milliards; **round first, then choose the unit**
     (LB-APP-011 fix: 999 500 → the 1 mln unit, not `1 000 000 сум`);
   - `short(UsdAmount, Currency, LocaleCode)` for map labels — digits, separators and the fixed currency/unit tokens
     only (SEC-REQ-018; used by KV-BE-033);
   - conversion USD → сум with `RateService::latest()` (display conversion, BR-API-153); missing or zero rate → USD
     output (`15` §3.11 #11).
4. `php artisan make:class --no-interaction Services/Display/PriceStringFormatter` — `forListing(Listing, LocaleCode,
   Currency): ?string`: amount part, `(…)` explanation for `down_payment` and per-m² bases, period suffix per deal and
   `price_basis` (`/мес`, `/сутки`, none for sale), qualifiers joined with ` · `; `null` when the listing has no price.
   Every literal comes from the catalogues.
5. A `Translator` fallback hook: a missing key falls back to `ru` and logs one warning per key per process, never a
   `500` (`15` §3.12 #4).
6. Load the shared money fixture (KV-QA-006) as a Pest dataset; expected strings are the fixture values, which stay
   `spec-tested` until Q-API-022 is answered by the approved recording (`15` §1.6) or the dump.

## Files

- `backend/lang/{ru,uz,en}/{money,listing,time}.php` (new; `time.php` keys added by KV-BE-021)
- `backend/app/Services/Display/{MoneyFormatter,PriceStringFormatter}.php`
- `backend/app/Providers/AppServiceProvider.php` (missing-key handler registration)
- `backend/tests/Unit/Display/{MoneyFormatterTest,PriceStringFormatterTest}.php`
- `backend/tests/Feature/Display/LangCatalogueParityTest.php`

## API contract

Feeds the `price: string|null` field of `ListingPreview` / `ListingDetails` (`08` §1.8) and later bot texts. Internal:

```php
MoneyFormatter::usd(UsdAmount $amount, LocaleCode $locale): string
MoneyFormatter::uzs(int $sum, LocaleCode $locale, Deal $deal, ?RentPeriod $period = null): string
MoneyFormatter::short(UsdAmount $amount, Currency $currency, LocaleCode $locale): string   // map label alphabet only
PriceStringFormatter::forListing(Listing $listing, LocaleCode $locale, Currency $currency): ?string
```

All other money values on legacy routes stay USD numbers (BR-API-154, BR-DATA-038) and are **not** formatted here.

## Business rules

- Kept: BR-API-071, BR-API-074, BR-API-146, BR-API-153, BR-API-154, BR-API-156, BR-DATA-038.
- Defect fixes (`APPROVED`): LB-APP-011 (round first, then unit — server strings), LB-SEO-001 / C-13 (one locale-aware
  number formatter), LB-API-029 (strings only on legacy routes).
- No DEV applies; a later change of the visible text beyond these fixes would be a DEV candidate (`10` §3.17).

## Acceptance criteria

- The KV-QA-006 money dataset passes for ru, uz, en × USD, UZS (`15` §3.11 #1–#6): `$1 200` / `$1,200`, `850 000 сум`,
  `999 000 сум`, 999 500 … 999 999 сум in the 1 mln unit, 999 950 000 сум in the млрд unit.
- `price` strings follow the part grammar of BR-API-071 so the legacy client's splitting (first ` · `, `(…)`, first `/`)
  yields the intended pieces for every fixture listing (rent long, rent daily, sale, down payment).
- `ru`, `uz`, `en` catalogues have the same key set, no empty values, the same placeholders and complete plural forms.
- A missing key renders the `ru` text and logs once; no exception reaches the response.
- No server string contains `<`, `>` or an HTML entity.

## Tests

- `MoneyFormatterTest`: KV-QA-006 dataset; USD with and without cents; zero/missing rate → USD; `short()` output
  matches `^[0-9 ,.$]+( (тыс|млн|млрд|ming|mln|mlrd|k|M|B))?$`-style allow-list from the fixture (exact pattern fixed
  there) for hostile inputs.
- `PriceStringFormatterTest`: per deal × basis × locale × currency golden strings (spec-tested, named `…spec`);
  `down_payment` explanation; no price → `null`; splitting test that reproduces the client parsing rules.
- `LangCatalogueParityTest`: key sets, placeholders, plural forms for 1, 2, 5, 11, 12, 14, 21, 22, 25, 101, 111 in ru
  (`15` §3.12 #6); runtime fallback test.
- Shared-fixture check: the same fixture file is referenced by `@homi/utils` tests after T8 (note only; frontend side
  not in scope).

## Edge cases

- `PUT /api/settings {"currency":"UZS"}` then `GET /api/feed` switches `price` to сум in the user's locale (`15` §3.11
  #16) — the formatter takes currency and locale per call, never from global state.
- Listings priced per person or per m² (`price_basis`) keep their basis in the explanation, never silently converted.
- Negotiable price (no amount) → `price: null`; the map uses `priced: false` (KV-BE-033).
- Very large sale prices (> $5 M) are formatted, not clamped; statistics exclusions are not a display rule.

## Security

- Output is plain text built only from catalogue literals and numbers (SEC-REQ-018 for labels; no listing text inside
  money strings).
- No PII; the formatter reads no user data except the chosen locale and currency.

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature row in 09 updated, PR
reviewed by the other developer. Pint and PHPStan level 7 clean; the catalogue location and the fallback rule are
added to `docs/architecture/overview.md` (Localization) in the same PR; ADR-0006's "no server round-trip for UI copy"
exception is referenced from the compatibility ADR (KV-BE-001).
