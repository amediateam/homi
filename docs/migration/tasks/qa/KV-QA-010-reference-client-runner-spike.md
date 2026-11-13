# KV-QA-010 — Reference-client runner spike: legacy Mini App build against HOMI

| Field | Value |
| ----- | ----- |
| Status | TODO (options A and B need approval (dependency change); option C needs none) |
| Owner | QA (track: development) |
| Complexity | L |
| Feature IDs | F-COMPAT-001, F-TMA-001, F-ONBOARD-001, F-FEED-001 |
| Dependencies | KV-QA-001, KV-QA-003; for mode 2 the legacy routes API-001, API-003, API-004 (backend tasks of CF-001/CF-002) |

## Goal

A runner exists that opens the **unchanged legacy Mini App production build** in headless Chrome with a fake Telegram,
once against the legacy parity mocks and once against a locally started HOMI, and compares DOM, `<html class>`, `lang`
and the API request set; the runner technology is decided and recorded.

## Legacy reference

- Harness: `$KVADRO_ROOT/demo/app/tools/parity/parity.mjs:14-25` (static server), `:37-58` (interception, blocked
  hosts), `:60-74` (DOM snapshot of `#root` and portals), `:76` (`SHOTS`), `:88-89` (comparison);
  `$KVADRO_ROOT/demo/app/tools/parity/mocks.mjs:7-60` (fake Telegram, frozen `Math.random` and `Date`), `:114-131`
  (API mocks); `$KVADRO_ROOT/demo/app/tools/parity/README.md`; `$KVADRO_ROOT/CLAUDE.md:23-34`.
- Dev proxy rule to reproduce: `$KVADRO_ROOT/demo/app/vite.config.js:49-63` (`/api`, `/media`, `/tiles` →
  `VITE_API_PROXY`).
- Production artefacts: `$KVADRO_ROOT/demo/app/tools/parity/original/` (entry `assets/index-B_mMoUu6.js`) and
  `$KVADRO_ROOT/demo/app/dist/`; `08` names release `index-plF_TOcT.js`.
- Serve unchanged artefacts, not a rebuild: Q-SEC-015, SEC-REQ-049; CSP for the served build: SEC-REQ-030.

## Implementation

1. Read `15` §2.5 and the harness files above (read-only; nothing is executed in the legacy tree).
2. Identify the artefact set to use: compare entry names and `Last-Modified` notes in
   `$KVADRO_ROOT/demo/app/docs/CHANGELOG.md` with `08`; ask the developer if the current production release is not
   present. Write `docs/migration/data/legacy-miniapp-manifest.json` (relative path, bytes, SHA-256, release name).
3. Copy the artefacts and the scenario files (`mocks.mjs`, `mocks-filters.mjs`, `gl-parity.mjs`) into a gitignored
   scratch directory (`backend/storage/framework/testing/parity/`, already ignored by its `.gitignore`); verify the
   copy against the manifest.
4. Build the prototype with **option C** first (no new dependency): a PHP built-in server with a router script serves
   the artefacts and proxies `/api`, `/media`, `/tiles`, `/call` to a second built-in server running HOMI on the
   PostgreSQL test database with a synthetic bot token (free ports; never `php artisan serve`, never 8000/8001); Dusk
   drives Chrome; an init script injected through `Page.addScriptToEvaluateOnNewDocument` installs the fake Telegram
   (ported from `mocks.mjs`, with `initData` from `InitDataFactory`) and wraps `fetch` / `XMLHttpRequest` to record
   method, URL and non-GET body into `window.__api`; `Network.setBlockedURLs` blocks `telegram.org`, PostHog and OSM.
5. Port the snapshot function of `parity.mjs:60-74` verbatim into the injected script so both modes normalise the DOM
   identically.
6. Mode 1: artefacts + the legacy mocks served by the router (the mock `api()` function ported to PHP or JSON
   responses from KV-QA-002 fixtures). Mode 2: artefacts + HOMI. Run scenario `feed` in both modes and print the
   comparison like `parity.mjs:90-104`.
7. Measure: runtime per scenario, 10 consecutive runs for flakiness, WebGL availability with SwiftShader (needed by the
   16 GL scenarios), effort to port one more scenario.
8. If option C is clearly worse, write the approval request for option A (`puppeteer-core`, the legacy harness design)
   or B (`pestphp/pest-plugin-browser`) into `scripts/packages/proposed.json` with the measurements — needs approval
   (dependency change) — and stop there until approved.
9. Record the decision in `15` §2.5 (chosen option, reasons, measured runtime) and the run command in
   `docs/development/workflows.md`.

## Files

- `docs/migration/data/legacy-miniapp-manifest.json` (new)
- `backend/tests/Browser/Parity/{ReferenceClientSpikeTest.php,router.php,inject.js}` (new; option C)
- `docs/migration/15-testing-strategy.md` §2.5 (decision), `docs/development/workflows.md`
- `scripts/packages/proposed.json` (only if A or B is requested)

## API contract

The runner does not change any contract; in mode 2 it exercises API-001 (`GET /api/meta`), API-003 (`GET /api/bot`),
API-004 (`GET /api/feed`) and RES-001 (`/media`).

## Business rules

The legacy client keeps its own behaviour, quirks included (`09` §4: LB-APP fixes apply to the new client only).

## Acceptance criteria

- The manifest names the release and matches the copied files.
- Scenario `feed` runs in mode 1 and reports `IDENTICAL` against the legacy harness's expectations (same request set
  as `mocks.mjs` produces).
- Scenario `feed` runs in mode 2 against HOMI and produces a comparison report (identical, or a list of differences).
- Ten consecutive runs give the same result.
- The decision and its measurements are recorded in `15` §2.5.

## Tests

`ReferenceClientSpikeTest` (mode 1 and mode 2 for `feed`); a negative control: a deliberately altered mock field makes
mode 1 report `DIFFERENT`.

## Edge cases

- The boot script waits up to 3 s for the SDK (`$KVADRO_ROOT/CLAUDE.md:68`); the fake must be present before it runs.
- The prefetch consumes `/api/meta` and the first feed page before React mounts; the request set must include them.
- `POST /api/events` is excluded from comparison (non-deterministic, `parity.mjs:88`).
- Fonts and GPU differ between machines: DOM comparison does not depend on them; screenshots do (KV-QA-019).
- The PHP built-in server answers one request at a time unless `PHP_CLI_SERVER_WORKERS` is set; the prefetch and the
  radar tab send parallel requests, so both servers run with several workers.

## Security

- The legacy tree is only read; copies live in the gitignored scratch directory (`15` §1.7).
- `initData` is synthetic and signed with the synthetic token; no production host is contacted (blocked list plus
  `127.0.0.1` targets only).
- The served artefacts are the production files listed in the manifest (SEC-REQ-049).

## Definition of done

Tests green (`make ci-backend`; the Dusk spike run documented), parity gate items ticked (15 §4), docs updated, PR
reviewed by the other developer; for options A/B, the approval recorded before any dependency is added.
