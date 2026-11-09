# KV-TG-056 — BotFather settings as code: `telegram:profile sync`

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend — Telegram bot (track: development); staging runs by the production track; production runs need first developer approval |
| Complexity | M |
| Feature IDs | F-BOT-001 |
| Dependencies | KV-TG-004 (client methods), KV-TG-009 (texts in three languages); DEV-036 (`PROPOSED`, `/ping` out of the menu); Q-BOT-014, Q-BOT-019, Q-BOT-020, Q-BOT-022; used by KV-INF-017 (staging bot) and KV-TG-057 |

## Goal

The bot profile that the Bot API can set — name, description, short description, the command menu per language and the
default menu button — is defined in the repository and applied with one command per environment, with a read-only diff
and a JSON dump for evidence. The settings only BotFather can change are a checked list. The command makes the dev and
staging bots look like `@KvadroAppBot`; production is not touched at S2.

## Legacy reference

- Identity rows of `04` §1 and BOT-001 … BOT-009: display name `kvadro² · поиск жилья`, description TXT-BOT-001 (one
  trilingual text, `$KVADRO_ROOT/docs/telegram-bot.md:57-68`), description picture TXT-BOT-002, short description
  TXT-BOT-003 (`tb:72–76`), menu button `Открыть` → web_app (BOT-004, TXT-BOT-004), Main Mini App (BOT-005), privacy
  link (BOT-006), commands TXT-BOT-005 (RU and EN captured, `tb:94–105`), inline mode off (BOT-008), avatar (BOT-009).
- Bot settings per environment `17` §2; freeze evidence `18` §3 (`getMyCommands` / `getMyDescription` per language);
  "BotFather settings do not change at S2" `18` §6 (GO + 30 min check).
- Open: Q-BOT-019 (per-language name and descriptions), Q-BOT-020 (menu button label and per-chat scope), Q-BOT-014 (UZ
  command descriptions, per-chat scopes), Q-BOT-022 (picture and avatar files).

## Implementation

1. Read `17` §2, `18` §3 and §6, the current Bot API documentation for `setMyName`, `setMyDescription`,
   `setMyShortDescription`, `setMyCommands`, `setChatMenuButton` (record the date checked in the PR). Tests first
   (`php artisan make:test --pest Bot/ProfileSyncTest`).
2. `config/telegram_profile.php` — the desired profile, values from `lang/{ru,uz,en}/bot.php` keys:
   `name` (default + per `language_code` if Q-BOT-019 shows per-language names), `description` (default = the
   trilingual TXT-BOT-001; per-language variants only after the product owner decides), `short_description`
   (TXT-BOT-003), `commands` — default list and lists for `ru`, `uz`, `en` (TXT-BOT-005; with DEV-036 approved `/ping`
   is omitted; UZ descriptions are new texts approved by the product owner), `menu_button` — `web_app` with the label
   TXT-BOT-004 and `TELEGRAM_MINIAPP_URL`.
3. `php artisan make:class Telegram/Profile/BotProfileSync` with `current(): BotProfile` (all `get*` calls per
   language), `diff(BotProfile $desired): array`, `apply(array $diff)`.
4. `php artisan make:command Telegram/ProfileCommand` → `telegram:profile dump|diff|sync`:
   - `dump` writes `storage/app/telegram-profile-<bot username>-<date>.json` (no token) — evidence for the contract
     freeze when run by the bot owner (`18` §3);
   - `diff` is read-only and exits 1 when the profile differs (usable in smoke checks);
   - `sync` applies only the differences; on `APP_ENV=staging` it is run by the production track; on
     `APP_ENV=production` it refuses unless `--approved` is given **and** `TELEGRAM_PROFILE_SYNC_ALLOWED=true` is set
     for that run — needs first developer approval, and is never run at S2 (`18` §6: unchanged profile).
5. BotFather-only checklist printed by `diff` and kept in `docs/infrastructure/telegram-webhook.md` (section "Bot
   profile"): description picture (TXT-BOT-002, source file from Q-BOT-022), avatar (BOT-009), Main Mini App URL
   (BOT-005, per environment `17` §2), privacy policy URL (BOT-006), inline mode off (BOT-008), group joining off
   (BOT-058, see KV-TG-020).
6. Per-chat command scopes and menu buttons set by the legacy bot are not handled here (KV-TG-057).

## Files

- `backend/config/telegram_profile.php`, `backend/app/Telegram/Profile/{BotProfileSync,BotProfile}.php` (new)
- `backend/app/Console/Commands/Telegram/ProfileCommand.php` (new)
- `backend/lang/{ru,uz,en}/bot.php` (`profile.*`, `commands.*`)
- `backend/.env.example` (`TELEGRAM_PROFILE_SYNC_ALLOWED=false`; shared file, announced)
- `backend/tests/Feature/Bot/ProfileSyncTest.php` (new)

## API contract

Bot API: `getMe`, `getMyName`/`setMyName`, `getMyDescription`/`setMyDescription`, `getMyShortDescription`/
`setMyShortDescription`, `getMyCommands`/`setMyCommands` (scope `default`, `language_code` `ru`/`uz`/`en`),
`getChatMenuButton`/`setChatMenuButton` (default). Artisan commands as in step 4.

## Business rules

- Kept: the identity of `04` §1 (name, texts, menu button label, inline off) for dev and staging copies.
- Deviation DEV-036 (`PROPOSED`): `/ping` not in the menu.
- Production profile unchanged at S2 (CF-008 option A, `18` §6); changes after S2 only with the product owner and first
  developer approval.

## Acceptance criteria

- `diff` against a fake bot configured like the legacy capture reports no difference except approved DEVs.
- `sync` on the dev bot results in `getMyCommands` per language equal to the config; a second `sync` makes no call.
- `sync` on production without the switch and `--approved` exits non-zero without any Bot API write.
- No token appears in output, dump file or logs.

## Tests

| # | Case (`FakeBotApi`) | Expected |
| - | ------------------- | -------- |
| 1 | `telegram:profile diff`, fake returns the desired profile | exit 0, "no changes" |
| 2 | fake returns RU commands with `/ping`, DEV-036 approved | diff lists the removal; `sync` calls `setMyCommands(language_code=ru)` once |
| 3 | UZ command list missing at Telegram | `sync` sets `language_code=uz` list |
| 4 | `sync` twice | second run: no write calls |
| 5 | `APP_ENV=production`, no switch | refused, `FakeBotApi::assertNothingSent()` for `set*` |
| 6 | `APP_ENV=production`, switch on, no `--approved` | refused |
| 7 | `dump` | JSON with name, descriptions, commands per language, menu button; no token string |
| 8 | description longer than Telegram's limit in a locale | validation error before any call |

## Edge cases

- Per-language name or description not supported by the legacy bot (Q-BOT-019): the config keeps only the default; the
  per-language keys stay empty and are not sent.
- Telegram rate limits on `set*` calls: the command sends at most one call per second.
- A staging bot created fresh: `sync` sets everything; the BotFather-only items are done by the production track from
  the printed checklist.

## Security

- SEC-REQ-012 / SEC-REQ-034: the command reads the environment's token only from config and never prints it;
  production writes gated (ADR-0011: every production change approved).
- SEC-REQ-019: the menu-button URL must be `https` and on the allow-list.

## Definition of done

Tests green (`make ci-backend`), dev-bot `sync` run recorded in the PR, staging run handed to the production track
(KV-INF-017), parity-gate cells of F-BOT-001 updated, `09` row updated, PR reviewed by the other developer.
