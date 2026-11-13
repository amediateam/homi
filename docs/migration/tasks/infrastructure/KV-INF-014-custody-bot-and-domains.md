# KV-INF-014 — Custody of `@KvadroAppBot`, the kvadro domains and accounts

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (Q-SEC-001: who holds the bot, the token, the registrar, DNS and Cloudflare today, and whether the legacy operator agrees to transfer) |
| Owner | DevOps (track: production — first developer approves), with the product owner |
| Complexity | M |
| Feature IDs | F-BOT-001, F-BOT-012 (and F-COMPAT-001, F-LANDING-009 through the domains) |
| Dependencies | Q-SEC-001, DEC-05 (bot custody and rotation timing), DEC-16 (Cloudflare kept or dropped), DEC-04 (brand — only for what is transferred later); `18` §2 stage S0; `17` §15 item 10 |

## Goal

Before S0 exits, the team (product owner and first developer) controls — or has a signed, dated plan to receive — the
BotFather ownership of `@KvadroAppBot`, the registrar and DNS of `kvadro.app`, the Cloudflare zone if it stays, and the
legacy secrets that must be revoked at S2/S3, with every credential stored only in the production vault.

## Legacy reference

- SEC-022 (one bot token is the master key for identity and messaging; the legacy operator holds it), SEC-REQ-012
  (rotation at the switch), SEC-REQ-034 (secret inventory per environment).
- `18` §2 S0 exit ("custody plan signed (Q-SEC-001, DEC-05)"), §6 step T0.3 (bot owner revokes the token), §11 step 3
  (secrets held by the legacy operator rotated); `17` §15 item 10.
- BotFather settings that live at Telegram and must stay unchanged at S2: `04` §1 (name, descriptions, commands, menu
  button, Main Mini App URL `app.kvadro.app`, privacy URL, inline off).
- Domains and edge: CF-008 option A (`10` §3.9), `17` §3.3 (certificates for the kvadro hosts need DNS access or a
  Cloudflare origin certificate).

## Implementation

1. With the product owner, write the custody inventory in the production track's notes (not in the repository):
   asset, current holder, target holder, transfer method, date, evidence. Assets: BotFather owner account of
   `@KvadroAppBot` (and whether BotFather's ownership transfer is available — to verify), the bot token, the
   `kvadro.app` registrar account, DNS, Cloudflare account and zone, the legacy PostHog project and personal key, the LLM
   key, legacy backups (Q-SEC-011), `@KvadroSupportBot` (DEC-21).
2. Agree with the legacy operator the duties of `18` §6 T0.1–T0.2 and of the rollback §8.1, and the communication
   channel (`18` §9 row "Legacy operator").
3. Decide DEC-05 timing (rotate at S2 recommended) and record who presses `/revoke` at T0.3 (the bot owner, with the
   first developer present).
4. Prepare the vault entries (names only in docs): production bot token, webhook secret, Cloudflare purge-only token
   (if DEC-16 keeps it), DNS API token for DNS-01 (KV-INF-029).
5. Record the frozen BotFather state for `18` §3 (bot owner runs `getMyName`, `getMyDescription`,
   `getMyShortDescription`, `getMyCommands` per `language_code` and scope, `getChatMenuButton`): the output becomes the
   baseline KV-TG-056 diffs against. **Needs first developer approval and the bot owner; read-only calls only.**
6. Sign-off: product owner and first developer sign the custody plan; S0 exit criterion ticked.

## Files

- None in the repository except a one-line status in `docs/migration/` notes kept by the production track (no values).
  The frozen BotFather dump (texts only, no token) goes to `docs/migration/data/botfather-frozen-<date>.json` if the
  product owner agrees.

## API contract

Read-only Bot API calls listed in step 5, made by the bot owner from an allowed machine; no `set*` call in this task.

## Business rules

BR-BOT-001 … BR-BOT-007 are untouched (nothing at Telegram changes in this task); the bot username stays
(`10` §3.9: changing it breaks every `t.me/KvadroAppBot` link).

## Acceptance criteria

- The custody inventory lists every asset of step 1 with a target date before S2 − 7 days.
- The legacy operator's written agreement to T0.1, T0.2 and the rollback duties exists.
- The vault holds named entries for every S2 secret; nobody outside the production track has access.
- The frozen BotFather dump exists and contains no token.

## Tests

| # | Check | Expected |
| - | ----- | -------- |
| 1 | review of the inventory against `17` §15 item 10 and `18` §11 step 3 | every asset present |
| 2 | `getMe` with the vault token from the production server (approved session) | `username` = `KvadroAppBot` |
| 3 | `grep -rE '[0-9]{8,10}:[A-Za-z0-9_-]{35}' docs/` on the repository | no match |
| 4 | DNS: `dig NS kvadro.app` / registrar panel screenshot reviewed by the first developer | holder = team account (after transfer) |

## Edge cases

- Ownership transfer not available in BotFather: the legacy owner keeps the account but the token is revoked and
  reissued into HOMI's vault at T0.3; the residual risk (the owner can revoke again) is recorded and accepted by the
  product owner.
- The legacy operator refuses DNS transfer before S2: DNS-01 certificates are impossible; KV-INF-029 uses a Cloudflare
  origin certificate if DEC-16 keeps Cloudflare, otherwise S2 moves.
- Support bot custody follows DEC-21; unresolved, it stays with the legacy operator and its links keep working.

## Security

SEC-022, SEC-REQ-012, SEC-REQ-034; credentials never in git, chat, tickets or agent prompts
(`docs/handoff/parallel-work.md` §6). The token is never shown to the development track.

## Definition of done

Custody plan signed by the product owner and the first developer, S0 exit item recorded in the production notes, the
frozen BotFather dump available to KV-TG-056 and KV-QA-009, `20-open-questions` entry for Q-SEC-001 closed by the audit
owner.
