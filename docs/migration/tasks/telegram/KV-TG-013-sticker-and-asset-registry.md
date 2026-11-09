# KV-TG-013 — Per-bot sticker and asset registry

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development) |
| Complexity | S |
| Feature IDs | F-BOT-001 |
| Dependencies | KV-TG-004 (`sendSticker`, `getStickerSet`); Q-BOT-022 (sticker set names or source files, owner); licence of the mascot assets (product owner) |

## Goal

The welcome sticker and the sticker after saving a radar are sent by every environment's bot — dev, staging and
`@KvadroAppBot` — even though a `file_id` belongs to one bot. A registry resolves each named asset per bot, caches the
`file_id` per `bot_id`, and degrades gracefully (text only) while the owner has not handed over the assets.

## Legacy reference

- Stickers: BOT-010 (welcome sticker with the mascot before TXT-BOT-006, `tb:193`; sticker after a radar is saved,
  `tb:537`), BR-BOT-011, BR-BOT-047; `04` §1 rows "Stickers", "Avatar", "Description picture".
- `file_id` belongs to one bot: `04` §1 note 2; `$KVADRO_ROOT/docs/about.md:424`; Q-BOT-022.
- Test bots need copies of every asset: `17` §2 row "Description picture, avatar, stickers".

## Implementation

1. Tests first (`php artisan make:test --pest --unit Telegram/StickerRegistryTest`).
2. `config/telegram.php` → `assets.stickers`: `welcome`, `radar_saved`, each either `{set: <sticker set name>, index:
   <n>}` (preferred: a public sticker set works for every bot) or `{file: resources/telegram/stickers/<name>.webp}`
   (uploaded on first use); values per environment through env names only if they differ
   (`TELEGRAM_STICKER_SET`), otherwise in config.
3. `php artisan make:class Telegram/Assets/StickerRegistry`: `fileId(string $name): ?string` —
   cache key `bot:asset:{bot_id}:{name}` (no expiry; flushed by `php artisan telegram:assets:refresh`); for `set`
   assets calls `getStickerSet` once and takes the sticker at `index`; for `file` assets returns null so the first
   `SendSticker` uploads the file (multipart) and stores the `file_id` from Telegram's answer.
4. `Responder` (KV-TG-010) `SendSticker(name)`: missing asset or any Telegram error → skip the sticker, log once per
   day at `warning`, continue with the next reply (the welcome text must never depend on the sticker).
5. `php artisan make:command Telegram/AssetsRefreshCommand` (`telegram:assets:refresh`): clears the cache for the
   current bot; safe in every environment (no profile change).
6. Avatar and description picture are BotFather assets set by the bot owner (no Bot API call is used for them here);
   they are listed in the manual checklist of KV-TG-056 with the source file location agreed with the owner.
7. Asset files enter the repository only with the product owner's written permission (brand assets); until then the
   dev and staging bots use test stickers from a public set named in their local / staging config.

## Files

- `backend/app/Telegram/Assets/StickerRegistry.php`, `backend/app/Console/Commands/Telegram/AssetsRefreshCommand.php` (new)
- `backend/config/telegram.php` (`assets`), `backend/app/Telegram/Replies/Responder.php` (sticker path)
- `backend/resources/telegram/stickers/` (only after the owner's permission)
- `backend/tests/Unit/Telegram/StickerRegistryTest.php` (new)

## API contract

Bot API: `getStickerSet {name}`, `sendSticker {chat_id, sticker: <file_id> | <multipart file>}`. CLI:
`php artisan telegram:assets:refresh`.

## Business rules

- Kept: BOT-010 behaviour inside BR-BOT-011 (sticker then welcome) and BR-BOT-047 (sticker after save).
- Graceful degradation (no sticker when the asset is missing) is an implementation choice, not a DEV: users of the
  production bot see the legacy sticker once the owner provides it (Q-BOT-022 must be answered before S2).

## Acceptance criteria

- With a `set` asset, the first send calls `getStickerSet` once and later sends reuse the cached `file_id`.
- With a `file` asset, the first send is a multipart upload and the second uses the returned `file_id`.
- Two bot ids keep separate cache entries.
- With no asset configured `/start` still sends the welcome text (KV-TG-014 test).

## Tests

| # | Case | Expected |
| - | ---- | -------- |
| 1 | `welcome` = set `TestSet`, index 0, two sends | one `getStickerSet`, two `sendSticker` with the same `file_id` |
| 2 | `welcome` = file, first send | multipart `sendSticker`; `file_id` cached |
| 3 | bot id A cached, bot id B sends | B resolves on its own |
| 4 | `getStickerSet` answers `400` | sticker skipped, one warning, next reply sent |
| 5 | `conversation(user: 'A')->send('/start')` with no asset | only TXT-BOT-006 message, no error |
| 6 | `telegram:assets:refresh` | cache entries of the current bot cleared |

## Edge cases

- The owner's sticker set is renamed or deleted: `getStickerSet` fails → text-only replies until the config changes.
- A cached `file_id` becomes invalid (Telegram rotates rarely): `sendSticker` `400` → cache entry dropped, next call
  resolves again.

## Security

- No personal data. Asset licences and brand use are a product-owner decision; nothing is copied from the legacy tree
  without it. No secret in the config (sticker set names are public).

## Definition of done

Tests green (`make ci-backend`), Q-BOT-022 answer (or the decision to wait) recorded in the PR, F-BOT-001 parity-gate row
updated, PR reviewed by the other developer.
