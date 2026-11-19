# KV-DB-014 — Load users, settings, access, attribution, analytics ids

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (legacy schema) |
| Owner | Backend (track: development) |
| Complexity | M |
| Feature IDs | F-ACCESS-003, F-ACCESS-002, F-SETTINGS-001, F-SETTINGS-005, F-ONBOARD-005, F-ANALYTICS-002 |
| Dependencies | KV-DB-007, KV-DB-013 |

## Goal

Every legacy bot/Mini App user is in HOMI's `users` with the Telegram id as identity and no name, their settings in
`user_settings`, their admission state in `access_grants` (open invites in `beta_invites`), their acquisition history in
`user_attributions` and their PostHog distinct id copied byte for byte — so `GET /api/meta` and `GET /api/settings`
answer migrated users exactly as legacy did, and V-SUM-5 and V-SUM-6 are equal on R0.

## Legacy reference

- ENT-001 … ENT-006 (`06` §2.1); scope `14` §2 (users, settings, analytics ids mandatory; access migrate + config;
  open invites only; attribution migrate); load order `14` §7.3 step 2.
- Transformation rules `14` §4.1 (time, locale codes, erasure at extract) and §4.2 rows User, Settings, Access,
  Attribution, Analytics id.
- Questions: Q-DATA-006 (user table), Q-DATA-007 (settings storage, `*_chosen`), Q-DATA-008 (beta access), Q-DATA-009
  (attribution), Q-DATA-010 (distinct id), Q-DATA-035 (naive timestamps), Q-DATA-040 (service news), Q-DATA-048, Q-DATA-049.
- Defects: LB-DATA-014 (`uz_Latn` stored), LB-API-018 (`*_chosen` flags), LB-API-050 (stringly quiet/digest);
  `$KVADRO_ROOT/docs/about.md:425-440` (users, settings, attribution, PostHog id map must migrate).

## Implementation

1. Read `14` §4, `06` §4.2 rows `users` … `users.analytics_distinct_id`, `.ai/agents/postgis-geo-engineer.md`,
   `.ai/agents/security-reviewer.md`; replace the `<legacy_…>` placeholders with the KV-DB-001 table names.
2. `php artisan make:class Services/Migration/Loaders/UserLoader --no-interaction` (extends `BatchLoader`, KV-DB-013):
   Telegram id → `users.telegram_user_id` (bigint), profile flags `is_premium`, `has_username`, `has_photo`,
   `account_age_estimate`, `bot_chat_state` (unknown → `active` + re-probe flag on first send), `legacy_created_at`,
   `is_team`; `name`, `email`, `password` stay `null`; `bot_commands_locale = null` (ENT-059, so the first HOMI
   interaction rewrites per-chat command scopes). Conflict key `telegram_user_id`. `legacy_id_map` entity `user`.
3. `SettingsLoader`: locale `uz_Latn` → `uz`, unknown → `ru` + change row (LB-DATA-014); currency, theme, `city_id`
   resolved through `dictionary_code_aliases` (KV-DB-015 must have run); `quiet` `off` → both `null`, `HH-HH` → two
   `time` values (window may cross midnight), invalid → `off` + change row; `digest` `HH[,HH]` → sorted unique
   `smallint[]`, invalid → legacy default (per Q-DATA-007) + change row; `locale_chosen`/`city_chosen` true →
   `*_chosen_at` = legacy timestamp or run start; `service_news` unknown → `true` + change row (BR-BOT-080).
4. `AccessLoader`: admitted → `access_grants.state = admitted` (`admitted_via` from legacy if known), operator blocks →
   `blocked` with reason; owner list and mode → printed as a configuration proposal for `config/access.php` /
   the owner rows of KV-BE-009 (not loaded silently); open invites → `beta_invites` with the token **hashed** (the
   value of already-sent links keeps working through the hash, `14` §3).
5. `AttributionLoader`: each stored payload parsed with the BR-DATA-033 grammar; `raw_payload` kept (≤ 64 bytes, no
   personal data by grammar); unparsable → `source = 'unknown'` + change row.
6. `AnalyticsIdLoader` (may be part of `UserLoader`): copy verbatim into `users.analytics_distinct_id`; a duplicate across
   users is a run error (stop, report), never "fixed".
7. Extract-time exclusions: users on the erasure list (KV-DB-027) are skipped with reason `erased`; the replay step
   removes any rows already written.
8. Register the loaders in `LoaderRegistry` in the order of `14` §7.3 step 2; run on the masked sample (R0) and attach
   the report (counts, change volumes per rule) to the PR.

## Files

- `backend/app/Services/Migration/Loaders/{UserLoader,SettingsLoader,AccessLoader,AttributionLoader,AnalyticsIdLoader}.php`
- `backend/app/Services/Migration/LoaderRegistry.php` (registration)
- `backend/tests/Feature/Migration/Identity/*Test.php`, `backend/tests/Fixtures/Migration/stage_identity.sql` (synthetic)

## API contract

The loaded data must reproduce, for a migrated user and the same moment: API-001 `GET /api/meta` — `locale` (`uz_Latn`
on the wire for `uz`), `locale_chosen`, `currency`, `theme`, `city`, `city_chosen`, `analytics.id` equal to the legacy
value (BR-API-126), `403` with the same reason for a gated user (BR-API-011); API-024 `GET /api/settings` — `quiet`
(`"off"` or `"HH-HH"`), `digest` (`"HH"` / `"HH,HH"`), `locale`, `currency` as legacy strings (`14` §6.5 "Settings" check).

## Business rules

- Kept: BR-DATA-001 (one user per Telegram id), BR-DATA-003 (no name or contact), BR-DATA-007 (admitted stays
  admitted), BR-DATA-013 (server-owned settings), BR-DATA-014 (quiet/digest in Asia/Tashkent wall-clock), BR-DATA-015
  (wire codes), BR-DATA-021 (random distinct id, never the Telegram id), BR-DATA-033 (payload grammar), BR-BOT-080.
- Defect fixes (`09` §4.3, `APPROVED`): LB-DATA-014 (`uz` stored), LB-API-018 (`*_chosen_at` derived), LB-API-050
  (structured quiet/digest).
- No `PROPOSED` DEV applies to identity data.

## Acceptance criteria

- V-SUM-5 (settings fingerprint) and V-SUM-6 (analytics ids) equal on R0 (`14` §6.2), V-CNT-1 balances with reasons.
- No migrated user has `name`, `email` or `password` set; `telegram_user_id` unique and non-null.
- Every `uz_Latn` became `uz`; every invalid quiet/digest value has a change row; their counts are in the report.
- Open invite tokens are stored only as hashes.
- A re-run writes zero rows.

## Tests

`backend/tests/Feature/Migration/Identity/` (`pgsql` group, synthetic stage, KV-QA-001):
- `UserLoaderTest` — names in stage are never copied; flags copied; unknown `bot_chat_state` → `active` + re-probe flag.
- `SettingsLoaderTest` dataset: `off` → nulls; `23-08` → 23:00/08:0 (crosses midnight); `25-08`, `abc` → `off` + change;
  `09,19` and `19,09` → `{9,19}`; `uz_Latn` → `uz`; `kk` → `ru` + change; `locale_chosen` true without timestamp → run start.
- `AccessLoaderTest` — admitted, blocked with reason, open invite hashed (raw token absent from every column).
- `AttributionLoaderTest` dataset: `s_web`, `s_web_tg--vab12cd34ef`, `s_seo_uz_…`, `s_friend`, `s_web--l123`, 64 bytes of
  junk → `unknown`.
- `AnalyticsIdTest` — byte-identical copy; duplicate id across two users → run fails with a clear error.
- `IdentityRerunTest` — second run writes 0 rows; V-SUM-5/V-SUM-6 identical across runs.
- `ErasedUserExcludedTest` — a user on the erasure list is absent, excluded with reason `erased`.

## Edge cases

- Users who only used the Mini App and never started the bot (`join`): `bot_chat_state` per Q-DATA-006, never `active`
  without evidence.
- Settings rows without a user (orphans): excluded with reason `orphan`.
- Naive timestamps: converted with the zone proven by Q-DATA-035; unproven → the run refuses to start.
- Digest hours outside the preset set (`07` C-03): preserved as stored (structured), not forced to a preset.
- Legacy owner/team accounts: never auto-promoted to ARM admins (SEC-REQ-046, Q-SEC-018).

## Security

- SEC-REQ-036 (minimisation: no names, usernames, photos), SEC-REQ-039 (erasure replay, ENT-007), SEC-REQ-041 (handling,
  sanitised-marker guard), SEC-REQ-004 (users created without names).
- Reports and logs carry internal ids and counts only — never Telegram ids or distinct ids.

## Definition of done

Tests green (`make ci-backend` / `make ci-frontend`), parity gate items ticked (15 §parity gate), docs and the feature
row in 09 updated, PR reviewed by the other developer. In addition: R0 run on the masked sample green, the run report
(counts and change volumes) reviewed by the developer, `06`/`14` updated with the confirmed facts.
