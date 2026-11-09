# KV-FE-017 — Money and number formatting

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-1 (M9, stage S4; numbers reused by the landing for S2) |
| Feature IDs | F-FILTER-006, F-SETTINGS-004, F-LOCALE-002 |
| Dependencies | KV-FE-015 (locales, `money.*` keys); KV-QA-006 (shared money fixture `backend/tests/Fixtures/Shared/money-cases.json`); fixes LB-APP-011; DEV-006 `PROPOSED` (radar bounds in the entered currency — server side, client keeps the display rule) |

## Goal

The client-side money and number rules of the legacy Mini App live once, in `@homi/utils`, and produce exactly the
strings of the shared KV-QA-006 fixture that the server formatter (KV-BE-020) also passes: USD as `$N`, UZS in сум /
млн сум / млрд сум, price inputs in USD or millions of сум, preset chips, and the counted-noun helper — with the
1 mln boundary and the input parsing fixed (LB-APP-011).

## Legacy reference

- `$KVADRO_ROOT/demo/app/src/lib/money.js` (`03` §3.5): prices stored and sent in USD; `setCurrency(code, rate)`; UZS
  only when the currency is `UZS` **and** the rate > 0 (`:14-23`); USD `$` + `Intl.NumberFormat(numberLocale)` of the
  rounded integer (`:57`); UZS ≥ 1 000 000 000 → `money.bln` «{value} млрд сум» (1 decimal), ≥ 1 000 000 →
  `money.mln` «{value} млн сум» (1 decimal), else rounded to thousands `money.uzs` «{amount} сум» (`:32-46`);
  `priceUnitLabel` `money.unitMln` «млн сум» or `$`; `toPriceInput` (UZS millions with 1 decimal); `parsePriceInput`
  (first `,` → `.`, strip non-digits, `Number`, 0/empty/NaN → `null`, UZS → `max(1, round(v·10⁶ / rate))`, `:76-101`);
  `pricePresets(deal, usdPresets, convertUsd)` with steps 50 млн (sale), 0.1 млн (daily), 0.5 млн (otherwise) and the
  fixed UZS lists rent 3, 4, 5, 6, 8, 10, 15; daily 0.3, 0.5, 0.7, 1, 1.5; sale 500, 700, 1000, 1500, 2000, 3000
  (`:104-140`).
- Counted nouns: `$KVADRO_ROOT/demo/app/src/lib/format.js` `formatListingsCount` («1 234 объявления»).
- Rules: BR-APP-014 (preset chips), BR-APP-015 (UZS presets), BR-APP-060 (client price display); BR-API-031 (UZS input
  conversion), BR-API-153 (UZS is display only), BR-API-155 (preset rounding).
- Defect LB-APP-011: 999 500 … 999 999 сум render as «1 000 000 сум» (rounding after the unit choice);
  `parsePriceInput("1.000.000")` returns `null`.
- Test matrix: `15` §3.11 cases #1–#12 and #16, captured by KV-QA-006 (`money-cases.json`, fields `id`, `input`,
  `legacy_output`, `expected_output`, `rule`).

## Implementation

1. Add `frontend/packages/utils/src/money-legacy.ts` (exported as `@homi/utils/money-legacy`); keep the existing v1
   `formatPrice(amountMinor, currency, locale)` untouched (different contract, ADR-0006).
2. `createMoney({locale, currency, usdUzs})` returns `isUzs`, `formatPrice(usd)`, `priceUnitLabel()`,
   `toPriceInput(usd)`, `parsePriceInput(text)`, `pricePresets(deal, usdPresets, convertUsd)`; texts come from
   `@homi/i18n` (`money.uzs`, `money.mln`, `money.bln`, `money.unitMln`).
3. Number locale from `@homi/i18n.numberLocale` (`ru-RU` for ru and uz, `en-GB` for en — legacy; note that
   `@homi/utils.intlLocale` maps en to `en-US`, which must not be used for legacy displays).
4. LB-APP-011 fix (`APPROVED`, always on): round to the display precision first (thousands below 1 mln, 0.1 mln, 0.1
   млрд), then choose the unit — 999 500 сум → «1 млн сум»; 999 950 000 сум → «1 млрд сум». Parsing: strip spaces
   (incl. NBSP and narrow NBSP), treat a single `,` or `.` followed by 1–2 digits as the decimal mark, treat repeated
   separators as thousands separators (`1.000.000` → 1 000 000, `85 000` → 85 000, `1,2` → 1.2).
5. `formatCount(n, pluralKey)` → `${n.toLocaleString(numberLocale)} ${plural(key, n)}`.
6. `formatKm(km)` and `formatInt(n)` live in KV-FE-018; this task only exposes `formatNumber` (rounded integer) and
   `formatDecimal` (max 1 fraction digit).
7. Fixture-driven tests read `backend/tests/Fixtures/Shared/money-cases.json` through `@homi/testing`
   (`fixture('money')`, KV-FE-010) and assert `expected_output` for rows with `rule` = `legacy` or `fix:LB-APP-011`;
   rows with `DEV-…:PROPOSED` become `todo`.
8. Separator code points: assert the exact characters Node 26 `Intl` produces (`ru-RU` uses U+00A0 / U+202F per ICU
   version) — read them from the fixture, never hard-code.

## States and texts

| Input | Output (ru) | Key |
| ----- | ----------- | --- |
| USD 1 200, currency USD | `$1 200` (en: `$1,200`) | — |
| 850 400 сум | «850 000 сум» | `money.uzs` «{amount} сум» |
| 999 499 сум | «999 000 сум» | `money.uzs` |
| 999 500 … 999 999 сум | «1 млн сум» (legacy «1 000 000 сум», LB-APP-011) | `money.mln` «{value} млн сум» |
| 1 500 000 000 сум | «1,5 млрд сум» | `money.bln` «{value} млрд сум» |
| price input unit | «млн сум» or `$` | `money.unitMln` |
| `UZS` with `usd_uzs` 0 or missing | USD display | — |

## Interaction

n/a (library). Input fields (KV-FE-052) call `parsePriceInput` on blur and on «Показать».

## Telegram integration

n/a.

## Storage and analytics

n/a. Currency and rate come from `meta.currency` and `meta.usd_uzs` (API-001) via the bootstrap.

## Files

- `frontend/packages/utils/src/money-legacy.ts`, `src/number.ts` (new); `package.json` exports
- `frontend/packages/utils/tests/money-legacy.test.ts` (after KV-FE-010)

## API contract

Consumes API-001 `currency` (`USD|UZS`), `usd_uzs` (number), `price_presets` (USD per deal) and API-002
`presets` / `typical` (USD per deal). Never formats server strings (`price`, `age`, map `label` are rendered as sent).

## Business rules

- Kept: BR-APP-014, BR-APP-015, BR-APP-060; BR-API-031 (`max(1, round(v·10⁶/rate))`), BR-API-153, BR-API-155.
- LB-APP-011 fix `APPROVED` (policy).
- DEV-006 `PROPOSED` concerns stored radar bounds (server); the client display rule is unchanged.

## Acceptance criteria

- Every `15` §3.11 case #1–#12 and #16 in `money-cases.json` passes with `expected_output` (or is `todo` for a
  `PROPOSED` DEV row).
- `parsePriceInput('1.000.000')` = 1 000 000 USD in USD mode; `parsePriceInput('1,2')` at rate 12 650 in UZS mode =
  95 USD; `parsePriceInput('0,001')` = 1 USD; `'0'`, `''`, `'abc'` → `null`.
- UZS presets from city USD presets round to the step and drop duplicates; without city presets the fixed lists apply.
- The same fixture passes in the backend formatter (KV-BE-020): no drift between server strings and client strings.

## Tests

Fixture-driven table tests (all money rows); property test: `formatPrice(parsePriceInput(toPriceInput(x)))` stable for
round values; `TZ`-independent; locales ru, uz, en.

## Edge cases

- Very large sale prices (> $5 M): formatted without overflow (млрд path).
- Negative or NaN input: `formatPrice` returns an empty string and reports once (never `$NaN`, a legacy symptom in the
  market scale, `08` §1.8).
- Rate changes mid-session (meta re-fetch after a currency switch, KV-FE-083): a new `createMoney` instance; no stale
  closure.

## Security

n/a (no user data). Outputs are plain strings.

## Definition of done

`make ci-frontend` green; fixture tests green (after KV-FE-010); KV-BE-020 runs the same fixture; PR reviewed by the
other developer.
