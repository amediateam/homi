# KV-DB-030 — Owner re-verification campaign

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (DEC-29) |
| Owner | Backend (track: development); product owner (DEC-29, message wording); reminder messages through the bot (telegram track, F-OWNER-001) |
| Complexity | S |
| Feature IDs | F-OWNER-001, F-OWNER-002 |
| Dependencies | KV-DB-020; DEC-29 |

## Goal

Verified owners migrated with a legacy phone hash are asked to re-share their number through `/owner` within the
transition window; re-verified owners keep «Хозяин ✓»; at the end of the window every legacy hash is deleted.

## Legacy reference

- `14` §4.2 row "Owner verification" (copy `legacy_hash`, `legacy_hash_alg`, `verified_at`; `phone_hmac = null`;
  `reverify_due_at = cut-over + window`), §7.9 "Owner hashes" (reminder before deletion), §1.1 P10.
- `09` DEV-011 (`PROPOSED`: keyed HMAC; legacy hashes kept only for a fixed window; owners who do not re-verify lose
  «Хозяин ✓»), LB-DATA-005, LB-API-044, LB-BOT-029.
- Rules: BR-DATA-005, BR-API-107 … BR-API-110, BR-BOT-081; Q-DATA-019 (hash algorithm), Q-BOT-042; DEC-29.
- `18` §11 item 4 (legacy owner hashes expire at the end of their own window).

## Implementation

1. Read `.ai/agents/security-reviewer.md` and `.ai/agents/telegram-bot-engineer.md`.
2. Window length and wording from DEC-29 go into `config/owner.php` (`reverify_window_days`, reminder offsets, e.g.
   D+1 and D−7) — values `PROPOSED` until DEC-29.
3. `php artisan make:command --no-interaction Owner/SendReverifyRemindersCommand`: selects
   `owner_verifications` with `legacy_hash` not null, `phone_hmac` null and a due reminder; dispatches one reminder per
   user through the Delivery pacing (the message itself is built by the bot feature F-OWNER-001); records the reminder
   time to stay idempotent.
4. Re-verification: when `/owner` (F-OWNER-001) stores `phone_hmac`, the same row clears `legacy_hash` and
   `legacy_hash_alg` immediately.
5. Expiry: `privacy:expire-legacy-owner-hashes` (scheduled in KV-DB-028) nulls the remaining legacy hashes after
   `reverify_due_at`; badges then follow `phone_hmac` only (KV-BE-025).
6. Report: counts of reminded, re-verified and expired owners (no ids).

## Files

- `backend/config/owner.php` (new)
- `backend/app/Console/Commands/Owner/SendReverifyRemindersCommand.php` (new)
- `backend/routes/console.php` (daily reminder schedule, Asia/Tashkent)
- `backend/tests/Feature/Owner/ReverifyCampaignTest.php` (new)

## API contract

`owner_verified` on `ListingPreview`/`ListingDetails` (API-004, API-008) stays `true` for re-verified owners through
the window end and becomes `false` for owners who did not re-verify once their legacy hash expires.

## Business rules

BR-DATA-005, BR-API-108, BR-API-109 (badge rules unchanged); DEV-011 `PROPOSED` (the visible loss of the badge for
owners who do not re-verify) — the expiry step runs only after DEV-011 is approved; until then the reminder flow is
built and tested with `->todo('DEV-011 PROPOSED')` on the expiry assertion.

## Acceptance criteria

- All `legacy_hash` values are null after the window; badges preserved for re-verified owners.
- Each owner gets at most the configured reminders, never twice for the same offset.
- Legacy hashes are never brute-forced or re-keyed without the number (SEC-REQ-041).

## Tests

- `reminder sent once per offset; second run sends nothing` (fake Bot API through the KV-QA-003 kit).
- `re-verification clears legacy_hash immediately`.
- `expiry nulls remaining legacy hashes after reverify_due_at` (time travel; `todo('DEV-011 PROPOSED')` until approved).
- `user who blocked the bot is not retried in a loop` (403 handling per Q-BOT-012).

## Edge cases

- Owner erased during the window: the row is gone (KV-BE-050), no reminder.
- Owner whose number now appears in ≥ 3 flats or is marked as a realtor: re-verification succeeds but the badge rule
  still withholds the badge (BR-API-109).
- Legacy hash algorithm unknown (Q-DATA-019): transitional matching is off and badges rely on re-verification only —
  record the decision in DEC-29.

## Security

SEC-REQ-036 (only HMAC of the number), SEC-REQ-041 (no brute force, legacy hashes deleted at window end), SEC-REQ-029
(reminders paced), SEC-REQ-011 (`/owner` accepts only the sender's own contact).

## Definition of done

Tests green (`make ci-backend`), parity gate items ticked (15 §4), docs and the feature rows in 09 updated, PR reviewed
by the other developer. DEC-29 recorded; the campaign report at window end shows zero remaining legacy hashes.
