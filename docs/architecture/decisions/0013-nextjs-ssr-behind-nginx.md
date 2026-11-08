# ADR-0013: Next.js apps run as SSR servers behind nginx in production

- Status: Accepted
- Date: 2026-11-08
- Deciders: developer ("Next.js в проде — SSR за nginx! так как нам важен очень SEO, GEO, AEO")
- Source: Phase 1 open question (where Next.js SSR runs), `docs/ai/reports/phase-3-notes.md` §B (web-host conventions)

## Context

The three Next.js 16 apps (`landing`, `app`, `arm`) are App Router projects. The mandate and the product depend on discoverability: classic SEO, generative-engine optimisation (GEO) and answer-engine optimisation (AEO) all need server-rendered HTML with complete metadata, structured data and fast first paint — a static export or a client-only SPA cannot deliver per-listing pages, `sitemap.xml`/`robots.txt` generation, `hreflang` for ru/uz/en, or OpenGraph/JSON-LD that reflect live data. On the production web host most frontends today are static builds; the only Node reverse proxy there is `demo.agentim.uz` (`next start` behind nginx with an `upstream … keepalive 32`, `/_next/static/` served from disk as immutable, everything else `try_files $uri @next`).

## Decision

- Every Next.js app is deployed as a long-running Node process (`next start -p <port>`) under a process manager (systemd unit or pm2 — chosen in Phase 6 with the deployment pipeline) on the web host `159.253.19.121` (ADR-0011).
- nginx terminates TLS (one Let's Encrypt certificate per host) and reverse-proxies to the app port with the `demo.agentim.uz` conventions: `upstream` with keepalive, `X-Forwarded-Proto/Host`, `proxy_read_timeout` sized for server actions, `/_next/static/` served from the build directory with a one-year immutable cache, dotfiles denied, per-host logs under `/var/log/nginx/homi/`.
- Port plan (production and staging on the same host, different ports): `landing` 3100, `app` 3101, `arm` 3102; staging 3200–3202. The local ports 3000–3002 stay as they are (ADR-0008).
- `landing` and `app` are SEO/GEO/AEO surfaces: they must emit `generateMetadata`, canonical and `hreflang` links, JSON-LD (`Organization`, `RealEstateListing`/`Offer`, `BreadcrumbList`, `FAQPage` where relevant), `sitemap.xml` and `robots.txt` from live data, and keep listing pages server-rendered (no client-only data fetching for primary content). `arm` is `noindex` and may rely on client rendering more freely.
- Caching: Next's built-in caching (`cacheComponents`, revalidation tags) is the first layer; nginx `proxy_cache` for anonymous HTML is an optimisation decided after the first measurements, never for authenticated responses.
- Images: `next/image` with `images.remotePatterns` limited to the CDN hosts (ADR-0012); the CDN serves pre-derived WebP variants, so the Next image optimiser is not the hot path.

## Consequences

- Phase 6 adds the production vhost templates (`infra/server/nginx/{homi,app.homi,arm.homi}.uz.conf`), process-manager units, a `pnpm -r build` + restart deployment step and health checks on each port.
- CI keeps `pnpm -r build` (a failing SSR build must block merges); Lighthouse/SEO checks join the quality gates once the first public pages exist.
- Memory on the web host: three Node processes per environment (six with staging). To be sized against the host before staging goes live.
- `output: 'export'` is not used; any page that would need it is a design error.

## Alternatives considered

- Static export (`output: 'export'`) served by nginx — rejected: no dynamic listing pages, no per-request metadata, no live sitemaps; contradicts the SEO/GEO/AEO goal.
- Client-side SPA fetching the API — rejected for the same reason.
- Hosting on Vercel — rejected: production stays on the team's own hosts (ADR-0011), and the data (listings, phone hashes) stays in Uzbekistan-controlled infrastructure.
