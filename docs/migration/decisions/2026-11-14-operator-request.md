# Request to the legacy operator, 2026-11-14

Conventions: [`../README.md`](../README.md). This is the log of the written request to the operator of legacy kvadro²:
service access to the listing API, limits, dump and schema. It belongs to WP-02
([`../wave-1/WP-02-operator-request-and-baseline.md`](../wave-1/WP-02-operator-request-and-baseline.md), Part A).

No key, address, phone number or contact detail is written here: a value is named, never copied.

## Status

| Item | State |
| ---- | ----- |
| Text prepared | 2026-11-14, the WP-02 specification, Part A (with `GET /api/feed/new` added to point 2b, see below) |
| Handed to the product owner | pending: the developer sends or hands over the text of the WP-02 specification, Part A, from the project's own mailbox. The operator's contact is known only to the product owner (Q-SYS-009) |
| Sent to the operator's contact | pending: date and sender (the product owner) to be filled in |
| Text as sent | unchanged from the specification unless pasted below |
| Outbound addresses of the staging and production API hosts | 2026-11-14: asked of the production track in the description of the WP-02 pull request #37 ("Needs from the production track"). The production track gives them to the operator directly; this file only records that they were asked for |

**Change to the text before sending.** The legacy release `index-DY_DH7h-.js` (the baseline, see
[`../wave-1/baseline.md`](../wave-1/baseline.md)) added `GET /api/feed/new`, which the feed's "new since your last
visit" banner reads. Point 2b therefore also asks for `GET /api/feed/new`.

## Answers

Filled in when the operator answers. Each answer names the question it closes and the specifications it changes
(WP-02 step 6).

| Point | Topic | Answer | Date | Closes | Specifications to change |
| ----- | ----- | ------ | ---- | ------ | ------------------------ |
| 1 | Contact, change notices | — | — | Q-SYS-009 | `24` §8.2; WP-71 |
| 2a–2d | Service key: header, routes, user identity, source addresses | — | — | Q-API-060 | WP-41 |
| 2e | Key rotation and revocation | — | — | Q-SYS-009 | WP-71 |
| 3 | Limits | — | — | Q-API-059 | WP-41, WP-46 |
| 4 | Language and currency, per-user fields | — | — | Q-API-062 | WP-41, WP-42 |
| 5 | Raw values | — | — | Q-API-062 | WP-42 |
| 6 | Source channel and post; author key | — | — | Q-API-063 | WP-42, WP-44 |
| 7 | Phone or call link | — | — | Q-API-062 | WP-43 |
| 8 | Translation target language | — | — | Q-API-062 | WP-43 |
| 9 | Batch read of previews | — | — | RK-25 | WP-42 |
| 10 | Photos: caching, Referer | — | — | — | WP-42 |
| 11 | Landing data files | — | — | — | WP-60 |
| 12 | Dump and schema | — | — | DEC-39 | Wave 2 plan |
| 13 | Announcement in the old bot later | — | — | — | WP-71 |
