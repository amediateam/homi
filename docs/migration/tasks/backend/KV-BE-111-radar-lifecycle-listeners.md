# KV-BE-111 — Radar and delivery listeners: withdrawal, deletion, chat loss, erasure registry

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) |
| Complexity | S |
| Feature IDs | F-DELIVERY-006, F-PRIVACY-002, F-RADAR-008 |
| Dependencies | KV-BE-050 (`ErasureService` and its table registry), KV-BE-109 (`DeliveryLedger`), KV-BE-110 (pending items); `ListingWithdrawn` from KV-BE-137 (create the event class here if M4 lands first); `ChatUnreachable` from the telegram track (F-RADAR-008); Q-BOT-012, Q-BOT-031 |

## Goal

The radar and delivery tables react correctly to the life of listings, radars and users: a withdrawn or taken-down
listing loses its pending deliveries and its delivered messages are handed to the «Объявление снято» edit; a deleted
or paused radar stops planning; a user who blocked the bot stops receiving; and an erased user leaves no row in any
radar or delivery table.

## Legacy reference

- `$KVADRO_ROOT/docs/about.md:430` (delivered log needed for takedown edits), `/privacy` promise of the «Объявление
  снято» edit (`04` §5 BOT-062, `tb:862`).
- Audit IDs: BOT-062, TXT-BOT-047, BR-API-066, BR-API-068, BR-BOT-092, BR-DATA-016, BR-DATA-022, BR-API-129,
  BR-DATA-031; SEC-REQ-039, SEC-REQ-040; Q-BOT-012 (what happens when a user blocks the bot), Q-BOT-031 (edit text and
  triggers), Q-SEC-016.

## Implementation

1. Read KV-BE-050 (registry API and the "unregistered `user_id` column" test) and `10` §4.12.
2. Queued listeners (`php artisan make:listener … --no-interaction`, queue `radar`):
   - `DropPendingOnListingWithdrawn` (`ListingWithdrawn`, any cause incl. takedown): deletes unreleased
     `radar_pending_items` of the listing (and of its aliases).
   - `DeliveredMessages::forListing(Listing): LazyCollection` (`app/Services/Delivery`, `make:class`): the
     `bot_listing_messages` rows with `state = sent` for the listing and its aliases — the input of the telegram track's
     withdrawal edit job (F-DELIVERY-006, `11b` M5.8), which marks each row `edited_withdrawn` so a replay edits once
     (`15` §3.5 #7).
   - `DropPendingOnRadarDeleted` (`RadarDeleted`) and `DropPendingOnRadarPaused` (`RadarSaved` with kind `paused`):
     delete the radar's unreleased pending items (spec: a paused radar sends nothing, including what was held for the
     morning).
   - `StopDeliveriesOnChatUnreachable` (`ChatUnreachable`, raised by the telegram track on a Telegram `403` or a
     `my_chat_member` kick): deletes the user's unreleased pending items; radars stay as they are
     (`config('delivery.pause_radars_on_block')`, default false — Q-BOT-012 open); the matcher already skips users with
     `bot_chat_state <> 'active'` (KV-BE-108), and the `409 no_chat` check covers new writes (KV-BE-100).
3. Erasure registry (KV-BE-050): register `radars`, `radar_hide_rules`, `radar_deliveries`, `radar_pending_items`,
   `bot_listing_messages` (partitioned parent) as delete-by-`user_id` tables; `found` cooldown Redis key
   `found:asked:{user}` added to the cache keys the erasure clears. The registry test of KV-BE-050 then passes for the
   M4 tables.
4. Takedowns (KV-BE-138) raise `ListingWithdrawn` with cause `takedown` — no separate path here.

## Files

- `backend/app/Listeners/Delivery/DropPendingOnListingWithdrawn.php`, `DropPendingOnRadarDeleted.php`,
  `DropPendingOnRadarPaused.php`, `StopDeliveriesOnChatUnreachable.php` (new)
- `backend/app/Services/Delivery/DeliveredMessages.php` (new)
- `backend/app/Events/Listings/ListingWithdrawn.php` (only if KV-BE-137 has not created it)
- the KV-BE-050 registry file (entries added); `backend/config/delivery.php` (`pause_radars_on_block`)
- `backend/tests/Feature/Delivery/LifecycleListenersTest.php`, `backend/tests/Feature/Privacy/RadarErasureTest.php` (new)

## API contract

n/a.

## Business rules

- Kept: BR-API-066 / BR-BOT-092 (sent cards of withdrawn listings are edited — the edit itself is the telegram track's),
  BR-DATA-016 (cards addressable by `(chat_id, message_id)`), BR-DATA-022 (taken-down listings never delivered again),
  BR-API-129 / BR-DATA-031 (deletion from the database at once).
- Spec-tested: pending items dropped on pause; radars not paused when the bot is blocked (Q-BOT-012).

## Acceptance criteria

- After `ListingWithdrawn`, the listing has no unreleased pending item and `DeliveredMessages::forListing` lists every
  sent message of the listing and its aliases exactly once.
- After `ErasureService` on a factory user with radars, hide rules, deliveries, pending items and message rows, a
  database scan finds none of them (`SEC-REQ-039` acceptance for the M4 tables).
- After `ChatUnreachable`, nothing is due for the user and no new item is planned.

## Tests

- `LifecycleListenersTest`: `withdrawal_drops_pending_for_listing_and_aliases`,
  `delivered_messages_listed_once_including_aliases`, `already_edited_messages_not_listed`,
  `radar_delete_drops_its_pending`, `radar_pause_drops_its_pending`, `chat_unreachable_drops_user_pending`,
  `radars_not_paused_on_block_by_default`, `takedown_cause_uses_same_path`, `listener_replay_is_idempotent`.
- `Privacy/RadarErasureTest`: `erasure_removes_every_m4_row` (database-wide scan for the user id), `registry_lists_m4_tables`
  (the KV-BE-050 unregistered-column test passes), `found_cooldown_key_cleared`.
- Race (pgsql): `15` §3.6 #9 — user erased while a delivery job is queued → the job finds no user and stops, no rows
  recreated (with KV-BE-108).

## Edge cases

- Listing withdrawn and re-activated (status machine allows `active` again on a new publication, KV-BE-137) → pending
  items already dropped stay dropped; the listing is matched again only if a new `ListingPublished` fires.
- `bot_listing_messages` partitions older than the retention are dropped by KV-DB-028; `forListing` reads whatever exists.
- Votes of an erased user are handled by KV-BE-050 per Q-SEC-016, not here.

## Security

- SEC-REQ-039 (one deletion procedure covers the M4 tables), SEC-REQ-040 (takedown reaches alerts), SEC-REQ-014.

## Definition of done

Tests green (`make ci-backend`, `pgsql` group), parity gate items ticked (`15` §4) for the server parts of
F-DELIVERY-006 and F-RADAR-008 and the M4 rows of F-PRIVACY-002, docs and the feature rows in `09` updated, PR reviewed by
the other developer.
