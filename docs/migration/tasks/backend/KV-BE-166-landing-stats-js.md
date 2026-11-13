# KV-BE-166 — `stats.js` for the legacy landing mirror from configuration

| Field | Value |
| ----- | ----- |
| Status | TODO (production values BLOCKED by DEC-26) |
| Owner | Backend (track: development); file location and headers **[PT/INF]** |
| Complexity | S |
| Feature IDs | F-ANALYTICS-004 |
| Dependencies | DEC-26 (PostHog projects per environment), DEC-15 (`kvadro.app` at S2); KV-BE-152 (shared `posthog` config); Q-LND-008, Q-SEO-005 |

## Goal

While HOMI serves the unchanged legacy landing and the SEO pages need the same analytics loader, `/stats.js` is
generated per environment from configuration — the legacy loader's behaviour (visit id, click-time bot-link tagging,
cookieless PostHog EU) byte-for-byte except the injected values — so staging never reports into the production
project and production keeps the legacy project for continuity.

## Legacy reference

- RES-014 (`08` lines 1400-1409): `GET /stats.js?v=20261020b`, server-templated by `app/api/site_stats.py` with the
  PostHog key, host, assets host, SDK version, `env`, `clicks`; creates `kv-visit` → `window.KV_VISIT`; appends
  `--v<visit>` to bot links on SEO pages.
- LND-031 (`03b` lines 544-560): init options (`cookieless_mode: "always"`, `person_profiles: "identified_only"`,
  pageview/pageleave, autocapture without copied text, rageclick, heatmaps, web vitals, no recording or surveys),
  super-properties `env`, `site: "kvadro.app"`, `visit`; LND-063 (SEO analytics, unverified).
- File `$KVADRO_ROOT/demo/landing/site/stats.js:1-55` (key value not reproduced).
- Rules: BR-API-137 (templated by the backend), BR-API-121 (visit id joined with the bot user), BR-LND-002 (visit id
  format `[a-z0-9]{10}`, `sessionStorage kv-visit`), BR-LND-003 (click-time tagging, cut to 49 characters + `--v`).
- Open: Q-LND-008 (dashboards depending on `site`, `visit`, `env`), Q-SEO-005 (events on SEO pages), DEC-26.

## Implementation

1. Read the legacy file and LND-031, `.ai/agents/security-reviewer.md` (secrets), the KV-BE-152 `posthog` config.
2. Template: `backend/resources/landing/stats.js.stub` — the legacy file with the five injected values replaced by
   placeholders (`{{POSTHOG_PROJECT_KEY}}`, `{{POSTHOG_HOST}}`, `{{POSTHOG_ASSETS_HOST}}`, `{{POSTHOG_SDK_VERSION}}`,
   `{{ENV}}`, `{{CLICKS}}`); no other byte changes (the key of the legacy file is not copied into the repository —
   the stub is created from the legacy file with the value removed).
3. `php artisan make:command PublicData/BuildStatsJs --no-interaction` (`landing:stats-js`): renders the stub with JSON-
   encoded values from `config('analytics.posthog')` and `config('app.env')`, writes `media_public/landing/stats.js`
   atomically; refuses to write when the key is empty in `staging`/`production` and refuses the production project id
   outside production (same guard as KV-BE-152). Runs on deploy **[PT: deploy step]**.
4. Serving: `/stats.js` on the legacy site host from that file, `Cache-Control: public, max-age=300` (the legacy
   `?v=` query is ignored), `Content-Type: application/javascript; charset=utf-8` **[PT/INF: nginx]**.
5. The new `frontend/landing` (S4) owns its own analytics bootstrap (`NEXT_PUBLIC_*` config, frontend track); this
   file serves only the legacy mirror and the SEO pages until then.

## Files

- `backend/resources/landing/stats.js.stub` (new, without key values)
- `backend/app/Console/Commands/PublicData/BuildStatsJs.php` (new); `backend/config/analytics.php` (`stats_js` block)
- `backend/tests/Feature/PublicData/BuildStatsJsTest.php` (new)

## API contract

Static `GET /stats.js[?v=…]` → `200 application/javascript`; the PostHog project key it contains is the public
client key of the environment's project.

## Business rules

- Kept: BR-API-137, BR-API-121, BR-LND-002, BR-LND-003 (the loader logic is unchanged).
- No DEV.

## Acceptance criteria

- The rendered file differs from the stub only at the placeholders; the visit-id and link-tagging code is byte-equal
  to the legacy loader (diff against a sanitised copy of the legacy file in the test fixtures).
- Staging renders the staging project key; production renders the production key only in `APP_ENV=production`
  (RES-014 test).
- An empty key in staging or production fails the command; local renders a disabled loader (`api_host` set, key empty,
  `posthog.init` skipped by the loader's own guard or a `{{DISABLED}}` branch documented in the PR).

## Tests

- `BuildStatsJsTest`: `renders_placeholders_with_json_encoded_values`, `only_placeholders_differ_from_stub`,
  `visit_id_and_tagging_code_unchanged` (sanitised legacy fixture), `production_key_refused_outside_production`,
  `empty_key_fails_in_staging`, `write_is_atomic`, `no_key_value_in_repository` (the stub and fixtures contain no
  string matching the PostHog key pattern).

## Edge cases

- PostHog SDK version bump: configuration only; the CSP `script-src` of the landing must allow the assets host
  (DEC-08, frontend/infra).
- The legacy landing references `stats.js?v=20261020b`: query ignored; cache 5 minutes so a key rotation propagates.
- Erased users: the landing sends no Telegram identity; nothing to erase here (PostHog persons are handled by
  KV-BE-152).

## Security

- SEC-REQ-034 (per-environment keys, never shared), SEC-REQ-035 (no key literal committed), SEC-REQ-031 (CSP allows
  only the PostHog hosts), Q-SEC-006 (legal basis for PostHog EU).

## Definition of done

Tests green (`make ci-backend`), the KV-QA-013 attribution scenario (`source-tag`) passes on staging with the generated
file, parity gate items ticked (`15` §4) for F-ANALYTICS-004 (backend part), docs and the feature row in `09` updated,
PR reviewed by the other developer.
