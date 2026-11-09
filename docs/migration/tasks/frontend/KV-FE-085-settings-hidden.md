# KV-FE-085 — Settings › «Скрытое»

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-HIDE-003 |
| Dependencies | KV-FE-081 (settings screen, hidden data), KV-FE-047 (price and thumbnail helpers), KV-FE-014 (confirm, toast); backend KV-BE-042 (API-026, API-027, API-028); decisions: DEV-016, DEV-034 `PROPOSED`; Q-API-032, Q-API-037 |

## Goal

The «Скрытое» sub-page (SCR-039) lists blocked authors and hidden listings, lets the user return one item or everything
(with a confirmation), opens a hidden listing on tap, and after any change makes the feed, map and radar previews show
the returned items again — with visible feedback on failures (DEV-016) and tolerant rendering of new rule kinds that
DEV-034 may add.

## Legacy reference

- SCR-039 (`03` §2): `$KVADRO_ROOT/demo/app/src/features/settings/HiddenScreen.jsx:24-141` (`applyChange` optimistic
  with rollback, `returnAuthor`, `returnListing`, `returnAll` with confirm, author row with phone/channel icon and
  `ph-mask`, listing row with thumbnail, price or «Цена договорная», title · district).
- App wiring: `$KVADRO_ROOT/demo/app/src/app/App.jsx:499` (every change resets the session `hidden` map, `03` §1.11).
- Rules: BR-APP-053 (the row exists only when something is hidden), BR-APP-036 (hide/block effects), BR-API-096,
  BR-API-097 (scope and undo of hiding and blocking).
- Defects: LB-APP-027 → DEV-016 (failures vibrate only); DEV-034 (user-wide hide rules may appear here).
- Visual baseline: KV-QA-019 scenario `settings-hidden` → `docs/migration/visual-baseline/SCR-039-*.png`.

## Implementation

1. `frontend/app/app/(miniapp)/features/settings/HiddenPage.tsx`: sub-page (KV-FE-013, `bare` layout) titled
   `settings.hidden`; data `{listings, authors}` from the settings screen's API-026 result (KV-FE-081), kept in the
   settings store.
2. Intro line `hidden.intro`; empty → `hidden.empty`.
3. «Заблокированные авторы» group (when `authors.length > 0`): icon phone (`kind = "phone"`) or at-sign (otherwise);
   bold `label` — for phones wrapped in the replay-masking class `ph-mask` (PostHog masks it, KV-FE-035); sub-line
   `hidden.phone` / `hidden.channel` · («{count} {plural(listings)}» or `hidden.noListings`); button `hidden.return`.
   Unknown `kind` values (DEV-034 rule kinds) render with a generic icon and the server `label`, never a throw.
4. «Скрытые объявления» group (when `listings.length > 0`): a button with the thumbnail (`photos_preview[0]` through the
   `.s.jpg` helper of KV-FE-047; missing or failed image → empty square), price `main + period` or `card.negotiable`,
   «title · district» (title before « · », KV-FE-047 helper); tap → light haptic → open the listing over the sub-page
   (KV-FE-063); separate button `hidden.return`.
5. `applyChange(next, request)`: light haptic → optimistic state → request → success: notify the app (reset the session
   hidden map, invalidate feed/map/count/radar-preview caches in KV-FE-023, update the settings row count), success
   haptic; failure: restore the previous state, error haptic, and with DEV-016 (flag `dev016ErrorToastOnFailure`) toast
   `common.saveFailed`.
6. Return one author → `DELETE /api/hidden/:id` (the **author entry id**); return one listing → `DELETE
   /api/listings/:id/hide` (API-013); «Показать всё снова» → confirm `hidden.confirmAll` (TMA-026) → `DELETE
   /api/hidden`. With DEV-016 the return-all success is confirmed by the toast `radar.unhidden` «Скрытое снова
   показывается».
7. When the list becomes empty after a change, the page shows `hidden.empty` and stays open; the settings row disappears
   when the user goes back (BR-APP-053).

## States and texts

| State | Texts (keys, ru) |
| ----- | ---------------- |
| intro | `hidden.intro` «Эти объявления и авторы не приходят ни в ленту, ни в радар.» |
| empty | `hidden.empty` «Ничего не скрыто» |
| authors group | `hidden.authors` «Заблокированные авторы»; kinds `hidden.phone` «Номер», `hidden.channel` «Канал»; `hidden.noListings` «сейчас нет объявлений»; plural `listings` (ru one/few/many) |
| listings group | `hidden.listings` «Скрытые объявления»; `card.negotiable` «Цена договорная» when no price |
| actions | `hidden.return` «Вернуть»; `hidden.all` «Показать всё снова» |
| confirm | `hidden.confirmAll` «Снова показывать все скрытые объявления и заблокированных авторов?» |
| saving | item removed at once (optimistic) |
| error | item restored; error haptic; with DEV-016 `common.saveFailed` «Не получилось сохранить» |
| success (return all, DEV-016) | `radar.unhidden` «Скрытое снова показывается» |
| loading | n/a — the page opens only after API-026 answered (the row is hidden otherwise) |

## Interaction

- Sub-page chrome of KV-FE-013 (slide-in, swipe-back except Android, Back, header shadow).
- The listing opened from here is a layer above the sub-page; Back returns to the list.
- Layout: grouped cards, thumbnail 48 px (legacy `hid-thumb`), «Вернуть» right-aligned; long labels truncate.

## Telegram integration

TMA-026 (`showConfirm`, `window.confirm` fallback), TMA-022 (Back), TMA-025 (haptics).

## Storage and analytics

- Storage: none.
- No events; phones masked in session replay via `ph-mask`; `$pageview settings/hidden` through KV-FE-035 (proposed
  name; legacy sent none).

## Files

- `frontend/app/app/(miniapp)/features/settings/HiddenPage.tsx` (new)
- `frontend/app/lib/settings/hiddenActions.ts` (new)
- `frontend/app/tests/settings/HiddenPage.test.tsx`, `frontend/app/e2e/settings-hidden.spec.ts`

## API contract

- API-026 `GET /api/hidden` → `{listings: ListingPreview[], authors: [{id, kind: "phone"|"source"|string, label,
  count}]}` (both arrays always present).
- API-027 `DELETE /api/hidden/:id` (author entry id) → `204`; `404 {"detail":"Not Found"}` for a foreign or unknown id →
  rollback.
- API-013 `DELETE /api/listings/:id/hide` → `204`.
- API-028 `DELETE /api/hidden` → `204`.
- Errors: `401`, `403 <reason>`, `429`, network → rollback.

## Business rules

- Kept: BR-APP-053, BR-APP-036, BR-API-096, BR-API-097.
- DEV-016 `PROPOSED` (flag); DEV-034 `PROPOSED` (server may list user-wide rule kinds here; the page tolerates them).
- Q-API-037 (whether report-hidden listings and radar rules appear and are cleared) is answered by the server; the page
  shows whatever API-026 returns.

## Acceptance criteria

- Authors and listings render as the `settings-hidden` baseline (ru light): icons, masked phone, counts with correct
  plurals («1 объявление», «3 объявления», «5 объявлений»), thumbnails, «Цена договорная».
- «Вернуть» on an author sends `DELETE /api/hidden/<author entry id>`; on a listing `DELETE /api/listings/<id>/hide`;
  a `500` restores the row.
- «Показать всё снова» asks for confirmation; Cancel sends nothing; OK sends `DELETE /api/hidden` and shows the empty
  text.
- After returning a listing, the search feed shows it again without a manual refresh.

## Tests

- Component: rendering matrix (authors only, listings only, both, empty, unknown author kind); plural forms;
  `todo('DEV-016 PROPOSED')`.
- E2E (contract mocks): return author, return listing (with `500` rollback), return all with confirm, open a hidden
  listing and Back.

## Edge cases

- An author entry with `count: 0` → «Номер · сейчас нет объявлений».
- A hidden listing that was withdrawn → `photos_preview` empty → empty thumbnail; opening it may answer `404` → the
  listing screen's «Объявление не загрузилось» (KV-FE-063).
- Two quick «Вернуть» taps on different rows → both requests run; each rollback restores only its own row.

## Security

- SEC-REQ-014 (ids come only from the user's own API-026 response), SEC-REQ-021 (labels as text), SEC-REQ-047 and
  `ph-mask` (no phone text in replay or logs).

## Definition of done

`make ci-frontend` green; tests green (or added with KV-FE-010); visual review of `SCR-039` recorded in the PR; parity
gate G4 for F-HIDE-003 ticked (`15` §4); row in `09` updated; PR reviewed by the other developer.
