# KV-DB-003 — Legal basis and data-handling agreement

| Field | Value |
| ----- | ----- |
| Status | BLOCKED (product owner + lawyer) |
| Owner | Product owner (with a lawyer); recorded by Backend (track: development) |
| Complexity | S |
| Feature IDs | Technical migration task — no production personal data may be copied before the legal basis and the handling agreement exist (`14` §1.1 P4, P5). Unblocks every migrated personal data set: F-ACCESS-003, F-SETTINGS-001, F-RADAR-001, F-DELIVERY-005, F-FAV-001, F-HISTORY-001, F-HIDE-003, F-REPORT-001, F-OWNER-001, F-ANALYTICS-002 |
| Dependencies | DEC-13; Q-DATA-004, Q-DATA-005, Q-DATA-044 |

## Goal

Written answers exist for the transfer of personal data from kvadro² to HOMI: the legal basis under ZRU-547 «On
personal data» (Telegram ids and behaviour of bot users, owner-phone hashes, raw phone numbers of listing authors),
the storage location, whether users must be notified or the `/privacy` text replaced first, and a handling agreement
(transfer channel, encryption, who may access, retention, destruction, backups). P4 and P5 of `14` §1.1 are marked
closed.

## Legacy reference

- `14` §1.1 P4 (access path and handling), P5 (legal basis), §1.2 (personal-data handling during the migration),
  §7.9 (retention and deletion during the window).
- Q-DATA-004 (transfer path), Q-DATA-005 (legal basis), Q-DATA-044 (backups and copies, «на нашем компьютере»);
  DEC-13 (`10` §8); related Q-SEC-005 … Q-SEC-009 (`16`), BR-API-132 (`/privacy` is a public promise),
  BR-DATA-031 (deletion from backups in about two weeks).
- Public promises: `$KVADRO_ROOT/docs/about.md:264-275` (retention), `$KVADRO_ROOT/demo/landing/site/privacy.html`.

## Implementation

1. Prepare (development track) a one-page brief for the product owner and the lawyer: data categories per table (from
   `14` §2 and `06` §2), purpose, recipient (HOMI hosting per ADR-0011), retention per SEC-REQ-038, the cut-over
   timeline of `14` §7.6, the questions of DEC-13, Q-SEC-005 … Q-SEC-009.
2. The product owner obtains the lawyer's written note: legal basis, localisation of storage (database, object
   storage, backups in Uzbekistan?), registration of the personal-data base (SEC-REQ-050), whether a notice to users
   or a new `/privacy` text must precede the transfer.
3. The product owner and the first developer sign the handling agreement: transfer channel (encrypted dump file or
   read replica), encryption at rest and in transit, the import database host (`14` §7.1, KV-DB-012), named people with
   access, retention of the dump until the rollback window ends, destruction record (KV-DB-031), legacy backups ageing
   out (Q-DATA-044).
4. Record both answers in `docs/migration/data/legal-basis.md` (statements and dates only; the signed documents stay
   with the product owner), update `14` §1.1 (P4, P5 closed or still blocked) and `10` §8 (DEC-13).
5. If a privacy-text change is required, open the decision for the product owner and link the landing/bot tasks
   (F-PRIVACY-001) — the migration does not start before it is published.

## Files

- `docs/migration/data/legal-basis.md` (new; no personal data, no contract copies)
- `docs/migration/14-data-migration-plan.md` §1.1, `docs/migration/10-target-architecture.md` §8 (status lines)

## API contract

n/a — legal and organisational task.

## Business rules

BR-API-132 (keep the `/privacy` promise or publish a new text), BR-DATA-031 (deletion and backups), BR-DATA-006
(90-day erase of withdrawn listings — applied at extract, `14` §4.1).

## Acceptance criteria

- `legal-basis.md` states: the legal basis per data category, the allowed storage location, the notice decision, the
  handling agreement items (channel, encryption, access list by role, retention, destruction) and the date of each
  answer.
- `14` §1.1 shows P4 and P5 closed, or still blocked with the reason.
- No migration rehearsal with production data (R1 onwards, KV-DB-024) is scheduled before this task is DONE.

## Tests

- Review checklist (recorded in the PR): every category of `14` §2 marked "migrate" has a basis line; every copy named
  in `14` §7 (dump, import DB, rehearsal copies, media transfer bucket) has a destruction rule.

## Edge cases

- The lawyer requires user consent first: the migration of personal data waits; a public-data-only rehearsal (listings
  without phones and texts) may still run if the note allows it.
- Storage outside Uzbekistan not allowed: the production track confirms the hosts of ADR-0011 before R1.
- Author phones of third parties (listing authors) have a different basis from bot users: the note must cover both.

## Security

- SEC-REQ-041 (migration data handling), SEC-REQ-050 (ZRU-547 compliance items), SEC-REQ-036 (minimisation),
  SEC-REQ-038 (backup retention).
- The repository holds statements only; contracts and identities of signatories stay with the product owner.

## Definition of done

Tests green (`make ci-backend` / `make ci-frontend`), parity gate items ticked (15 §parity gate), docs and the feature
row in 09 updated, PR reviewed by the other developer. In addition: `legal-basis.md` committed and P4/P5 closed in `14`.
