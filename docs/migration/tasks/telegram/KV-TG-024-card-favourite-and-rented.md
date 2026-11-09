# KV-TG-024 — Card buttons: favourite set/unset and «Уже сдано» with undo

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | M |
| Feature IDs | F-FAV-002, F-REPORT-002 |
| Dependencies | KV-TG-022 (card renderer, `rerender`); favourites service with idempotent set/unset — F-FAV-001 (API-011 domain, KV-DB-010); vote service with `rented` and withdrawal — F-REPORT-001, F-REPORT-003 (API-016 domain); hidden listings — F-HIDE-001 (API-012/API-013 domain) |

## Goal

The favourite buttons on a card carry the intended state (add / remove) and are idempotent, so a press on an old copy
never does the opposite of its label (LB-BOT-007). «Уже сдано» records a `rented` vote, hides the listing for the voter
and switches the card into the «rented by me» state; `↩️ Не сдано` withdraws the vote and restores the card.

## Legacy reference

- BTN-039 `⭐ В избранное` → toast TXT-BOT-048 `Добавил в избранное ⭐ — список: /fav`, label → `★ В избранном`;
  BTN-040 `★ В избранном` → toast TXT-BOT-049 `Убрал из избранного` (`tb:661–662`).
- Stale copies: only the pressed copy changes; on another copy a press toggles the server state, «★ В избранном»
  on a stale copy **added** the listing (`tb:670–672`; BOT-024; LB-BOT-007).
- BTN-042 `Уже сдано` → toast TXT-BOT-055, line TXT-BOT-046 `🚫 Сдано — по вашей отметке (для других снимем, когда
  подтвердят)` prepended, the two lower rows become `⭐ В избранное` · `↩️ Не сдано` (BOT-060, `tb:664`);
  BTN-043 `↩️ Не сдано` → toast TXT-BOT-056 `Вернул объявление`, text and keyboard restored (`tb:665`).
- Rules: BR-BOT-060 (server-side favourite), BR-BOT-062 (rented hides for the voter at once, for others after more
  confirmations), BR-BOT-010 (old copies act on current state), BR-BOT-002 (toasts).
- Shared contract: API-011 toggles for the legacy Mini App; `15` §3.4 case 3 "bot buttons carry the target state".

## Implementation

1. Read `04` §3.10, `15` §3.4 case 3 and the favourite and vote services of the backend track. Tests first
   (`php artisan make:test --pest Bot/Card/FavouriteRentedTest`).
2. `php artisan make:class Telegram/Handlers/Card/ToggleFavourite`: callbacks `k1:cd:<n>:fv:1` (add) and
   `k1:cd:<n>:fv:0` (remove) call the idempotent `add` / `remove` methods of the favourites service (never the
   legacy toggle). Toast by the resulting state: added → TXT-BOT-048, removed → TXT-BOT-049. Then
   `CardSender::rerender` of the pressed copy from the server state (KV-TG-022).
3. `php artisan make:class Telegram/Handlers/Card/MarkRented`: `k1:cd:<n>:rt:1` → vote service `report(user, listing,
   rented)` (weighted vote, hides for the voter, threshold effects stay in the backend, SEC-REQ-045) → toast
   TXT-BOT-055 → re-render in the «rented by me» variant: TXT-BOT-046 line first, rows 1–2 unchanged, rows 3–4 replaced
   by `[⭐ В избранное | ★ В избранном][↩️ Не сдано]`.
4. `k1:cd:<n>:rt:0` → vote service `withdraw(user, listing, rented)` and unhide (API-013 semantics) → toast TXT-BOT-056
   → default variant.
5. The card variant is derived from the server state on every render (`rented_by_viewer` = an active, non-withdrawn
   `rented` vote of the viewer), so any copy re-renders correctly.
6. A repeated `rt:1` on an already voted listing answers TXT-BOT-055 again without a second vote (unique per user,
   listing, reason — SEC-REQ-015).
7. Analytics events `favorite_added` / `favorite_removed` / `vote_rented` / `vote_rented_withdrawn` through
   KV-TG-061 (ids only).

## Files

- `backend/app/Telegram/Handlers/Card/{ToggleFavourite,MarkRented}.php` (new)
- `backend/app/Telegram/Keyboards/ListingCardKeyboard.php` (rented variant)
- `backend/lang/{ru,uz,en}/bot.php` (`card.fav.*`, `card.rented.*`)
- `backend/tests/Feature/Bot/Card/FavouriteRentedTest.php` (new)

## API contract

Bot API: `answerCallbackQuery` (toast text), `editMessageCaption` / `editMessageText` + `reply_markup`. Callbacks
`k1:cd:<n>:fv:1|0`, `k1:cd:<n>:rt:1|0`. No HTTP endpoint; the Mini App's API-011 stays a toggle for the old client.

## Business rules

- Kept: BR-BOT-002, BR-BOT-010, BR-BOT-060, BR-BOT-062.
- Defect fix without a DEV: LB-BOT-007 (intended state in the callback, idempotent, re-render from server state) —
  `APPROVED` by policy (`09` §4.3).
- Thresholds of `rented` for other users: backend (F-REPORT-003, DEV-010 values `PROPOSED`); the bot only words the
  toast as legacy does.

## Acceptance criteria

- Pressing `★ В избранном` on a stale copy whose server state is "not favourite" leaves it not favourite and answers
  TXT-BOT-049; it never adds (LB-BOT-007 reversed).
- Each favourite press changes at most one row in the favourites table and re-renders only the pressed copy.
- `Уже сдано` hides the listing from the voter's feed, radar pushes and `/fav`-independent lists at once; `↩️ Не сдано`
  restores it.
- Toast texts equal TXT-BOT-048, TXT-BOT-049, TXT-BOT-055, TXT-BOT-056 in Russian.

## Tests

| # | Conversation | Expected |
| - | ------------ | -------- |
| 1 | card → `press('⭐ В избранное')` | toast TXT-BOT-048; same copy now shows `★ В избранном`; favourite row exists |
| 2 | then `press('★ В избранном')` | toast TXT-BOT-049; label back; row gone |
| 3 | two copies A and B; add on A; press `⭐ В избранное` on stale B | still favourite (one row), toast TXT-BOT-048, B re-rendered `★ В избранном` |
| 4 | two copies; remove on A; press `★ В избранном` on stale B | not favourite, toast TXT-BOT-049 (LB-BOT-007) |
| 5 | `press('Уже сдано')` | toast TXT-BOT-055; first line TXT-BOT-046; rows 3–4 → `[⭐ В избранное][↩️ Не сдано]`; listing hidden for the user |
| 6 | then `press('↩️ Не сдано')` | toast TXT-BOT-056; original text and four rows; vote withdrawn; listing visible again |
| 7 | `Уже сдано` pressed twice concurrently | one vote row, two identical toasts |
| 8 | favourite toggle inside the rented variant | favourite flips, rented variant kept |
| 9 | forged `k1:cd:<n>:fv:2` | catch-all alert TXT-BOT-039, no state change |

## Edge cases

- Listing withdrawn since the card was sent: favourite still works (lists keep withdrawn listings); `Уже сдано` answers
  the toast and keeps the withdrawn variant.
- Listing merged: the number resolves to the survivor; votes and favourites are re-pointed by the merge (backend).
- A user who blocked the listing's author: the card is still actionable from history.

## Security

- SEC-REQ-011 / SEC-REQ-014: actor from `from.id`; the listing is resolved by number, the favourite and the vote belong
  to the actor only; no user id is ever read from `callback_data`.
- SEC-REQ-015: upserts per (user, listing) and (user, listing, reason); concurrency test with KV-QA-008.
- SEC-REQ-045: a single `rented` tap never changes the listing for others; the threshold lives in the vote service.

## Definition of done

Tests green (`make ci-backend`), KV-QA-009 transcripts for favourites and rented pass, F-FAV-002 and F-REPORT-002
parity-gate rows updated, `09` rows updated, PR reviewed by the other developer.
