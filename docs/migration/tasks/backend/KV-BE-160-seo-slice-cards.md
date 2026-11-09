# KV-BE-160 — SEO slice cards: sorts, badges, signed photos, deep links

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-SEO-007, F-SEO-010 |
| Dependencies | KV-BE-157 (slice keys and predicates), KV-BE-026 (`SignedPhotoUrl`), KV-BE-140 (`listing_market`); KV-BE-020, KV-BE-021 (display formatter); Q-SEO-016, Q-SEO-007 |

## Goal

Each SEO slice gets up to 24 listing cards per sort (`new`, `cheap`, `expensive`, `below`) with the legacy card
content — price, parameters, place, age, «Хозяин» and «на N% дешевле рынка» badges, a signed photo and the Mini App
deep link `startapp=l_<id>-seo-<channel>-<post>` — and never a phone, the listing text or an address.

## Legacy reference

- LND-056 (card markup and sorting), LND-060 (photos), LND-062 (links into the bot and Mini App) in `03b` lines
  982-1054; `$KVADRO_ROOT/docs/seo-pages.md:210-238`, `:347-371`, `:379-390`.
- Rules: BR-SEO-014 (badge: «на N% дешевле рынка», under 10 % «на уровне обычной цены», mixed rule, owner badge
  `b-owner`; a card may carry both or neither), BR-SEO-022 (up to 24 cards, default «Сначала новые»,
  `?sort=cheap|expensive|below#cards`, formats per locale, no phone/text/address), BR-SEO-023 (USD only),
  BR-SEO-026 (`startapp=l_<id>-seo-<channel>-<post>`, parser rules, 64-character limit for 32-character channel
  names), BR-SEO-028 (signed `/media/<id>/<n>.jpg?e=&s=`, `.s.jpg` same signature), BR-SEO-038.
- Defects: LB-SEO-001 (number formatting per locale), LB-SEO-006 (uniform `404` for bad signatures — KV-BE-027).
- Open: Q-SEO-016 (sort definitions and tie-breaks), Q-SEO-007 (legacy-signed URLs in already-rendered pages).

## Implementation

1. Read the KV-BE-026 task (`SignedPhotoUrl::forPhoto`), the KV-BE-020 / KV-BE-021 tasks (formatter catalogues) and
   `.claude/skills/laravel-database-optimization/` (keyset queries, partial indexes).
2. `php artisan make:class Services/PublicData/SeoCardService --no-interaction`: `cards(SliceKey $key, string $lang,
   SeoSort $sort, CarbonImmutable $now): list<SeoCard>` — active listings of the slice predicate (the same predicate
   the aggregator counts), excluding taken-down listings and opted-out channels (BR-DATA-022), limit 24:
   - `new`: `first_seen_at desc, number desc`; `cheap`: `price_usd_cents asc, number desc`; `expensive`:
     `price_usd_cents desc, number desc`; `below`: `median_delta asc nulls last, number desc` (spec until Q-SEO-016).
   - Card fields: `number`, `price` (rent «$700/мес» / «/oy» / «/mo»; sale «$76 500 · $1 429/м²» — strings from the
     formatter with the locale's grouping, LB-SEO-001), `params` («3-комн. · 68 м² · 4/4 эт.» and the documented
     shorter forms; uz «2 xonali · 60 m² · 9/10 qavat»; en «2 rm · 60 m² · floor 9/10»), `place` (quarter, landmark
     or ЖК name, optional), `age` («14 мин назад», «3 ч назад», «4 дн. назад» and uz/en forms; Tashkent days per
     KV-BE-021), `badges` (`owner` when `is_owner`; `below_market` with the rounded percent when `median_tone = good`
     and `median_delta ≤ −0.10`; `same` → no badge; `mixed` → no badge — BR-SEO-014), `photo` =
     `SignedPhotoUrl::forPhoto(number, 0, now)` (absent when the listing has no photo), `link` =
     `https://t.me/<bot>?startapp=l_<number>-seo-<channel>-<post>` from the listing's primary publication.
   - Deep-link length guard: the `startapp` value must be ≤ 64 characters; when the channel handle and post id make it
     longer, fall back to `l_<number>-seo` (the parser still reads id and source, BR-SEO-026).
   - Never selected or emitted: phone, `original_text`, summary, address, contact URL.
3. `php artisan make:enum Enums/PublicData/SeoSort --no-interaction` (`New`, `Cheap`, `Expensive`, `Below`).
4. Card id lists per sort are part of the slice `content_hash` (KV-BE-157) so `lastmod` follows visible changes; the
   card payload itself is computed on request and cached per (`snapshot_id`, key, lang, sort) for at most 5 minutes so
   photo signatures stay inside their 24–48 h window.
5. Index check: the slice predicates use the partial indexes of KV-DB-008 (`status = 'active'`); EXPLAIN plans pasted
   in the PR for the four sorts on the coverage dataset.

## Files

- `backend/app/Services/PublicData/SeoCardService.php`, `backend/app/Domain/PublicData/SeoCard.php`,
  `backend/app/Enums/PublicData/SeoSort.php` (new)
- `backend/lang/{ru,uz,en}/seo.php` (card strings, if not already in the formatter catalogues)
- `backend/tests/Feature/PublicData/SeoCardServiceTest.php` (new)

## API contract

Served inside `GET /api/v1/public/seo/slices/{key}?sort=` (KV-BE-159): `cards[{number, price, params, place|null,
age, badges[{kind: owner|below_market, pct?}], photo|null, link}]` (≤ 24).

## Business rules

- Kept: BR-SEO-014, BR-SEO-022, BR-SEO-023, BR-SEO-026, BR-SEO-028; BR-DATA-022 (takedowns and opt-outs never shown).
- Defect fix `APPROVED`: LB-SEO-001 (locale-aware grouping in card strings).
- No DEV. The `below` order and tie-breaks are spec-tested (Q-SEO-016).

## Acceptance criteria

- At most 24 cards per sort; the four sorts are deterministic (stable tie-break on `number`).
- No card carries a phone pattern, listing text or address; every photo URL verifies with `SignedPhotoUrl::verify`.
- Every `link` is ≤ 64 characters after `startapp=` and parses with the BR-SEO-026 regexes back to the number and the
  source post.
- A listing taken down disappears from the next card request (no cached payload older than 5 minutes).

## Tests

- `SeoCardServiceTest`: `at_most_24_cards`, `sort_orders_dataset` (new, cheap, expensive, below with null deltas
  last), `tie_break_by_number`, `price_strings_per_locale_and_deal`, `params_short_forms`, `age_strings_tashkent_days`
  (listing at 18:30 UTC viewed at 19:30 UTC → day rollover in Tashkent), `owner_and_below_market_badges`,
  `under_10_percent_no_badge`, `mixed_tone_no_badge`, `photo_url_signature_verifies`, `listing_without_photo_has_null_photo`,
  `deep_link_parses_with_br_seo_026_regex`, `long_channel_falls_back_to_short_link`, `no_pii_fields_selected`
  (query log asserts no `phone_encrypted`/`original_text` columns), `taken_down_listing_absent`.

## Edge cases

- A merged listing: the survivor's number and its primary publication are used.
- A listing whose source post was deleted (`post_deleted`): the link still opens the Mini App; the `-<channel>-<post>`
  part is kept (the Mini App offers the post only when it exists).
- A slice with fewer than 24 active listings: all of them; zero → empty list (the page still renders, BR-SEO-036).
- Signatures across midnight UTC: cached payloads are recomputed at least every 5 minutes, so `e` stays ≥ 24 h ahead.

## Security

- SEC-REQ-024 (signed photo URLs), SEC-REQ-019 (links only to `t.me`), SEC-REQ-021 (strings rendered as text),
  SEC-REQ-040 (taken-down listings never shown), DEC-14 (no listing pages — cards only).

## Definition of done

Tests green (`make ci-backend`, `pgsql` EXPLAIN check), parity gate items ticked (`15` §4) for F-SEO-007 and the data
part of F-SEO-010, docs and the feature rows in `09` updated, PR reviewed by the other developer.
