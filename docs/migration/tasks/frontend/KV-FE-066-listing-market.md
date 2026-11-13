# KV-FE-066 — Listing: market block and «Откуда эта цифра»

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-LISTING-004 |
| Dependencies | KV-FE-063, KV-FE-013, KV-FE-017; decisions: Q-APP-007, Q-API-021 (tone thresholds, server side) |

## Goal

The «Сравнение с …» block shows the server verdict, a scale with the listing's price against the usual price, the
sample context and the warnings; the ⓘ button opens the «Откуда эта цифра» sheet (SCR-022) that explains the sample,
the median and the conclusion in plain words and links to the methodology page. No value or tone from the server can
crash the screen (LB-APP-015, LB-APP-039 fixed).

## Legacy reference

- Screens: SCR-018 market block, SCR-022 (`03` §2).
- Code: `$KVADRO_ROOT/demo/app/src/features/listing/sections/MarketBlock.jsx:13-179` (title by scope, verdict, scale,
  context line, warnings, first-show animation, `scalePosition`), `MarketSheet.jsx:14-221` (sample, half, own price,
  conclusion by tone, «обновлено», methodology URLs), `format.js` `marketVerdict` (verdict texts per tone),
  `marketDeltaShort`.
- Rules: BR-APP-027 (verdict wording), BR-APP-028 (when the block shows; scale ±40 %, clamp 4–96 %), BR-API-057…
  BR-API-060 (how the server computes medians and tones), BR-API-151 (`median_updated` ISO with `Z`).
- Defects: LB-APP-015 (`market.v3.rooms${n}` throws for 0 or fractions), LB-APP-039 (unknown tone reads as
  "pricier") — both `APPROVED` fixes; Q-APP-007 (which `median_rooms` values exist).
- Visual baseline (KV-QA-019): `listing-market` → `SCR-022-*.png`; the block itself in `listing-open`.

## Implementation

1. `frontend/app/app/(miniapp)/features/listing/market/verdict.ts`: `marketVerdict({median_delta, median_tone})` as
   legacy for `check` (sign decides `fmt.marketCheck` / `fmt.marketCheckHigh`), `suspicious`, `same`, `mixed`,
   `no_repair`, `good`, and «pricier» / «В {x} раза» (`delta ≥ 0.9`) **only for a known dearer tone with a positive
   delta**; an unknown tone renders neutrally by sign (LB-APP-039): positive → `fmt.marketPricier`, negative →
   `fmt.marketCheaper` without the `good` colour, zero → `fmt.marketSame`; tone class `neutral`. Short labels: `−N%`,
   `+N%`, `fmt.marketSameShort`, `fmt.marketMixedShort`; `marketDeltaShort` wraps in `listing.marketDelta` except for
   `same` / `mixed` (shared with KV-FE-047 cards and KV-FE-068 CTA).
2. `market/MarketBlock.tsx`: render only when the verdict exists and `median` is truthy and `median_value`,
   `median_delta` are non-null (BR-APP-028). Title by `median_scope`: `near` → `market.titleNear`, `city` →
   `market.titleCity`, else `market.title`. Own value `median_own ?? (median_metric === 'm2' ? price_per_m2 :
   price_usd)`; no marker when it is `null` (never `$NaN`). Unit: `m2` + `median_reason` → `unit.m2Month`, `m2` →
   `unit.m2`, else `unit.month`. Scale position `clamp(4, 96, 50 + delta / 0.4 · 50)` %.
3. Context line (`marketContext`): `person` → `market.ctxPerson`; `near` → `market.ctxNear` / `market.ctxNearSale`;
   `m2` with reason → `market.ctxM2`; `city` → `market.ctxCity` / `market.ctxCitySale`; else `market.ctxDistrict` /
   `market.ctxDistrictSale`; params `n`, `rooms` (`''`, `1`…`3`, `4+`), `cls` (`market.clsJk` / `market.clsHouse`),
   `km` (one decimal, KV-FE-018), `district`; for `mixed` with `median_place_value` append `market.ctxPlace`.
4. Warnings: `suspicious` → `market.noteSuspicious`; `check` with `median_note` → the server note as text.
5. First-show animation: per session and listing id (module-level set), the marker starts at 50 % and moves to its
   position after two animation frames; the verdict fades in (`.in`). Reduced motion: no transition.
6. `market/MarketSheet.tsx` on the sheet primitive of KV-FE-013 (portal, drag-to-close, backdrop, Back handler; no ×,
   as legacy). Paragraphs: sample (`near` → plural `market.v3.found` with `alike` = rooms phrase, class phrase
   `market.v3.jk` / `market.v3.house`, `market.v3.within` with the radius label `market.v3.m` (≥ 100 m, step 100) or
   `market.v3.km`; else plural `market.v3.district` / `market.v3.city` with `place`); median (`market.v3.half` /
   `market.v3.halfM2`, values via `market.v3.perM2` / `market.v3.perM2Month` for m²); own price and conclusion by tone
   (`market.v3.own` / `market.v3.ownM2` + `market.v3.mixed` / `suspicious` / `check` (+ `median_note`) / `same` /
   `noRepair` / `pricier` / `cheaper` with `market.v3.times` from +90 % or `market.v3.pct`).
7. Rooms phrase as a total function (LB-APP-015): `1`…`3` → `market.v3.rooms1…3`, `≥ 4` → `market.v3.rooms4`, `0` →
   new key `market.v3.rooms0` «тоже студии», any other number (fraction, negative) → new key `market.v3.roomsN`
   «тоже {n}-комн.» with `n` rounded; `null` → omitted. Unknown values are reported once per session through the non-fatal
   reporter of KV-FE-034 (no PII; the event kind is defined there and must be on the server allowlist, SEC-REQ-022).
8. Footer: `market.v3.asking` · `market.v3.updated` (`ago`: < 2 min `market.info.agoNow`, < 60 min plural
   `market.info.agoMin`, < 48 h plural `market.info.agoHour`, else plural `market.info.agoDay`; omitted when
   `median_updated` is missing or invalid) · `market.info.more` → methodology page per locale: ru
   `/arenda/metodika/`, uz `/uz/ijara/metodika/`, en `/en/rent/methodology/` on the landing origin from config
   (`NEXT_PUBLIC_SITE_URL`, `https://kvadro.app` until S6), opened with `openLink` (external browser).
9. Animated demo scale in the sheet: the dot slides to `--to` (`scalePosition − 50` %) over 1 s, the tag fades in;
   none under reduced motion.

## States and texts

| State | Rendering and keys |
| ----- | ------------------ |
| hidden | no verdict, `median` falsy, or `median_value` / `median_delta` `null` |
| block, district | `market.title` «Сравнение с районом», labels `market.cheaper` «дешевле», `market.median` «обычно {value}{unit}», `market.pricier` «дороже», aria `market.how` «Откуда эта цифра» |
| block, near / city | `market.titleNear` «Сравнение с похожими рядом» / `market.titleCity` «Сравнение с городом» |
| verdict texts | `fmt.marketCheaper` «На {pct}% дешевле рынка», `fmt.marketPricier` «На {pct}% дороже рынка», `fmt.marketTimes` «В {x} раза дороже рынка», `fmt.marketSame` «На уровне обычной цены», `fmt.marketMixed` «Дешевле соседних на {pct}%, но дороже района», `fmt.marketNoRepair` «Дешевле соседей на {pct}% — без ремонта», `fmt.marketSuspicious` «Подозрительно дёшево: на {pct}% ниже рынка», `fmt.marketCheck` / `fmt.marketCheckHigh` «Проверьте цену: на {pct}% ниже / выше рынка» |
| warning | `market.noteSuspicious` «Цена намного ниже обычной для таких квартир — так часто выглядят приманки. …» |
| no own value | scale without the marker |
| sheet, loaded | title `market.how`; three paragraphs; footer `market.v3.asking` «Цены из объявлений — после торга бывает дешевле» · `market.v3.updated` «обновлено {ago}» · `market.info.more` «Подробнее» |
| sheet, unknown rooms | new keys (not in legacy) `market.v3.rooms0` «тоже студии», `market.v3.roomsN` «тоже {n}-комн.»; uz/en to be translated, product owner review |

## Interaction

- ⓘ tap: light haptic, opens the sheet. Sheet closes on backdrop tap, drag down (start 6 px, close at 25 % height or
  0.5 px/ms, settle 200 ms) or Telegram Back; it has no × button.
- Header shadow when the sheet body is scrolled (`useScrolled` equivalent).
- Sheet z-index 50 over the listing layer; full width up to 608 px; safe-area bottom padding.

## Telegram integration

TMA-022 (Back closes the sheet first), TMA-028 (`openLink` for the methodology page, external browser), TMA-025.

## Storage and analytics

- Storage: none (the first-show set is memory only).
- Analytics: none in legacy (LB-APP-037 left the sheet untracked); `$pageview` for the sheet is added only if
  KV-FE-035 adopts layer tracking with a new screen name.

## Files

- `frontend/app/app/(miniapp)/features/listing/market/{verdict.ts,MarketBlock.tsx,MarketSheet.tsx,marketText.ts}` (new)
- `frontend/packages/i18n/src/catalogues/*` (new keys `market.v3.rooms0`, `market.v3.roomsN`)
- Tests: `frontend/app/tests/listing/{verdict,marketText,MarketBlock,MarketSheet}.test.tsx`

## API contract

API-008 fields (`08` §1.8): `median`, `median_value!`, `median_delta!`, `median_tone`, `median_own`, `median_n`,
`median_metric` (`m2`, `person`, other = month), `median_reason`, `median_scope` (`near`, `city`, other = district),
`median_rooms`, `median_near_class`, `median_radius_km`, `median_district`, `median_place_value`, `median_note`,
`median_updated`, `price_usd`, `price_per_m2`, `deal_type`. The block also works from a preview (`median_delta`,
`median_tone` only → hidden until details arrive when `median_value` is missing). No request.

## Business rules

- Kept: BR-APP-027, BR-APP-028, BR-API-057…BR-API-060 (server meaning of tones and scopes), BR-API-151.
- LB fixes `APPROVED` (policy): LB-APP-015 (total rooms mapping), LB-APP-039 (unknown tone neutral by sign).

## Acceptance criteria

- For every tone of the fixture set (`good`, `check` ±, `suspicious`, `same`, `mixed`, `no_repair`, `high`, an unknown
  `foo` with +0.2 and −0.2) the block and the sheet render the texts above and never throw.
- `median_rooms` 0, 2.5, 4, 7, `null` open the sheet without error; 0 reads «тоже студии».
- The marker sits at 4 % for −0.6, 50 % for 0, 75 % for +0.2, 96 % for +0.5; no marker and no «$NaN» without an own value.
- «обновлено» shows «только что» for 1 min, «5 минут назад», «3 часа назад», «2 дня назад» for 49 h.
- «Подробнее» opens the methodology page of the current locale.
- Visual: side by side with the `listing-market` baseline (sheet open) and the market block in `listing-open`.

## Tests

- Unit `verdict.test.ts`: tone × sign table; `≥ 0.9` times wording; short labels; unknown tone.
- Unit `marketText.test.ts`: context-line branches (person, near rent / sale, m² reason, city rent / sale, district);
  `ctxPlace` for `mixed`; rooms phrase dataset; radius label 0.05 / 0.34 / 1.26 km; ago thresholds with a frozen clock.
- Component `MarketBlock.test.tsx`: visibility rules; first-show animation only once per id; reduced motion.
- Component `MarketSheet.test.tsx`: each conclusion branch; methodology URL per locale.

## Edge cases

- `median_updated` in the future (clock skew): `Math.max(0, …)` → «только что».
- `median_n` `null` → 0 in the plural.
- Preview-only item with `median_delta` but no `median_value`: block hidden, appears when details arrive without a
  layout jump of the sections below (reserve no space; legacy behaviour).
- `median_note` long: wraps; rendered as text.

## Security

- SEC-REQ-021: `median_note`, `median_district` and all server strings rendered as text.
- SEC-REQ-019: the methodology URL comes from configuration, not from the API.

## Definition of done

`make ci-frontend` green; tests above green (or added when KV-FE-010 lands); visual review of `SCR-022` and the market
block recorded in the PR; parity gate G4 for F-LISTING-004 ticked (`15` §4); the feature row in `09` updated; PR reviewed
by the other developer.
