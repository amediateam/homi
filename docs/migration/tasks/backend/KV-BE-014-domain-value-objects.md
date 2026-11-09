# KV-BE-014 — Domain value objects and enums

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-LOCALE-001, F-LISTING-001, F-FILTER-001 |
| Dependencies | KV-DB-004 (public numbers and money ADR drafts agreed); decisions CF-003, CF-005, CF-006, CF-016 |

## Goal

The small, pure building blocks every module shares exist once, with exhaustive unit tests: the public listing
number, the locale code with its `uz_Latn` boundary mapping, integer USD money, and the closed enums of the legacy
contract mapped to HOMI's internal taxonomy (deal + rent period, property types, statuses, tones, reasons).

## Legacy reference

- Listing ids are positive JSON integers compared with `===` (`08` §1.8 `ListingPreview.id`; LB-API-011;
  `$KVADRO_ROOT/demo/app/src/lib/telegram/startParam.js:17-25` accepts only `^l_(\d+)`); BR-DATA-002.
- Wire codes `ru`, `uz_Latn`, `en`; currencies `USD`, `UZS`; themes `auto`, `light`, `dark` (BR-API-143, BR-DATA-015;
  `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:73`, `:124`); Telegram `language_code` mapping `uz*` → `uz_Latn`,
  `en*` → `en`, else `ru` (BR-API-149; `$KVADRO_ROOT/demo/app/src/lib/telegram/webApp.js:133-150`; DEV-020).
- Deals `rent_long`, `rent_daily`, `sale` and types per deal (BR-API-028; `08` §1.7); HOMI intake taxonomy
  `sale`/`rent`/`buy`/`rent_wanted` (`backend/config/intake.php:23-24`) and the `rent_period` decision (CF-016,
  `06` §4.3 item 3).
- Owner filter `any|no_agents|owners` (BR-API-035), sorts `cheap|expensive|deal|center|ppm` + default `new`
  (BR-API-024), listing tones `good|check|suspicious|same|mixed|no_repair` and map tones `good|high|check|suspicious`
  (BR-API-061), report reasons `rented|agent|wrong_data|fraud` (BR-API-101), nearby kinds `park|school`
  (BR-API-052, LB-API-010), access reasons `private|invite|full|blocked|join` (BR-API-011).
- Money: USD integer cents (CF-005 option A; `14` §4.1 "Money"; BR-DATA-008); `price_kind: "down_payment"`
  (BR-API-156).

## Implementation

1. Read `.claude/skills/php-best-practices/` and `.claude/skills/laravel-testing/`; read `10` §4.3–§4.4 for the
   layout and the KV-DB-004 ADR drafts for number and money rules.
2. Value objects with `php artisan make:class --no-interaction` (final readonly classes, explicit types, PHPDoc):
   - `App\Domain\Listings\ListingNumber` — `fromInt(int)`, `fromString(string)` (digits only, no sign, no leading `+`,
     1 ≤ n < 2^53), `value(): int`, `equals()`; throws `InvalidListingNumber`.
   - `App\Domain\Identity\LocaleCode` — internal `ru|uz|en`; `fromLegacy('uz_Latn')`, `toLegacy(): string`,
     `fromTelegram(?string $languageCode)` (`uz`, `uz-UZ`, `uz-Latn` → `uz`; `en*` → `en`; else `ru`, DEV-020),
     `intlTag()` (`uz-Latn-UZ`, matching `frontend/packages/utils/src/index.ts`).
   - `App\Domain\Pricing\UsdAmount` — integer cents; `fromDollars(int|float)` with `round(x * 100)`, `cents()`,
     `wholeDollars()` (legacy wire), no float equality anywhere.
3. Enums with `php artisan make:enum --no-interaction` (backed, TitleCase keys, `label()` only where a server string
   is needed later): `Listings\Deal` (Sale, Rent), `Listings\RentPeriod` (Long, Daily), `Listings\LegacyDeal`
   (RentLong `rent_long`, RentDaily `rent_daily`, Sale `sale`) with `toInternal(): array{Deal, ?RentPeriod}` and
   `fromInternal(Deal, ?RentPeriod)`, `Listings\PropertyType` (apartment, house, room, commercial, land) with
   `allowedFor(LegacyDeal): list<self>` (BR-API-028), `Listings\ListingStatus` (active, withdrawn, merged, taken_down,
   purged — final set confirmed by KV-DB-008), `Listings\OwnerStatus` (owner, agent, unknown), `Listings\PriceKind`
   (down_payment), `Listings\NearbyKind` (park, school), `Search\OwnerFilter`, `Search\Sort` (new, cheap, expensive,
   deal, center, ppm), `Pricing\MedianTone`, `Pricing\MapTone`, `Engagement\ReportReason`, `Access\AccessState`
   (Private, Invite, Full, Blocked, Join, Granted), `Identity\Theme` (auto, light, dark), `Identity\Currency` (USD, UZS).
4. A `legacyValues()` helper on each enum that is emitted on legacy routes returns exactly the closed set the legacy
   client dictionary knows (KV-QA-007 key list) — new cases added later never leak to legacy routes (LB-API-006).
5. Unit tests first (`php artisan make:test --pest --unit Domain/...`), then the code; Pint, PHPStan.

## Files

- `backend/app/Domain/Listings/ListingNumber.php`, `backend/app/Domain/Listings/InvalidListingNumber.php`
- `backend/app/Domain/Identity/LocaleCode.php`, `backend/app/Domain/Pricing/UsdAmount.php`
- `backend/app/Enums/{Listings,Search,Pricing,Engagement,Access,Identity}/*.php` (the enums of step 3)
- `backend/tests/Unit/Domain/{ListingNumberTest,LocaleCodeTest,UsdAmountTest}.php`
- `backend/tests/Unit/Enums/{LegacyDealTest,PropertyTypeTest,LegacyEnumSafetyTest}.php`

## API contract

Internal contracts only (no route):

```php
ListingNumber::fromString(string $raw): ListingNumber      // throws InvalidListingNumber
LocaleCode::fromLegacy(string $wire): LocaleCode            // 'ru' | 'uz_Latn' | 'en'; else InvalidArgumentException
LocaleCode::fromTelegram(?string $languageCode): LocaleCode // never throws
LocaleCode::toLegacy(): string                              // 'ru' | 'uz_Latn' | 'en'
LegacyDeal::toInternal(): array{0: Deal, 1: ?RentPeriod}
PropertyType::allowedFor(LegacyDeal $deal): list<PropertyType>
UsdAmount::wholeDollars(): int                              // legacy wire value (BR-API-154)
```

## Business rules

- Kept: BR-API-028, BR-API-061, BR-API-101, BR-API-143, BR-API-149, BR-API-156, BR-DATA-002, BR-DATA-015, BR-DATA-008.
- DEV-020 (`PROPOSED`): one language detector — `fromTelegram()` implements it; until approved, its tests for codes the
  legacy boot script maps differently are `->todo('DEV-020 PROPOSED')`.
- Defect fixes (`APPROVED`): LB-API-048 / LB-DATA-014 (`uz` inside, `uz_Latn` only at the boundary), LB-API-011
  (numbers stay integers), LB-API-006 (closed output sets).

## Acceptance criteria

- `LocaleCode::fromLegacy('uz_Latn')->toLegacy() === 'uz_Latn'` and the internal value is `uz`; `uz-Latn`, `uz` on the
  legacy wire are rejected by `fromLegacy()` (the request layer turns that into `422`, `15` §3.12 #2).
- `ListingNumber` rejects `0`, `-1`, `1.5`, `"12a"`, `"+12"`, `2^53` and accepts `1` and `2^53 − 1`.
- Every `LegacyDeal` round-trips through `toInternal()`/`fromInternal()`; `PropertyType::allowedFor()` returns exactly
  the BR-API-028 sets.
- Every enum emitted on legacy routes has `legacyValues()` equal to the KV-QA-007 key list for its field.
- No float comparison in any money code; PHPStan level 7 clean.

## Tests

- `ListingNumberTest`: dataset of valid/invalid raw values above; `equals()`.
- `LocaleCodeTest`: `fromTelegram` dataset `uz`, `uz-UZ`, `uz-Latn`, `en`, `en-GB`, `kk`, `ru`, `''`, `null` → `uz`,
  `uz`, `uz`, `en`, `en`, `ru`, `ru`, `ru`, `ru` (`15` §3.2 #11; rows differing from the legacy boot script are
  `todo('DEV-020 PROPOSED')`); `fromLegacy`/`toLegacy` round trip; `intlTag()`.
- `UsdAmountTest`: `fromDollars(1200)` → 120000 cents; `fromDollars(0.005)` rounding; `wholeDollars()` of 99 cents.
- `LegacyDealTest`: round trip for three deals; `Deal::Rent` without period rejected by `fromInternal()`.
- `PropertyTypeTest`: BR-API-028 dataset per deal.
- `LegacyEnumSafetyTest`: each legacy-emitted enum ⊆ `legacy-i18n-keys.json` (KV-QA-007; `todo` until that file exists).

## Edge cases

- Telegram `language_code` absent (bots, some clients) → `ru`.
- Listing numbers above 2^53 cannot be represented by the legacy JSON client — rejected, never truncated.
- A future HOMI property type (e.g. `garage`) must not appear on legacy routes: `legacyValues()` excludes it.
- Demand deals (`buy`, `rent_wanted`) exist in intake only (CF-016) and have no `LegacyDeal` mapping.

## Security

- `ListingNumber` is the first line of SEC-REQ-017 ("positive integer ids below 2^53") for every path parameter.
- No PII in these objects; `LocaleCode` stores only the mapped locale, never the raw `language_code` (SEC-REQ-036).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature row in 09 updated, PR
reviewed by the other developer. Pint (`vendor/bin/pint --dirty --format agent`) and `composer types:check` clean; the
enum list is copied into the KV-QA-007 enum-safety dataset in the same PR.
