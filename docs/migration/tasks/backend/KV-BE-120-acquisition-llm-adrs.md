# KV-BE-120 — ADRs: listing acquisition after the migration (CF-007) and LLM data-processing rules

| Field | Value |
| ----- | ----- |
| Status | TODO (acceptance BLOCKED by DEC-02 and DEC-03) |
| Owner | Backend (track: development); acceptance by the first developer **[PT]** and the product owner |
| Complexity | S |
| Feature IDs | F-PIPELINE-001, F-PIPELINE-002 |
| Dependencies | CF-007, CF-016; DEC-02 (acquisition), DEC-03 (LLM vendor and legal basis, Q-SEC-006); Q-SEC-007 (legal basis for third-party phones and photos) |

## Goal

Two ADR drafts are in review: "Listing acquisition after the migration" (supersedes the collector set of ADR-0009,
removes the `geo.uz` premise, allows the isolated in-repo reader of CF-007 option C, adds raw-post intake and the deal
mapping of CF-016) and "LLM provider and data-processing rules" (vendor, masking, quotas, audit, retention of prompts and
outputs). Every M6 task that writes code points at these ADRs instead of re-deciding.

## Legacy reference

- Acquisition: 217 open channels read through their public pages without subscribing (BR-API-042,
  `$KVADRO_ROOT/docs/about.md:117`, `:169`; `$KVADRO_ROOT/docs/seo-pages.md:244-247`), probably `t.me/s/<channel>`
  (BR-SEO-037, Q-SEO-019); channel opt-outs (BR-API-043, `$KVADRO_ROOT/demo/landing/site/privacy.html:67`); public
  methodology claims that must stay true (BR-SEO-029).
- LLM: Gemini named as the processor in the public privacy text (`$KVADRO_ROOT/docs/about.md` §5.11); masking of
  phones and `@handles` before the LLM (BR-API-045, BR-BOT-088); «без догадок» (BR-API-044); prompts, model and
  limits unknown (Q-API-018).
- Target analysis: `10` §3.8 (options A–D, recommendation C, data needed to decide items 1–6), §3.16 (CF-016), §4.10
  (`llm`, `collect` queues), §4.14 (integrations); GAP-001, GAP-002, GAP-027; `14` §2.1 option C (`Q-DATA-045`).
- HOMI: `docs/architecture/decisions/0009-listing-ingestion-push-model.md` (decision 1–8, the `geo.uz` line in the
  context), `backend/database/seeders/SourceSeeder.php:16-18`, `backend/config/intake.php` (`deal_types`).

## Implementation

1. Read `docs/architecture/decisions/0000-adr-template.md`, ADR-0009, `10` §3.8 and §3.16, `16` §4.10
   (SEC-REQ-042…044), `.ai/agents/intake-pipeline-engineer.md`, `.ai/agents/security-reviewer.md`.
2. ADR "Listing acquisition after the migration" (next free number; 0014 is reserved for T4):
   - Context: no pusher exists (CF-007), `telegram.uz` is not confirmed in production and has no push (GAP-027), the
     legacy method is public-page reading.
   - Decision (as `PROPOSED` until DEC-02): option C — an in-repo `Collectors` module (`App\Collectors\TelegramChannels`)
     that may call only the Intake application service (`IntakeAcceptService`, KV-BE-122), enforced by a Pest `arch()`
     test; `telegram.uz` becomes the active source only after the side-by-side run of KV-BE-143; option D named as the
     same design in a sibling repository if collection must stay out of this repository.
   - Source set: `homi_channels` (in-repo reader), `telegram_uz` (later), `kvadro_legacy` (migrated listings, lowest
     trust weight, `14` §2.1), `datahub_uz` (unchanged); the `geo_uz` premise removed (`geo.uz` is not a housing
     collector, `10` part 2 CF-007 row).
   - Payload: raw-post fields `channel`, `post_id`, `posted_at`, raw text, `rent_period`; `rent` + `rent_period` map to
     `rent_long` / `rent_daily`; demand posts (`buy`, `rent_wanted`) stored raw, never published (CF-016). Parsing
     happens in HOMI for every source; collector-parsed fields are hints (`10` §3.8 "Where parsing happens").
   - Consequences: reachability test of public pages from the production host **[PT]** (data item 4); legal basis
     (Q-SEC-007); freshness target from migrated publications (data item 2).
3. ADR "LLM provider and data-processing rules":
   - Provider: Gemini by default for parity (DEC-03), selectable through the published `laravel/ai` config
     (KV-BE-047); another vendor requires a privacy-text change and the legal check of Q-SEC-006.
   - Rules: one `LlmGateway` (KV-BE-047) with masking (SEC-REQ-042), delimited untrusted input and schema-validated
     output, no tools (SEC-REQ-043), daily spend cap per environment and Pennant kill switches per task kind
     (SEC-REQ-044); extraction audit keeps prompt version, model, masked-input hash and the validated output, never raw
     text (Q-SEC-010); `is_owner` only through the deterministic rule of BR-API-046.
   - Golden-set benchmark (KV-BE-130) decides whether Gemini is replaced (accuracy, cost, latency).
4. Add both ADRs to `docs/architecture/decisions/README.md` (index) and link them from `10` §3.8 in the same PR —
   **do not** edit ADR-0009 itself; the new ADR states which parts it supersedes.
5. Open a PR for review by the first developer; record DEC-02 and DEC-03 as open in `.ai/memory/session-handoff.md`
   until answered.

## Files

- `docs/architecture/decisions/00NN-listing-acquisition-after-migration.md` (new)
- `docs/architecture/decisions/00NN-llm-provider-and-data-processing.md` (new)
- `docs/architecture/decisions/README.md` (index row each)

## API contract

n/a (decisions only; the payload itself is specified in KV-BE-121).

## Business rules

- Kept: BR-API-042, BR-API-043, BR-API-044, BR-API-045, BR-API-046, BR-SEO-029 (methodology statements stay true or
  the public text changes with the decision), BR-DATA-022 (opted-out channels never reappear).
- Defect fix `APPROVED` (policy): none in this task. No DEV is introduced; systematic extraction differences found
  later by KV-BE-130 become DEV candidates (`10` §3.8 "Legacy behaviour changes").

## Acceptance criteria

- Both ADRs follow the template, cite CF-007, CF-016, DEC-02, DEC-03 and SEC-REQ-042…044, and state the status
  `Proposed` until the decisions are answered.
- The acquisition ADR names the allowed dependency rule (`Collectors` → `Intake` only) and the switch criteria to
  `telegram.uz` (KV-BE-143 thresholds).
- The LLM ADR lists every task kind that calls the gateway (extraction, query parsing, translation) and the data
  retained per call.

## Tests

- Documentation task — no Pest tests. The `arch()` rule the ADR announces is implemented in KV-BE-125
  (`CollectorsArchitectureTest`), the gateway rules in KV-BE-047 and KV-BE-129.
- `python3 scripts/migration/collect_ids.py --check` stays green for the docs touched.

## Edge cases

- DEC-02 answers option A (telegram.uz only) or D (sibling repository): the ADR keeps the same Intake entry; KV-BE-125
  is then dropped or moved, KV-BE-121…124 stay valid.
- DEC-03 picks a non-Gemini vendor: the privacy text (F-PRIVACY-001) and BR-SEO-029 methodology wording change in the
  same release.
- Legal basis (Q-SEC-007) refuses copying third-party photos: the ADR records the fallback (no photo copy, `photos: []`
  on legacy routes) as a product decision for the owner.

## Security

- SEC-REQ-023 (photo fetching rules referenced), SEC-REQ-040 (takedowns and opt-outs block re-ingestion),
  SEC-REQ-042…044 (LLM), SEC-REQ-049 (no new package without the approval rule). No secrets or real channel lists in
  the ADR text.

## Definition of done

ADR drafts merged as `Proposed` (or `Accepted` after the decisions), the open DEC items recorded in the session
handoff, feature rows F-PIPELINE-001 and F-PIPELINE-002 in `09` point at the ADRs, PR reviewed by the first developer.
