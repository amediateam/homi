# KV-BE-038 — Favourites: API-011 toggle and API-029 list

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-FAV-001 |
| Dependencies | KV-BE-028, KV-DB-010, KV-BE-018 (and the `legacy-lists` / `legacy-reads` limiters of KV-BE-010; KV-QA-008 for race tests) |

## Goal

The legacy Mini App toggles a favourite with `POST /api/listings/:id/favorite` and reads the whole list with
`GET /api/favorites`; the toggle is serialised per (user, listing) so double taps and bot/app races end in a defined
state, and the bot gets an idempotent "set to state" method on the same service.

## Legacy reference

- API-011 (`08` §2): `$KVADRO_ROOT/docs/api.md:114`, `:636-647`; client `$KVADRO_ROOT/demo/app/src/lib/api/listings.js:38-41`,
  `$KVADRO_ROOT/demo/app/src/components/FavButton.jsx:27` (response is the source of truth; `204` or error rolls back);
  bot ⭐ uses the same toggle `$KVADRO_ROOT/docs/telegram-bot.md:986`.
- API-029 (`08` §2): `$KVADRO_ROOT/docs/api.md:132`, `:926-941`; client `$KVADRO_ROOT/demo/app/src/lib/api/user.js:23`,
  `$KVADRO_ROOT/demo/app/src/features/feed/useInfiniteFeed.js:31-33`, `$KVADRO_ROOT/demo/app/src/features/feed/ListingFeed.jsx:81-83`,
  `:88` (403); mocks `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:122`, `$KVADRO_ROOT/demo/app/tools/parity/mocks-filters.mjs:83`.
- Rules: BR-API-023, BR-API-094, BR-DATA-017; LB-API-004, LB-API-024, LB-API-039, LB-APP-022, LB-BOT-007; DEV-003;
  Q-API-009, Q-API-023, Q-API-038.

## Implementation

1. Read `.claude/skills/laravel-best-practices/` (transactions, locks) and `.claude/skills/testing-best-practices/`.
2. `php artisan make:class Services/Engagement/PersonalListService --no-interaction` (or extend it if KV-BE-036 created
   it): `toggleFavorite(User, Listing): bool` — inside `Cache::lock("fav:{$user->id}:{$listing->id}", 5)->block(3)` and a
   transaction: row exists → delete and return `false`; else insert and return `true`; the composite primary key
   `(user_id, listing_id)` of `favorites` (KV-DB-010) is the last guard (`insertOrIgnore`).
3. `setFavorite(User, Listing, bool $state): bool` — idempotent upsert/delete for bot buttons that carry the target
   state (LB-BOT-007, LB-API-039); used by M5.
4. `favorites(User): Collection` — the user's favourites ordered by `created_at desc` (Q-API-009 spec), listings resolved
   through their current state; withdrawn listings stay listed with `status_text`; purged and taken-down listings are
   not returned (rows kept until the listing purge, KV-DB-028).
5. `php artisan make:controller Legacy/FavoriteController --invokable --no-interaction`:
   `POST api/listings/{id}/favorite` (`auth:tma`, `legacy.access`, `throttle:legacy-lists`; bodiless POST without
   `Content-Type` accepted) → resolve the number (alias → survivor, KV-BE-018), toggle, `200 {"favorite": bool}`.
6. `php artisan make:controller Legacy/SavedController --no-interaction` (`favorites`; `history` added by KV-BE-039):
   `GET api/favorites` (`throttle:legacy-reads`) → `{"items": ListingPreview[], "next_cursor": null}` — the whole list
   in one response; `cursor` query ignored.
7. Bump the user's feed-cache exclusion version only if favourites ever influence counts (they do not today — note it).

## Files

- `backend/app/Services/Engagement/PersonalListService.php` (new or extended)
- `backend/app/Http/Controllers/Legacy/{FavoriteController,SavedController}.php` (new); `backend/routes/legacy.php`
- `backend/tests/Feature/LegacyApi/Api011FavoriteTest.php`, `backend/tests/Feature/LegacyApi/Api029FavoritesTest.php`,
  `backend/tests/Feature/Pgsql/FavoriteToggleRaceTest.php` (new)

## API contract

- API-011: `POST /api/listings/<number>/favorite` (no body) → `200 {"favorite": boolean}` (never `204`). Errors:
  `404 {"detail":"Not Found"}` (unknown/purged), `401`, `403 <reason>`, `429 {"detail":"rate_limited"}`; any error makes
  the client revert the heart silently.
- API-029: `GET /api/favorites` → `200 {"items": ListingPreview[], "next_cursor": null}` — `next_cursor` is always JSON
  `null` (a non-null value or a missing key loops the client); items carry the preview strict keys. Errors: `403` →
  «Нет доступа»; others → error state.
- `Cache-Control: private, no-store`.

## Business rules

- Kept: BR-API-094 (server toggle returning the resulting state, shared with the bot), BR-API-023 (whole list,
  `next_cursor: null`), BR-DATA-017 (per-user set).
- Defect fixes `APPROVED`: LB-API-004 (`next_cursor` present), LB-API-039 (toggle kept for the legacy client, serialised;
  target-state method for the bot and v1).
- DEV-003 `PROPOSED` (v1 pagination; legacy keeps the whole list) — test `->todo('DEV-003 PROPOSED')` for v1 only.
- Q-API-009, Q-API-023, Q-API-038 spec-tested.

## Acceptance criteria

- Two sequential toggles return `true` then `false`; `GET /api/favorites` reflects the final state.
- Two concurrent toggles of one (user, listing) are serialised: no `500`, no unique-key violation, final state equals
  the last response (`15` §3.4 #3, §3.6 #1).
- A favourite set through `setFavorite()` (bot) appears in `GET /api/favorites` (`15` §3.7 #4).
- A 500-item list is returned in one page with `next_cursor: null`.

## Tests

- `Api011FavoriteTest`: `toggle_true_then_false`, `bodiless_post_without_content_type_accepted`,
  `alias_number_favourites_survivor`, `unknown_id_404`, `response_is_200_json_never_204`, auth/access dataset,
  `limiter_61st_per_minute_is_429`, IDOR (`15` §3.1 #6): `b_toggling_does_not_change_a_rows`.
- `Api029FavoritesTest`: `whole_list_next_cursor_null` (`assertLegacyShape('FeedPage')` with `next_cursor` strictly
  `null`), `ordered_most_recent_first`, `withdrawn_listing_kept_with_status_text`, `purged_listing_absent`,
  `empty_list_shape`, `large_list_single_page`, `only_own_rows` (`15` §3.1 #7), `cursor_param_ignored`.
- `Feature/Pgsql/FavoriteToggleRaceTest.php` (KV-QA-008): `concurrent_toggles_serialised`; bot `setFavorite` vs app
  toggle interleaving.
- `->todo('DEV-003 PROPOSED')`.

## Edge cases

- Favourite of a listing merged later: re-pointed to the survivor by M6 merge listeners; the toggle on the old number
  acts on the survivor.
- Lock timeout under contention → `429`-like retry is not available to the old client; return the current state with
  `200` instead of failing (documented choice).
- `blocked` user → `403` before any write.

## Security

- SEC-REQ-014 (rows only through the requester), SEC-REQ-015 (serialised, idempotent per (user, listing)),
  SEC-REQ-006, SEC-REQ-027 (`legacy-lists` 60/min, `legacy-reads` 300/min).

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), parity gate items ticked (15 §4) for F-FAV-001, docs and the feature row
in 09 updated, PR reviewed by the other developer; the PR notes `setFavorite()` for the telegram track (F-FAV-002).
