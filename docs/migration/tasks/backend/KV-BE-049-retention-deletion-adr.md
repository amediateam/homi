# KV-BE-049 — ADR: data retention and deletion

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Backend (track: development) writes; product owner (public promise) and first developer (backups **[PT]**) approve — DEC-12; security-reviewer checks |
| Complexity | S |
| Feature IDs | F-PRIVACY-002, F-PRIVACY-003 |
| Dependencies | CF-019; DEC-12 |

## Goal

One accepted ADR fixes what HOMI keeps, for how long, and how a user's data is deleted — answering HOMI's OPQ-5 with
the legacy public promises as the baseline — so that KV-BE-050 (deletion), KV-DB-028 (purges), HANDOFF T1 (raw
updates) and the production backups implement one rule set.

## Legacy reference

- Public promises: `$KVADRO_ROOT/docs/about.md:264-275` (action log 180 days without texts; withdrawn listings 90 days
  then phone, text, photos erased; support links 90 days and summaries 1 year; «Удалить мои данные» immediately from
  the database, from backups after about two weeks, plus PostHog person deletion); `/privacy` text
  `$KVADRO_ROOT/demo/landing/site/privacy.html`.
- Rules: `02-legacy-backend-audit.md:1031-1042` (§16: BR-API-129…132, Q-API-048), BR-API-065, BR-API-125, BR-API-128,
  BR-DATA-004, BR-DATA-006, BR-DATA-021, BR-DATA-031, BR-DATA-039; bot `/privacy` and BTN-076 (`04` §3.16).
- Decisions: CF-019 option A (`10-target-architecture.md` §2.1, §3.19), DEC-12, OPQ-5 (`10` §1.14), GAP-019, GAP-022.
- Security: SEC-030, SEC-REQ-036…039, SEC-REQ-041 (`16-security-review.md:893-958`); `14` §7.9 (erasure during the
  migration window).
- HOMI baseline: `backend/config/telegram.php:48` (14-day updates retention), ADR-0009 (raw intake payloads kept),
  `docs/architecture/requirements.md:47` (OPQ-5).

## Implementation

1. Read `docs/architecture/decisions/0000-adr-template.md`, `README.md` there, `10` §3.19, `16` §4.9 and
   `.ai/agents/security-reviewer.md`.
2. Take the next free ADR number (0014 is reserved for T4; check `docs/architecture/decisions/` and the other track's
   open PRs, `docs/handoff/parallel-work.md` §5) and write `docs/architecture/decisions/00NN-data-retention-and-deletion.md`.
3. Content (one table per data class: what, where, retention, purge mechanism, owner):
   a. per-user data (users, settings, access, attribution, personal lists, votes, verifications, found answers,
      radars, hide rules, deliveries, delivered-card log, pending items, tokens) — deleted by one procedure on request;
   b. listing PII (phone, `original_text`, photos and renditions, translations, snapshots, the matching raw
      `intake_events` fields) — erased 90 days after withdrawal; taken-down listings removed from public surfaces at
      once;
   c. action log — 180 days, monthly partitions dropped; no texts;
   d. raw Telegram updates — PII redacted before storage, payload encrypted, 14 days, prune scheduled (SEC-REQ-037);
   e. LLM audit rows — no raw text, 180 days;
   f. application logs 30 days; Telescope 48 h where enabled; backups ≤ 14 days, encrypted, approved jurisdiction
      **[PT]**;
   g. erasure ledger `erasure_requests` keyed by an HMAC of the Telegram id (no clear id), kept to prevent re-import
      and to replay legacy erasures during the migration window (`14` §7.9);
   h. PostHog person deletion requested and recorded;
   i. votes of erased users: deleted and aggregates recomputed (decision for Q-SEC-016, `PROPOSED` in the ADR);
   j. legacy dump and import database destroyed after the rollback window (KV-DB-031).
4. Record the new env key for the ledger HMAC (`ERASURE_SUBJECT_KEY`, `PROPOSED`, ≥ 32 bytes, per environment —
   SEC-REQ-034) and which tasks implement each row (KV-BE-050, KV-DB-028, T1, M7).
5. Open a docs PR; request approval from the product owner (public promise text) and the first developer (backups,
   retention of logs); attach the security-reviewer checklist.

## Files

- `docs/architecture/decisions/00NN-data-retention-and-deletion.md` (new)
- `docs/architecture/decisions/README.md` (index row; shared file, separate small change in the same docs PR)

## API contract

n/a (documentation). Constraints recorded for implementers: the legacy surface has no deletion route; deletion is
started from the bot (`/privacy` → «Удалить мои данные», M5) and later from v1/ARM.

## Business rules

- Keep (as the baseline): BR-API-065, BR-API-125, BR-API-128, BR-API-129, BR-API-130 (support data, only if the support
  bot is in scope — DEC-21), BR-API-131, BR-API-132 (the `/privacy` text is a public promise), BR-DATA-004, BR-DATA-006,
  BR-DATA-021, BR-DATA-031.
- Changes needing approval are written as `PROPOSED` inside the ADR: the vote treatment (Q-SEC-016), Telescope/log
  windows, history cap (DEV-003 / LB-DATA-010).
- No legacy behaviour is reduced; any retention longer than promised requires a new `/privacy` text (BR-API-132).

## Acceptance criteria

- The ADR lists every table holding personal data in M1 (`06` §4.2) with a retention and a mechanism; nothing is
  "kept indefinitely" without a reason.
- Each row names its implementing task or HANDOFF item.
- Approved by the product owner and the first developer (DEC-12 closed) or merged as `Proposed` with the open points
  listed in `session-handoff.md`.

## Tests

- Documentation task: `docs-guard` review (`.claude/skills/docs-guard/`) of every referenced path and key; the
  implementing tasks carry the tests (KV-BE-050 deletion scan, KV-DB-028 time-travel purges, SEC-REQ-038 one test per
  rule, `16` §5.8).
- A checklist in the PR maps each ADR row to the test that will prove it.

## Edge cases

- A user erased between the legacy dump and the freeze (`14` §7.9): covered by the ledger replay.
- Backups older than the promise held by the legacy operator (Q-DATA-044): outside HOMI; recorded as a dependency on
  the owner.
- Listings of an erased user? Users do not own listings in kvadro² (listings come from channels) — state it explicitly.

## Security

- SEC-REQ-036…039 and SEC-REQ-041 are the requirements the ADR turns into policy; SEC-REQ-034 for the ledger key;
  SEC-REQ-050 (ЗРУ-547 work: processor register, consent records) referenced as a dependency with DEC-13.

## Definition of done

ADR merged (accepted, or `Proposed` with the open DEC listed), decision index updated, `10` CF-019 row and the
F-PRIVACY-002/F-PRIVACY-003 rows in `09` point at it, PR reviewed by the other developer and approved by the product
owner and the first developer.
