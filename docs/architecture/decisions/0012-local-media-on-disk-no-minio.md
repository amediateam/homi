# ADR-0012: Local media storage on disk — no MinIO in development

- Status: Accepted
- Date: 2026-11-08
- Deciders: developer (Phase 2 apply checkpoint: "В локале не будет minio, там будет в storage")
- Source: `docs/ai/reports/phase-2.md`; amends the MinIO parts of ADR-0008

## Context

ADR-0008 planned a local MinIO on `127.0.0.1:9500` behind `cdn.homi.loc` to mirror production object storage. The developer decided against running MinIO locally: the other local projects on both developer machines serve media straight from `backend/storage/app/public` through a `cdn.<project>.loc` vhost, and a local S3 adds a process, credentials and a client for no product benefit. Staging and production keep MinIO (`s3.hc.uz`, ADR-0011).

## Decision

- Locally, media lives on the Laravel `public` disk (`backend/storage/app/public`); nginx serves that directory as static files at `https://cdn.homi.loc` (immutable caching for `originals/` and `derived/`).
- The public URL base is a single config value, `MEDIA_PUBLIC_URL` (`https://cdn.homi.loc` locally, `https://cdn.homi.uz` / `https://cdn.staging.homi.uz` elsewhere), so generated URLs look identical in every environment.
- Media code (Phase 3) targets named disks `media_public` / `media_private` configured per environment: `local` driver in development, `s3` driver (MinIO via `s3.hc.uz`) in staging/production. Application code never branches on the driver.
- `league/flysystem-aws-s3-v3` remains PROPOSED for Phase 3 because staging/production need it; it is simply unused locally.
- Private files locally: `media_private` is a `local` disk under `storage/app/private`, never exposed by nginx; "signed URLs" are served through a Laravel route (`temporaryUrl` is emulated by the local driver) so the application flow is the same as with S3 presigned URLs.
- No MinIO tooling in the repo for local use: `scripts/dev/minio.sh` removed; `scripts/dev/storage.sh` prepares the directory and a `health.txt` probe that `dev-check` fetches through the CDN host.

## Consequences

- One fewer local process and no local S3 credentials; `.env.example` keeps the `AWS_*` keys blank for staging/production parity.
- Image variants, hashing and cleanup behave the same locally (Flysystem abstracts the driver); S3-specific behaviour (presign with MinIO, CORS on the bucket, bucket policies) is verified on staging only — the Phase 7 scenario D/E runs against staging.
- `docs/infrastructure/environments.md` and `local-development.md` updated; the local port plan no longer lists 9500/9501.

## Alternatives considered

- Local MinIO (ADR-0008 original) — rejected by the developer: extra service, no benefit for two developers.
- Pointing local development at the staging bucket — rejected: environments must never share writable storage (master prompt §7.6).
