# ADR-0016: HOMI ships a new product; the migration runs in three waves

- Status: Proposed
- Date: 2026-11-14
- Deciders: developer (answer round of 2026-11-14); first developer (review of this PR)
- Source: `docs/migration/24-three-wave-strategy.md` §1, §2, §7, §8.1 (DEC-31, DEC-40, DEC-42, DEC-45, DEC-46); verbatim answers in `docs/migration/decisions/2026-11-14-developer-answers.md`

## Context

The plan of 2026-11-09 (`docs/migration/21-development-master-plan.md` §5) moved the legacy kvadro² product onto
HOMI: the same bot, hosts and users, the unchanged legacy Mini App served by a HOMI compatibility surface, and one
cut-over of data, bot and DNS with a point of no return. On 2026-11-14 the developer set a different direction
(gradual transition without stopping the working site, frontend first, then the API method by method, then the full
switch) and answered the questions of the first draft. HOMI does not take over the legacy bot and hosts. The table in
`24` §1 compares the two plans.

## Decision

HOMI ships a **new, permanent product** under its own bot and brand (DEC-40). The migration runs in three waves
(DEC-31, `24` §2):

| Wave | Content | Exit |
| ---- | ------- | ---- |
| 1. The new product on legacy listings | Contract stubs, then the Mini App, then the API, then the bot, then the landing (DEC-45). Personal data, radars and the bot are HOMI's own code; shared listing data comes from legacy through a service key (DEC-42) | Every screen and bot scenario passes its functional checklist on production, with no method left on a stub |
| 2. Own listings, method by method | Listings arrive from the `telegram.uz` collector through HOMI's intake (DEC-39, still to be agreed with the collector's owner and the first developer, DEC-02); each shared-data method moves from the legacy driver to HOMI's own code behind its flag | No method reads legacy |
| 3. Full switch | The service key is retired; SEO pages and the admin panel are built on HOMI's data; the old bot announces the move and its operator closes it | Legacy is no longer called by anything |

- Legacy keeps running as it is: its bot, its hosts and the operator's backend. HOMI does not serve its users, hold
  its bot token or touch its hosts (`24` §2).
- No user data is moved. Users start empty in HOMI's bot (DEC-40).

## Consequences

- Not built: the legacy compatibility surface (CF-001, CF-002) and its tasks, the cut-over of hosts and bot
  identity, and the data migration (`24` §7). The operator's dump serves Wave 2 as an archive and a reference.
- Functional parity is the acceptance criterion: the same screens, texts and scenarios as legacy, with small visual
  differences accepted (DEC-46). A written checklist per screen and per bot scenario replaces the parity gate.
- Every merge to `main` is deployed to staging and production (DEC-45). Access is open, so screens that still answer
  from a stub carry a visible "demo data" marker (DEC-50).
- HOMI holds personal data of its own users from the first production deploy. The legal basis (DEC-13, Q-SEC-021)
  stays open and is now needed earlier.
- The order of work is the Wave 1 queue (`docs/migration/wave-1/README.md`). The Wave 2 plan is written when the
  collector's owner has answered and the dump has arrived (`24` §9).
- Follow-up ADRs: 0017 (`/api/v1` and source drivers), 0018 (Mini App architecture), 0019 (frontend UI stack).

## Alternatives considered

- Take over the legacy bot, hosts and users (the plan of 2026-11-09): rejected in the answer round. HOMI is a new
  permanent product with its own bot (DEC-40), and the cut-over had a point of no return.
- Port the legacy client file by file and let it talk to legacy through nginx under the old bot (the first draft,
  commit `cf4d325`): rejected. The Mini App is rebuilt from the audit, and the recovered code is read as a reference,
  never copied (DEC-32).
