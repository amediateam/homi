# KV-INF-032 — DNS and edge switch for the kvadro hosts

| Field | Value |
| ----- | ----- |
| Status | TODO (needs DEC-16 — Cloudflare kept or dropped — and DNS custody, KV-INF-014) |
| Owner | DevOps (track: production — first developer approves), GO decided by the product owner |
| Complexity | M |
| Feature IDs | F-COMPAT-001, F-LANDING-009 (and F-COMPAT-002 through the client-IP chain, F-MEDIA-001 through edge caching) |
| Dependencies | KV-INF-029 (certificates and vhosts on HOMI), KV-INF-030 (runbook), KV-INF-014 (custody); DEC-16, DEC-15; the backend's trusted-proxy setting `TRUSTED_PROXIES` (F-COMPAT-002); `18` §6 rows T−48 h, GO, GO + 2 min; `17` §7 "Edge", §15 item 13; related: KV-INF-008 was dropped in favour of this task and the backend rate-limit work |
## Goal

At GO, `app.kvadro.app` and `kvadro.app` resolve (or are proxied) to HOMI with the edge cache rules of `17` §7, the edge
cache of both zones is purged, the client IP seen by Laravel is the real user's (trusted-proxy list = the edge ranges),
and the switch can be reversed within minutes before the point of no return.

## Legacy reference

- CF-008 option A; Cloudflare in front of the legacy hosts (`10` §2.1 CF-008, `17` §7, DEC-16); edge rules: bypass
  `/api/*` and `/call/*`, cache `/media/*` by full URL including the query for 1 day, SEO HTML by `s-maxage`, landing
  data 30 min; purge-only API token for takedowns and the 90-day purge.
- `18` §6 T−48 h (lower TTL to 60 s for unproxied records; proxied Cloudflare records switch by origin change), GO
  (DNS / edge to HOMI, purge both zones), §8.1 step 2 (DNS / edge back, purge).
- SEC-REQ-027 (limiters keyed by the real client IP through a trusted-proxy list matching the edge), SEC-REQ-033
  (`/api/*` never cached at the edge: `private, no-store`).

## Implementation

1. T−48 h: lower TTLs of the unproxied records to 60 s (or prepare the origin change for proxied records); export the
   current DNS zone for rollback.
2. Edge rules (Cloudflare kept): cache rules per `17` §7 in the zone, tested on a staging zone or a test sub-host first;
   a purge-only API token in the vault (`CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN` names, used by the backend's
   takedown and purge jobs). Cloudflare dropped: nginx `proxy_cache` rules on the web host replicate the same table.
3. Server `.env` `TRUSTED_PROXIES` = the addresses the Next servers reach the API from (WP-40: the Mini App calls the API server-side and forwards the user's `X-Forwarded-For`), plus the edge's published ranges (Cloudflare) when an edge fronts the app host or the API; verify after GO
   that two client IPs land in two limiter buckets and a forged `X-Forwarded-For` from outside the list is ignored.
4. GO: switch the origin / records to HOMI's web host; purge both zones; run the smoke tests of `18` §5.2 (GO + 2 min).
5. Rollback before the point of no return: restore the exported records / origin, purge, follow `18` §8.1.
6. Post-switch: monitor 5xx, `401`, latency per `18` §5.4; certificate and DNS checks added to KV-INF-025.

## Files

- `infra/production/runbooks/s2-cutover.md` entries (KV-INF-030), `infra/production/edge/` rule exports (production-owned)

## API contract

No application change; the edge must pass `Authorization` unchanged on `/api/*` and must not cache any `/api/*` or
`/call/*` response.

## Business rules

Every public URL keeps working (migration policy); `/media` signed URLs stay valid at the edge only for their own
expiry (BR-API-054 … BR-API-056); takedowns purge the edge (BR-BOT-092, SEC-REQ-040).

## Acceptance criteria

- After GO, `dig` / the edge shows HOMI as origin for both names; smoke tests of `18` §5.2 pass.
- `curl -sI https://app.kvadro.app/api/meta` shows `cache-control: private, no-store` and the edge's cache status
  `BYPASS` / `DYNAMIC`.
- Limiter buckets keyed by the real client IP (check from two networks).
- Rollback rehearsed in R2 (staging aliases switched instead of public DNS) within 5 minutes.

## Tests

| # | Check | Expected |
| - | ----- | -------- |
| 1 | `dig +short app.kvadro.app` (unproxied) or the edge origin setting (proxied) after GO | HOMI web host / HOMI origin |
| 2 | `curl -sI https://app.kvadro.app/api/meta` | `cache-control: private, no-store`; edge cache status bypass |
| 3 | `curl -sI "https://app.kvadro.app/media/<n>/1.jpg?e=…&s=…"` twice | second response from the edge cache (`HIT`) |
| 4 | requests from two networks to a limited legacy route, then the limiter keys in Redis | two distinct IP buckets |
| 5 | request with a forged `X-Forwarded-For: 1.2.3.4` from a non-edge address (staging) | bucket keyed by the real peer |
| 6 | R2 rollback drill timing | ≤ 5 min |

## Edge cases

- Resolver caches beyond the TTL: some users reach legacy for a while; legacy writes are frozen (T0.2), so they get the
  freeze message, not data loss.
- Cloudflare dropped at S2 and certificates via DNS-01: no edge purge step; nginx cache purge instead.
- `www.` or other aliases discovered in the SEO crawl are switched in the same step.

## Security

SEC-REQ-027, SEC-REQ-033, SEC-REQ-040 (purge on takedown); the purge-only token cannot change DNS; registrar and DNS
credentials remain with the production track only.

## Definition of done

Switch executed at GO with checks recorded in the runbook log, rollback rehearsed in R2, `17` §15 item 13 ticked by the
first developer, the trusted-proxy check recorded (closes the server half of the dropped KV-INF-008).
